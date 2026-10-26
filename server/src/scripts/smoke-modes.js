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
  engine.init(new Server(server));
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

  console.log('OK modes');
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
