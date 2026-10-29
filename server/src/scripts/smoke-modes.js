// Checks Mega/Mini rules, timer permissions, logout and image coverage. Run: npm test
process.env.USE_MEMORY_DB = 'true';
process.env.ADMIN_KEY = 'test-key';
process.env.MONGODB_URI = ''; // tests must never touch Atlas (dotenv does not override an existing variable)
const http = require('http');
const assert = require('assert');
const { Server } = require('socket.io');
const { connectDb } = require('../config/db');
const { seedAll } = require('./seed');
const engine = require('../engine/auctionEngine');
const Auction = require('../models/Auction');
const { buildApp } = require('../index');

const HOST = 'host-client-0001', GUEST = 'guest-client-0002';
let base;
const call = async (method, path, body, client = HOST) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-client-id': client }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const view = async (code) => (await call('GET', `/api/auctions/${code}`)).body;

async function newAuction(mode, settings, claim = 'MI') {
  const c = await call('POST', '/api/auctions', { mode, hostName: 'T', settings });
  if (c.status !== 201) return c;
  const code = c.body.code;
  const a = await view(code);
  const team = a.teams.find((t) => t.short === claim).team;
  await call('POST', `/api/auctions/${code}/claim`, { teamId: team, name: 'T' });
  return { status: 201, code, team };
}

(async () => {
  await connectDb();
  assert(!/mongodb.net/.test(require('mongoose').connection.host), 'refusing to run tests against Atlas');
  console.log('seed', await seedAll());
  console.log('reseed (should be a no-op)', await seedAll());
  const server = http.createServer(buildApp());
  const io = new Server(server);
  const emitted = []; // record what is sent to watching clients
  const realTo = io.to.bind(io);
  io.to = (room) => { const r = realTo(room); return { emit: (ev, p) => { emitted.push({ ev, p, at: Date.now() }); return r.emit(ev, p); } }; };
  engine.init(io);
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;

  // --- images + pool ---
  const all = [];
  for (let page = 1; page <= 2; page++) all.push(...(await call('GET', `/api/players?limit=200&page=${page}`)).body.items);
  assert.strictEqual(all.length, 274, 'full pool');
  assert(all.every((p) => /^https:\/\/www\.iplt20\.com\//.test(p.imageThumb)), 'every player has an image URL');
  assert.strictEqual(new Set(all.map((p) => p.imageThumb)).size, all.length, 'no image shared between players');
  for (const n of ['Virat Kohli', 'Rohit Sharma', 'Mahendra Singh Dhoni']) assert(all.some((p) => p.name === n && p.marqueeRank), n);

  // --- presets ---
  const modes = (await call('GET', '/api/auctions/modes')).body;
  const mega = modes.find((m) => m.key === 'mega'), mini = modes.find((m) => m.key === 'mini');
  assert.deepStrictEqual([mega.purse, mega.minSquad, mega.maxSquad], [12000, 18, 25]);
  assert.deepStrictEqual([mini.purse, mini.maxSquad], [9000, 18]);

  // --- mega ---
  const m = await newAuction('mega', { initialSeconds: 20, resetSeconds: 20 });
  assert.strictEqual(m.status, 201);
  assert.strictEqual((await call('POST', `/api/auctions/${m.code}/start`)).status, 200);
  let a = await view(m.code);
  assert.strictEqual(a.mode, 'mega'); assert.strictEqual(a.poolTotal, 274);
  assert.strictEqual(a.live.player.name, 'Virat Kohli', 'marquee order starts with Kohli');
  assert(a.live.player.imageThumb);
  const bid = (amount, client = HOST) => call('POST', `/api/auctions/${m.code}/bid`, { teamId: m.team, amount }, client);
  let r = await bid(11500);
  assert.strictEqual(r.status, 409); assert(/minimum squad of 18/.test(r.body.error), r.body.error);
  assert.strictEqual((await bid(12005)).status, 400); // beyond purse
  // squad cap
  await Auction.updateOne({ code: m.code, 'teams.team': m.team }, { $set: { 'teams.$.count': 25 } });
  r = await bid(); assert.strictEqual(r.status, 409); assert(/Squad is full \(25\)/.test(r.body.error), r.body.error);
  await Auction.updateOne({ code: m.code, 'teams.team': m.team }, { $set: { 'teams.$.count': 0 } });
  assert.strictEqual((await bid()).status, 200);

  // --- timer: permissions, validation, ongoing lot untouched, persisted + broadcast view ---
  const endsBefore = (await view(m.code)).live.endsAt;
  assert.strictEqual((await call('PUT', `/api/auctions/${m.code}/timer`, { seconds: 5 }, GUEST)).status, 403);
  assert.strictEqual((await call('PUT', `/api/auctions/${m.code}/timer`, { seconds: 7 })).status, 400);
  assert.strictEqual((await call('PUT', `/api/auctions/${m.code}/timer`, { seconds: 5 })).status, 200);
  a = await view(m.code);
  assert.strictEqual(a.settings.initialSeconds, 5); assert.strictEqual(a.settings.resetSeconds, 5);
  assert.strictEqual(a.live.endsAt, endsBefore, 'running lot clock unchanged');

  // --- pool feasibility message ---
  const bad = await call('POST', '/api/auctions', { mode: 'mega', settings: { poolSize: 50 } });
  assert.strictEqual(bad.status, 400); assert(/need at least 18/.test(bad.body.error), bad.body.error);

  // --- mini ---
  const n = await newAuction('mini', {}, 'CSK');
  const sn = (await view(n.code)).settings;
  assert.deepStrictEqual([sn.purse, sn.maxSquad], [9000, 18]);
  await call('POST', `/api/auctions/${n.code}/start`);
  r = await call('POST', `/api/auctions/${n.code}/bid`, { teamId: n.team, amount: 9005 });
  assert.strictEqual(r.status, 400); assert(/purse/i.test(r.body.error));
  await Auction.updateOne({ code: n.code, 'teams.team': n.team }, { $set: { 'teams.$.count': 18 } });
  r = await call('POST', `/api/auctions/${n.code}/bid`, { teamId: n.team });
  assert.strictEqual(r.status, 409); assert(/Squad is full \(18\)/.test(r.body.error));

  // --- /me comes from the database, per browser identity ---
  let me = (await call('GET', `/api/auctions/${m.code}/me`)).body;
  assert.deepStrictEqual([me.isHost, me.teamId], [true, m.team]);
  me = (await call('GET', `/api/auctions/${m.code}/me`, null, GUEST)).body;
  assert.deepStrictEqual([me.isHost, me.teamId], [false, null]);

  // --- watchlist is stored in MongoDB per identity ---
  const pid = all[0]._id;
  assert.strictEqual((await call('PUT', `/api/watchlist/${pid}`)).status, 200);
  assert.strictEqual((await call('PUT', `/api/watchlist/${pid}`)).status, 200); // idempotent
  assert.deepStrictEqual((await call('GET', '/api/watchlist')).body, [pid]);
  assert.deepStrictEqual((await call('GET', '/api/watchlist', null, GUEST)).body, []);
  assert.strictEqual((await call('PUT', '/api/watchlist/not-an-id')).status, 400);
  assert.strictEqual((await call('PUT', '/api/watchlist/507f1f77bcf86cd799439011')).status, 404);
  assert.strictEqual((await call('DELETE', `/api/watchlist/${pid}`)).status, 200);
  assert.deepStrictEqual((await call('GET', '/api/watchlist')).body, []);

  // --- health reports the database; API fails loudly (503) when it is down ---
  assert.strictEqual((await call('GET', '/api/health')).body.db, 'connected');
  const mongoose = require('mongoose');
  const memUri = mongoose.connection.getClient().s.url;
  await mongoose.connection.close();
  r = await call('GET', '/api/players'); assert.strictEqual(r.status, 503); assert(/unavailable/i.test(r.body.error));
  assert.strictEqual((await call('GET', '/api/health')).status, 503);
  await mongoose.connect(memUri);

  // --- logout hands teams back to bots without touching results ---
  r = await call('POST', '/api/auctions/session/logout');
  assert.strictEqual(r.status, 200); assert(r.body.released >= 2);
  a = await view(m.code);
  const mine = a.teams.find((t) => t.team === m.team);
  assert.strictEqual(mine.isBot, true); assert.strictEqual(mine.ownerName, null);
  assert.strictEqual((await bid()).status, 403, 'logged-out client can no longer bid');

  // --- admin key check ---
  assert.strictEqual((await call('GET', '/api/admin/check')).status, 401, 'no key rejected');
  const adminCall = async (key) => { const r = await fetch(base + '/api/admin/check', { headers: { 'x-admin-key': key } }); return r.status; };
  assert.strictEqual(await adminCall('wrong'), 401, 'wrong key rejected');
  assert.strictEqual(await adminCall('test-key'), 200, 'correct key accepted');
  assert.strictEqual((await fetch(base + '/api/auctions/modes/mini', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-client-id': HOST }, body: '{"purse":1}' })).status, 401, 'presets cannot be changed without the key');

  // --- preset validation + admin save ---
  const put = (body, key = 'test-key') => fetch(base + '/api/auctions/modes/rapid', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-key': key }, body: JSON.stringify(body) });
  assert.strictEqual((await put({ initialSeconds: 1015 })).status, 400, 'absurd timer rejected');
  assert.strictEqual((await put({ minSquad: 20, maxSquad: 10 })).status, 400, 'min > max rejected');
  assert.strictEqual((await put({ poolOrder: 'bogus' })).status, 400, 'bad order rejected');
  const okPut = await put({ initialSeconds: 15 }); assert.strictEqual(okPut.status, 200);
  assert.strictEqual((await okPut.json()).initialSeconds, 15, 'valid preset saved');
  assert.strictEqual((await call('GET', '/api/auctions/modes')).body.find((x) => x.key === 'rapid').initialSeconds, 15, 'saved value read back from the database');

  // --- admin: auctions CRUD + bid log ---
  const adm = async (method, path, body, key = 'test-key') => { const r = await fetch(base + '/api/admin' + path, { method, headers: { 'content-type': 'application/json', 'x-client-id': HOST, 'x-admin-key': key }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  assert.strictEqual((await adm('GET', '/auctions', null, 'nope')).status, 401, 'auction admin needs the key');
  assert.strictEqual((await adm('DELETE', '/auctions/XXXXXX', null, 'nope')).status, 401);
  // CREATE
  const mk = await adm('POST', '/auctions', { name: 'Admin Made', mode: 'mini', play: 'multi', hostName: 'Boss' });
  assert.strictEqual(mk.status, 201); const acode = mk.body.code;
  // READ list + detail
  let lst = (await adm('GET', '/auctions')).body;
  const row = lst.find((x) => x.code === acode);
  assert(row && row.name === 'Admin Made' && row.status === 'lobby' && row.poolTotal === 274 && row.bids === 0, 'new auction listed');
  assert(lst.find((x) => x.code === m.code).bids >= 1 && lst.find((x) => x.code === m.code).bidsByUsers >= 1, 'bid counts per auction');
  // UPDATE (lobby): name, host, rules -> teams get the new purse
  assert.strictEqual((await adm('PUT', `/auctions/${acode}`, { name: '  Renamed  ', hostName: 'Boss2', purse: 8000, maxSquad: 15 })).status, 200);
  let det = (await adm('GET', `/auctions/${acode}`)).body;
  assert.deepStrictEqual([det.name, det.hostName, det.settings.purse, det.settings.maxSquad], ['Renamed', 'Boss2', 8000, 15]);
  assert.strictEqual(det.poolTotal, 274, 'detail reports the pool size');
  assert(det.teams.every((t) => t.purse === 8000) && det.teams.every((t) => t.ownerId === undefined), 'purses follow the new rule; owner ids not exposed');
  // validation
  assert.strictEqual((await adm('PUT', `/auctions/${acode}`, { purse: 5 })).status, 400);
  assert.strictEqual((await adm('PUT', `/auctions/${acode}`, { name: '   ' })).status, 400);
  assert.strictEqual((await adm('PUT', `/auctions/${acode}`, {})).status, 400);
  assert.strictEqual((await adm('PUT', `/auctions/NOPE00`, { name: 'x' })).status, 404);
  // BID LOG: the earlier human bid (mega auction m) records the user's name; bots have none
  const log = (await adm('GET', `/auctions/${m.code}/bids?limit=100`)).body;
  assert(log.total >= 1 && log.items.every((b) => b.player && b.player.name), 'bid log has player names');
  const humanBids = log.items.filter((b) => !b.byBot);
  assert(humanBids.length >= 1 && humanBids.every((b) => b.bidderName === 'T' && b.teamShort === 'MI'), 'human bids carry the bidder name');
  assert((await adm('GET', `/auctions/${m.code}/bids?human=true`)).body.items.every((b) => !b.byBot), 'human-only filter');
  assert((await adm('GET', `/auctions/${m.code}/bids?team=MI`)).body.items.every((b) => b.teamShort === 'MI'), 'team filter');
  assert((await adm('GET', `/auctions/${m.code}/bids?q=zzzznoplayer`)).body.total === 0, 'player-name filter');
  // rules locked once started; timers still editable; finished = rename only
  await call('POST', `/api/auctions/${acode}/claim`, { teamId: det.teams[0].team, name: 'Zed' });
  assert.strictEqual((await call('POST', `/api/auctions/${acode}/start`)).status, 200);
  assert.strictEqual((await adm('PUT', `/auctions/${acode}`, { purse: 9000 })).status, 409, 'purse locked after start');
  assert.strictEqual((await adm('PUT', `/auctions/${acode}`, { initialSeconds: 12, resetSeconds: 12 })).status, 200, 'timers editable while running');
  assert.strictEqual((await adm('POST', `/auctions/${acode}/end`)).status, 200, 'admin can end a running auction');
  assert.strictEqual((await adm('GET', `/auctions/${acode}`)).body.status, 'completed');
  assert.strictEqual((await adm('PUT', `/auctions/${acode}`, { initialSeconds: 9 })).status, 409, 'finished auction: no rule edits');
  assert.strictEqual((await adm('PUT', `/auctions/${acode}`, { name: 'Done' })).status, 200, 'finished auction can still be renamed');
  // DELETE cascades
  const AuctionModel = require('../models/Auction'), BidM = require('../models/Bid'), ResM = require('../models/AuctionResult'), SqM = require('../models/Squad');
  const doc = await AuctionModel.findOne({ code: m.code }).select('_id').lean();
  const before = [await BidM.countDocuments({ auction: doc._id }), await ResM.countDocuments({ auction: doc._id })];
  assert(before[0] >= 1, 'there is something to delete');
  const del = await adm('DELETE', `/auctions/${m.code}`);
  assert.strictEqual(del.status, 200); assert.strictEqual(del.body.removed.bids, before[0]);
  assert.strictEqual(await AuctionModel.countDocuments({ code: m.code }), 0);
  assert.deepStrictEqual([await BidM.countDocuments({ auction: doc._id }), await ResM.countDocuments({ auction: doc._id }), await SqM.countDocuments({ auction: doc._id })], [0, 0, 0], 'bids/results/squads removed with it');
  assert.strictEqual((await call('GET', `/api/auctions/${m.code}`)).status, 404, 'deleted auction is gone for everyone');
  assert.strictEqual((await adm('DELETE', `/auctions/${m.code}`)).status, 404, 'deleting twice is a clean 404');
  await adm('DELETE', `/auctions/${acode}`);

  // --- pause / resume ---
  const P = await newAuction('rapid', { initialSeconds: 5, resetSeconds: 5, poolSize: 8, poolOrder: 'sequential' }, 'RR');
  await call('POST', `/api/auctions/${P.code}/start`);
  await new Promise((r) => setTimeout(r, 1200));
  const hostCall = (action, client = HOST) => call('POST', `/api/auctions/${P.code}/host/${action}`, null, client);
  const pre = await view(P.code);
  assert.strictEqual((await hostCall('pause', GUEST)).status, 403, 'only the host can pause');
  emitted.length = 0;
  assert.strictEqual((await hostCall('pause')).status, 200, 'pause');
  let pv = await view(P.code);
  assert.strictEqual(pv.status, 'paused');
  assert(pv.live.remainingMs >= 1000 && pv.live.remainingMs <= 5000, 'remaining time saved: ' + pv.live.remainingMs);
  const pp = emitted.find((e) => e.ev === 'auction:patch');
  assert(pp && pp.p.status === 'paused' && pp.p.live.rev === pre.live.rev && pp.p.live.remainingMs === pv.live.remainingMs, 'instant patch message sent on pause');
  assert.deepStrictEqual(engine.timerKinds(P.code), [], 'every timer is stopped while paused');
  assert((await hostCall('pause')).status === 409, 'pausing twice is a clean 409');
  assert.strictEqual((await call('POST', `/api/auctions/${P.code}/bid`, { teamId: P.team })).status, 409, 'no bids while paused');
  await new Promise((r) => setTimeout(r, 6500)); // longer than the whole timer: nothing may close while paused
  pv = await view(P.code);
  assert(pv.status === 'paused' && pv.live.phase === 'bidding' && pv.live.rev === pre.live.rev && pv.stats.sold + pv.stats.unsold === 0, 'lot does not close while paused');
  emitted.length = 0;
  assert.strictEqual((await hostCall('resume', GUEST)).status, 403, 'only the host can resume');
  assert.strictEqual((await hostCall('resume')).status, 200, 'resume');
  const rv = await view(P.code);
  assert.strictEqual(rv.status, 'live');
  const left = new Date(rv.live.endsAt).getTime() - rv.serverNow;
  assert(left > 500 && left <= pv.live.remainingMs + 1500, 'clock resumes from the saved time (' + left + ' ms left, saved ' + pv.live.remainingMs + ')');
  const rp = emitted.find((e) => e.ev === 'auction:patch');
  assert(rp && rp.p.status === 'live' && rp.p.live.endsAt, 'instant patch message sent on resume');
  assert((await hostCall('resume')).status === 409, 'resuming twice is a clean 409');
  assert(engine.timerKinds(P.code).includes('close'), 'the close timer is re-armed after resume (the lot will end by itself)');
  await adm('DELETE', `/auctions/${P.code}`);

  console.log('OK modes');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
