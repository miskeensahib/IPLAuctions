const router = require('express').Router();
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const AuctionResult = require('../models/AuctionResult');
const Squad = require('../models/Squad');
const Player = require('../models/Player');
const engine = require('../engine/auctionEngine');
const { HttpError, wrap, requireAdmin } = require('../lib/http');
const { checkSettings } = require('../lib/limits');

router.use(requireAdmin); // every route below needs the ADMIN_KEY

const up = (s) => String(s || '').toUpperCase();
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const human = { byBot: { $ne: true } };
const clientId = (req) => {
  const id = req.get('x-client-id');
  if (!id || id.length < 8 || id.length > 64) throw new HttpError(400, 'Missing x-client-id header');
  return id;
};
const find = async (code) => {
  const a = await Auction.findOne({ code: up(code) }).select('-pool').lean();
  if (!a) throw new HttpError(404, 'Auction not found');
  return a;
};

// ---- READ: every auction with its bid / result counts ----
router.get('/auctions', wrap(async (_req, res) => {
  const list = await Auction.aggregate([
    { $sort: { createdAt: -1 } }, { $limit: 300 },
    { $project: { code: 1, name: 1, mode: 1, play: 1, status: 1, hostName: 1, createdAt: 1, poolTotal: { $size: '$pool' }, poolIndex: 1, purse: '$settings.purse', maxSquad: '$settings.maxSquad', players: { $map: { input: { $filter: { input: '$teams', cond: { $eq: ['$$this.isBot', false] } } }, as: 't', in: '$$t.ownerName' } } } },
  ]);
  const ids = list.map((a) => a._id);
  const [bids, results] = await Promise.all([
    Bid.aggregate([{ $match: { auction: { $in: ids } } }, { $group: { _id: '$auction', total: { $sum: 1 }, byUsers: { $sum: { $cond: [{ $eq: ['$byBot', true] }, 0, 1] } } } }]),
    AuctionResult.aggregate([{ $match: { auction: { $in: ids } } }, { $group: { _id: { a: '$auction', s: '$status' }, n: { $sum: 1 }, spent: { $sum: '$price' } } }]),
  ]);
  const b = new Map(bids.map((x) => [String(x._id), x]));
  res.json(list.map((a) => {
    const bb = b.get(String(a._id)) || { total: 0, byUsers: 0 };
    const sold = results.find((r) => String(r._id.a) === String(a._id) && r._id.s === 'sold');
    const unsold = results.find((r) => String(r._id.a) === String(a._id) && r._id.s === 'unsold');
    return { ...a, bids: bb.total, bidsByUsers: bb.byUsers, sold: sold?.n || 0, unsold: unsold?.n || 0, totalSpent: sold?.spent || 0 };
  }));
}));

// ---- READ: one auction (settings, teams with owners, results) ----
router.get('/auctions/:code', wrap(async (req, res) => {
  const a = await find(req.params.code);
  const [results, bids, byUsers, size] = await Promise.all([
    AuctionResult.find({ auction: a._id }).sort({ createdAt: -1 }).populate('player', 'name role').lean(),
    Bid.countDocuments({ auction: a._id }),
    Bid.countDocuments({ auction: a._id, ...human }),
    Auction.aggregate([{ $match: { _id: a._id } }, { $project: { n: { $size: '$pool' } } }]),
  ]);
  res.json({ ...a, hostId: undefined, teams: a.teams.map(({ ownerId, ...t }) => t), results, bids, bidsByUsers: byUsers, poolTotal: size[0]?.n ?? 0 });
}));

// ---- READ: bid log (who bid what), paged, filterable ----
router.get('/auctions/:code/bids', wrap(async (req, res) => {
  const a = await find(req.params.code);
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
  const f = { auction: a._id };
  if (req.query.human === 'true') Object.assign(f, human);
  if (req.query.team) f.teamShort = up(req.query.team);
  if (req.query.q) f.player = { $in: (await Player.find({ name: new RegExp(esc(req.query.q), 'i') }).select('_id').limit(200).lean()).map((p) => p._id) };
  const [items, total] = await Promise.all([
    Bid.find(f).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('player', 'name role').lean(),
    Bid.countDocuments(f),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

// ---- CREATE: a new auction (lobby); the admin's browser becomes its host ----
router.post('/auctions', wrap(async (req, res) => {
  const { name, mode, play, hostName, settings } = req.body || {};
  if (play && !['solo', 'multi'].includes(play)) throw new HttpError(400, 'play must be solo or multi');
  const code = await engine.createAuction({ name, mode, play, overrides: settings || {}, clientId: clientId(req), hostName: hostName || 'Admin' });
  res.status(201).json({ code });
}));

// ---- UPDATE: name / host name any time; timers until it finishes; rules only before it starts ----
const RULES = ['purse', 'minSquad', 'maxSquad', 'maxOverseas'];
const TIMERS = ['initialSeconds', 'resetSeconds'];
router.put('/auctions/:code', wrap(async (req, res) => {
  const a = await find(req.params.code);
  const b = req.body || {};
  const $set = {};
  if (b.name !== undefined) { const n = String(b.name).trim(); if (!n) throw new HttpError(400, 'name cannot be empty'); $set.name = n.slice(0, 60); }
  if (b.hostName !== undefined) { const n = String(b.hostName).trim(); if (!n) throw new HttpError(400, 'hostName cannot be empty'); $set.hostName = n.slice(0, 30); }
  const patch = {};
  for (const k of [...RULES, ...TIMERS]) if (b[k] !== undefined) patch[k] = b[k];
  if (Object.keys(patch).length) {
    if (a.status === 'completed') throw new HttpError(409, 'This auction is finished; only its name and host name can be edited');
    if (RULES.some((k) => patch[k] !== undefined) && a.status !== 'lobby') throw new HttpError(409, 'Purse and squad rules can only be changed before the auction starts');
    const clean = checkSettings(patch, a.settings);
    if (clean.minSquad) {
      const poolLen = (await Auction.findOne({ code: a.code }).select('pool').lean()).pool.length;
      if (poolLen < a.teams.length * clean.minSquad) throw new HttpError(400, `The pool has ${poolLen} players, not enough for ${a.teams.length} teams of ${clean.minSquad}`);
    }
    for (const [k, v] of Object.entries(clean)) $set[`settings.${k}`] = v;
    if (clean.purse !== undefined) $set['teams.$[].purse'] = clean.purse; // lobby: nobody has spent anything yet
  }
  if (!Object.keys($set).length) throw new HttpError(400, 'Nothing to update');
  await Auction.updateOne({ _id: a._id }, { $set });
  await engine.broadcast(a.code);
  res.json({ ok: true });
}));

// ---- UPDATE: force-end a running auction ----
router.post('/auctions/:code/end', wrap(async (req, res) => {
  const a = await Auction.findOne({ code: up(req.params.code) }).select('hostId status').lean();
  if (!a) throw new HttpError(404, 'Auction not found');
  await engine.hostAction(up(req.params.code), a.hostId, 'end');
  res.json({ ok: true });
}));

// ---- DELETE: the auction and everything recorded for it ----
router.delete('/auctions/:code', wrap(async (req, res) => {
  const removed = await engine.deleteAuction(up(req.params.code));
  if (!removed) throw new HttpError(404, 'Auction not found');
  res.json({ ok: true, removed });
}));

module.exports = router;
