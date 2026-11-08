// End-to-end check of the auction engine over HTTP using an in-memory MongoDB.  Run: npm test
process.env.USE_MEMORY_DB = 'true';
process.env.ADMIN_KEY = 'test-key';
process.env.MONGODB_URI = ''; // tests must never touch Atlas (dotenv does not override an existing variable)
const http = require('http');
const assert = require('assert');
const { Server } = require('socket.io');
const { connectDb } = require('../config/db');
const { seedAll } = require('./seed');
const engine = require('../engine/auctionEngine');
const { buildApp } = require('../index');

const ME = 'smoke-client-1', OTHER = 'smoke-client-2';
let base;
const call = async (method, path, body, client = ME, headers = {}) => {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-client-id': client, ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await connectDb();
  assert(!/mongodb.net/.test(require('mongoose').connection.host), 'refusing to run tests against Atlas');
  console.log('seed', await seedAll());
  const server = http.createServer(buildApp());
  engine.init(new Server(server));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;

  const players = await call('GET', '/api/players?limit=5&q=green');
  assert.strictEqual(players.body.items[0].soldPrice, 2520);
  assert.strictEqual((await call('POST', '/api/players', { name: 'X' })).status, 401);
  assert.strictEqual((await call('POST', '/api/players', { name: 'Test Guy', country: 'India', role: 'Batter' }, ME, { 'x-admin-key': 'test-key' })).status, 201);

  { // one team per person: switching teams frees the old one, in a multiplayer room too
    const { body: { code: rc } } = await call('POST', '/api/auctions', { mode: 'mini', play: 'multi', hostName: 'Tester' });
    const view = async () => (await call('GET', `/api/auctions/${rc}`)).body;
    const id = async (s) => (await view()).teams.find((t) => t.short === s).team;
    const st = async (s) => (await view()).teams.find((t) => t.short === s);
    const [csk, kkr, rcb] = [await id('CSK'), await id('KKR'), await id('RCB')];
    await call('POST', `/api/auctions/${rc}/claim`, { teamId: csk, name: 'Tester' });
    assert((await st('CSK')).claimed && (await st('CSK')).ownerName === 'Tester', 'name shows under the first team');
    assert.strictEqual((await call('POST', `/api/auctions/${rc}/claim`, { teamId: kkr, name: 'Tester' })).status, 200);
    assert(!(await st('CSK')).claimed && (await st('CSK')).ownerName == null && (await st('CSK')).isBot, 'old team (CSK) is released: no username under it');
    assert((await st('KKR')).claimed && (await st('KKR')).ownerName === 'Tester', 'name now shows under KKR');
    assert((await view()).teams.filter((t) => t.ownerName === 'Tester').length === 1, 'exactly one team shows the username');
    assert.strictEqual((await call('GET', `/api/auctions/${rc}/me`)).body.teamId, kkr, 'after a refresh the user still has KKR only');
    // a failed claim (team taken by someone else) must not cost the user their current team
    await call('POST', `/api/auctions/${rc}/claim`, { teamId: rcb, name: 'Other' }, OTHER);
    assert.strictEqual((await call('POST', `/api/auctions/${rc}/claim`, { teamId: rcb, name: 'Tester' })).status, 409);
    assert((await st('KKR')).claimed && (await st('KKR')).ownerName === 'Tester', 'a refused claim keeps the current team');
    // old rooms that already hold two teams for one person are tidied on refresh
    const Au = require('../models/Auction');
    await Au.updateOne({ code: rc }, { $set: { 'teams.$[t].isBot': false, 'teams.$[t].ownerId': ME, 'teams.$[t].ownerName': 'Tester' } }, { arrayFilters: [{ 't.team': csk }] });
    assert((await view()).teams.filter((t) => t.ownerName === 'Tester').length === 2, 'setup: stale duplicate');
    await call('GET', `/api/auctions/${rc}/me`);
    assert((await view()).teams.filter((t) => t.ownerName === 'Tester').length === 1, 'a stale duplicate is cleaned up');
  }

  const { body: { code } } = await call('POST', '/api/auctions', { mode: 'rapid', hostName: 'Tester', settings: { initialSeconds: 5, resetSeconds: 3, breakSeconds: 1, poolSize: 6, poolOrder: 'sequential' } });
  let a = (await call('GET', `/api/auctions/${code}`)).body;
  const mine = a.teams.find((t) => t.short === 'MI').team;
  assert.strictEqual((await call('POST', `/api/auctions/${code}/start`)).status, 409); // no team yet
  assert.strictEqual((await call('POST', `/api/auctions/${code}/claim`, { teamId: mine, name: 'Tester' })).status, 200);
  assert.strictEqual((await call('POST', `/api/auctions/${code}/claim`, { teamId: mine, name: 'Thief' }, OTHER)).status, 409);
  assert.strictEqual((await call('POST', `/api/auctions/${code}/start`, null, OTHER)).status, 403);
  assert.strictEqual((await call('POST', `/api/auctions/${code}/start`)).status, 200);

  a = (await call('GET', `/api/auctions/${code}`)).body;
  assert.strictEqual(a.live.phase, 'bidding');
  const base0 = a.live.basePrice;
  assert.strictEqual((await call('POST', `/api/auctions/${code}/bid`, { teamId: mine, amount: base0 - 5 })).status, 400);
  assert.strictEqual((await call('POST', `/api/auctions/${code}/bid`, { teamId: mine, amount: base0 + 1 })).status, 400);
  assert.strictEqual((await call('POST', `/api/auctions/${code}/bid`, { teamId: mine, amount: 999999 })).status, 400);
  assert.strictEqual((await call('POST', `/api/auctions/${code}/bid`, { teamId: mine }, OTHER)).status, 403);
  assert.strictEqual((await call('POST', `/api/auctions/${code}/bid`, { teamId: mine })).status, 200);
  assert.strictEqual((await call('POST', `/api/auctions/${code}/bid`, { teamId: mine })).status, 409); // already highest

  // let bots + timers run the whole pool, bidding when we can
  let guard = 0;
  while (a.status !== 'completed' && guard++ < 400) {
    await sleep(500);
    a = (await call('GET', `/api/auctions/${code}`)).body;
    if (a.status === 'live' && a.live.phase === 'bidding' && String(a.live.highestTeam) !== String(mine) && Math.random() < 0.3) await call('POST', `/api/auctions/${code}/bid`, { teamId: mine });
  }
  assert.strictEqual(a.status, 'completed', 'auction should complete');
  const results = (await call('GET', `/api/auctions/${code}/results`)).body;
  assert.strictEqual(results.length, 6);
  const squads = (await call('GET', `/api/auctions/${code}/squads`)).body;
  // purse accounting must reconcile exactly: purse + spent == starting purse, spent == sum of squad prices
  for (const t of a.teams) {
    assert.strictEqual(t.purse + t.spent, a.settings.purse, `${t.short} purse mismatch`);
    const sq = squads.find((s) => s.team.short === t.short);
    const sum = sq ? sq.players.reduce((n, p) => n + p.price, 0) : 0;
    assert.strictEqual(sum, t.spent, `${t.short} squad value mismatch`);
    assert.strictEqual(sq ? sq.players.length : 0, t.count);
    assert(t.purse >= 0);
  }
  const sold = results.filter((r) => r.status === 'sold');
  assert.strictEqual(sold.reduce((n, r) => n + r.price, 0), a.stats.totalSpent);
  console.log(`OK  sold ${a.stats.sold}, unsold ${a.stats.unsold}, total ${a.stats.totalSpent} lakh`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
