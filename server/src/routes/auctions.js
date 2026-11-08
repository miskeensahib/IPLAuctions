const router = require('express').Router();
const Auction = require('../models/Auction');
const AuctionSetting = require('../models/AuctionSetting');
const AuctionResult = require('../models/AuctionResult');
const Squad = require('../models/Squad');
const Bid = require('../models/Bid');
const Team = require('../models/Team');
const Player = require('../models/Player');
const engine = require('../engine/auctionEngine');
const { HttpError, wrap, requireAdmin } = require('../lib/http');
const { checkSettings } = require('../lib/limits');

const cid = (req) => {
  const id = req.get('x-client-id');
  if (!id || id.length < 8 || id.length > 64) throw new HttpError(400, 'Missing x-client-id header');
  return id;
};
const up = (s) => String(s || '').toUpperCase();

// Logout: teams controlled by this browser go back to the bots; nothing else changes.
router.post('/session/logout', wrap(async (req, res) => res.json({ released: await engine.releaseAllFor(cid(req)) })));
router.get('/modes', wrap(async (_req, res) => res.json(await AuctionSetting.find().sort('key').lean())));
router.put('/modes/:key', requireAdmin, wrap(async (req, res) => {
  const allowed = ['label', 'description', 'purse', 'minSquad', 'maxSquad', 'maxOverseas', 'initialSeconds', 'resetSeconds', 'breakSeconds', 'poolSize', 'poolOrder'];
  const set = Object.fromEntries(allowed.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]));
  const current = await AuctionSetting.findOne({ key: req.params.key }).lean();
  if (!current) throw new HttpError(404, 'Mode not found');
  Object.assign(set, checkSettings(set, current)); // same limits the engine enforces when an auction is created
  const m = await AuctionSetting.findOneAndUpdate({ key: req.params.key }, { $set: set }, { returnDocument: 'after', runValidators: true });
  res.json(m);
}));

router.get('/', wrap(async (_req, res) => {
  const list = await Auction.find().sort({ createdAt: -1 }).limit(30)
    .select('code name mode play status hostName poolIndex createdAt').lean();
  res.json(list);
}));

router.post('/', wrap(async (req, res) => {
  const { name, mode, play, settings, hostName } = req.body || {};
  if (play && !['solo', 'multi'].includes(play)) throw new HttpError(400, 'play must be solo or multi');
  const code = await engine.createAuction({ name, mode, play, overrides: settings || {}, clientId: cid(req), hostName });
  res.status(201).json({ code });
}));

// Which team (if any) and whether host, for the calling browser. Read from MongoDB, not trusted from the client.
router.get('/:code/me', wrap(async (req, res) => {
  const id = cid(req);
  const a = await Auction.findOne({ code: up(req.params.code) }).select('hostId teams.team teams.ownerId').lean();
  if (!a) throw new HttpError(404, 'Auction not found');
  res.json({ isHost: a.hostId === id, teamId: a.teams.find((t) => t.ownerId === id)?.team || null });
}));

router.get('/:code', wrap(async (req, res) => res.json(await engine.view(up(req.params.code)))));

router.post('/:code/claim', wrap(async (req, res) => {
  await engine.claimTeam(up(req.params.code), { teamId: req.body.teamId, clientId: cid(req), name: req.body.name });
  res.json(await engine.view(up(req.params.code)));
}));
router.post('/:code/release', wrap(async (req, res) => {
  await engine.releaseTeam(up(req.params.code), { teamId: req.body.teamId, clientId: cid(req) });
  res.json({ ok: true });
}));
router.post('/:code/start', wrap(async (req, res) => { await engine.start(up(req.params.code), cid(req)); res.json({ ok: true }); }));
router.post('/:code/bid', wrap(async (req, res) => {
  await engine.placeBid(up(req.params.code), { teamId: req.body.teamId, clientId: cid(req), amount: req.body.amount });
  res.json({ ok: true });
}));
router.post('/:code/pass', wrap(async (req, res) => {
  await engine.pass(up(req.params.code), { teamId: req.body.teamId, clientId: cid(req) });
  res.json({ ok: true });
}));
router.put('/:code/timer', wrap(async (req, res) => {
  await engine.setBidTimer(up(req.params.code), cid(req), req.body.seconds);
  res.json({ ok: true, options: engine.TIMER_OPTIONS });
}));
router.post('/:code/host/:action', wrap(async (req, res) => {
  await engine.hostAction(up(req.params.code), cid(req), req.params.action);
  res.json({ ok: true });
}));

const find = async (code) => {
  const a = await Auction.findOne({ code: up(code) }).select('_id').lean();
  if (!a) throw new HttpError(404, 'Auction not found');
  return a;
};
// Player strengths, team averages and the ranking. Built ONLY from players SOLD in this auction (unsold / not yet bought
// players never appear), so every sale changes it and the ranking updates itself.
let STATS_DOC = null;
try { STATS_DOC = require('../scripts/playerStats.json'); } catch { /* stats not built yet */ }
const r1 = (x) => Math.round(x * 10) / 10;
router.get('/:code/strength', wrap(async (req, res) => {
  const a = await Auction.findOne({ code: up(req.params.code) }).select('teams.team teams.short teams.name teams.color').lean();
  if (!a) throw new HttpError(404, 'Auction not found');
  const results = await AuctionResult.find({ auction: a._id, status: 'sold' }).sort({ createdAt: 1 }).lean();
  const docs = await Player.find({ _id: { $in: results.map((r) => r.player) } }).select('name role country isOverseas imageThumb team iplStats strength strengthBreakdown strengthNote').lean();
  const byId = new Map(docs.map((p) => [String(p._id), p]));
  const players = results.map((r, i) => {
    const p = byId.get(String(r.player)); if (!p) return null;
    return { id: String(p._id), order: i + 1, name: p.name, role: p.role, country: p.country, isOverseas: p.isOverseas, imageThumb: p.imageThumb, iplTeam: p.team,
      team: r.teamShort, price: r.price, soldAt: r.createdAt, strength: p.strength ?? null, rated: p.strength != null, breakdown: p.strengthBreakdown ?? null, note: p.strengthNote ?? null, stats: p.iplStats ?? null };
  }).filter(Boolean);
  const teams = a.teams.map((t) => {
    const mine = players.filter((p) => p.team === t.short), rated = mine.filter((p) => p.rated);
    const best = rated.reduce((m, p) => (!m || p.strength > m.strength ? p : m), null);
    return { short: t.short, name: t.name, color: t.color, count: mine.length, rated: rated.length,
      avg: rated.length ? r1(rated.reduce((n, p) => n + p.strength, 0) / rated.length) : null, best: best ? { name: best.name, strength: best.strength } : null, rank: null };
  });
  // rank 1 = highest average; equal averages share a rank; teams with no rated player yet are unranked
  const ranked = teams.filter((t) => t.avg !== null).sort((x, y) => y.avg - x.avg || y.rated - x.rated || x.name.localeCompare(y.name));
  let rank = 0, prev = null;
  ranked.forEach((t, i) => { if (t.avg !== prev) rank = i + 1; t.rank = rank; prev = t.avg; });
  teams.sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99) || x.name.localeCompare(y.name));
  res.json({ teams, players, source: STATS_DOC?.source ?? null, method: STATS_DOC?.method ?? [] });
}));
router.get('/:code/results', wrap(async (req, res) => {
  const a = await find(req.params.code);
  const f = { auction: a._id };
  if (['sold', 'unsold'].includes(req.query.status)) f.status = req.query.status;
  res.json(await AuctionResult.find(f).sort({ createdAt: -1 }).populate('player', 'name role country slug isOverseas imageThumb team').lean());
}));
router.get('/:code/squads', wrap(async (req, res) => {
  const a = await find(req.params.code);
  res.json(await Squad.find({ auction: a._id }).populate('players.player', 'name role country slug isOverseas imageThumb team').populate('team', 'short name color').lean());
}));
router.get('/:code/bids', wrap(async (req, res) => {
  const a = await find(req.params.code);
  const f = { auction: a._id };
  if (req.query.player) f.player = req.query.player;
  res.json(await Bid.find(f).sort({ createdAt: -1 }).limit(100).lean());
}));

module.exports = router;
