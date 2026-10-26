const router = require('express').Router();
const mongoose = require('mongoose');
const Watchlist = require('../models/Watchlist');
const Player = require('../models/Player');
const { HttpError, wrap } = require('../lib/http');

const cid = (req) => {
  const id = req.get('x-client-id');
  if (!id || id.length < 8 || id.length > 64) throw new HttpError(400, 'Missing x-client-id header');
  return id;
};
const pid = (req) => {
  if (!mongoose.isValidObjectId(req.params.playerId)) throw new HttpError(400, 'Invalid player id');
  return req.params.playerId;
};

router.get('/', wrap(async (req, res) => {
  const rows = await Watchlist.find({ clientId: cid(req) }).select('player').lean();
  res.json(rows.map((r) => String(r.player)));
}));

router.put('/:playerId', wrap(async (req, res) => {
  const player = pid(req);
  if (!(await Player.exists({ _id: player }))) throw new HttpError(404, 'Player not found');
  await Watchlist.updateOne({ clientId: cid(req), player }, { $setOnInsert: { clientId: cid(req), player } }, { upsert: true });
  res.json({ ok: true });
}));

router.delete('/:playerId', wrap(async (req, res) => {
  await Watchlist.deleteOne({ clientId: cid(req), player: pid(req) });
  res.json({ ok: true });
}));

module.exports = router;
