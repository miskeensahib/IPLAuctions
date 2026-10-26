const router = require('express').Router();
const Team = require('../models/Team');
const Player = require('../models/Player');
const { HttpError, wrap, requireAdmin } = require('../lib/http');

router.get('/', wrap(async (_req, res) => res.json(await Team.find().sort('short').lean())));

// Official 2026 auction results per franchise (from player records)
router.get('/official-results', wrap(async (_req, res) => {
  res.json(await Player.aggregate([
    { $match: { auctionStatus: 'sold' } },
    { $group: { _id: '$soldTo', players: { $sum: 1 }, spent: { $sum: '$soldPrice' } } },
    { $sort: { spent: -1 } },
  ]));
}));

router.put('/:id', requireAdmin, wrap(async (req, res) => {
  const set = {};
  for (const k of ['name', 'color', 'accent']) if (req.body[k]) set[k] = String(req.body[k]);
  const t = await Team.findByIdAndUpdate(req.params.id, { $set: set }, { returnDocument: 'after' });
  if (!t) throw new HttpError(404, 'Team not found');
  res.json(t);
}));

module.exports = router;
