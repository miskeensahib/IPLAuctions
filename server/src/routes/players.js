const router = require('express').Router();
const Player = require('../models/Player');
const { HttpError, wrap, requireAdmin } = require('../lib/http');
const { slugify } = require('../scripts/seedData');

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FIELDS = ['name', 'country', 'role', 'team', 'imageThumb', 'marqueeRank', 'previousTeam', 'basePrice', 'basePriceVerified', 'auctionStatus', 'soldTo', 'soldPrice', 'profileVerified', 'image', 'source', 'notes', 'stats'];
const pick = (body) => Object.fromEntries(FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const prep = (data) => {
  if (data.country !== undefined) data.isOverseas = String(data.country).trim().toLowerCase() !== 'india';
  for (const k of ['basePrice', 'soldPrice']) {
    if (data[k] !== undefined && data[k] !== null) {
      data[k] = Number(data[k]);
      if (!Number.isFinite(data[k]) || data[k] < 0) throw new HttpError(400, `${k} must be a non-negative number (lakhs)`);
    }
  }
  return data;
};

router.get('/', wrap(async (req, res) => {
  const { q, role, country, team, status, overseas, sort = 'name' } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const f = {};
  if (q) f.name = new RegExp(esc(q), 'i');
  if (role) f.role = role;
  if (country) f.country = country;
  if (team) f.$or = [{ team }, { soldTo: team }];
  if (status) f.auctionStatus = status;
  if (overseas === 'true' || overseas === 'false') f.isOverseas = overseas === 'true';
  const sortMap = { marquee: { marqueeRank: 1, name: 1 }, name: { name: 1 }, price: { soldPrice: -1 }, base: { basePrice: -1 } };
  const [items, total] = await Promise.all([
    Player.find(f).sort(sortMap[sort] || sortMap.name).skip((page - 1) * limit).limit(limit).lean(),
    Player.countDocuments(f),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

router.get('/:id', wrap(async (req, res) => {
  const p = await Player.findById(req.params.id).lean().catch(() => null);
  if (!p) throw new HttpError(404, 'Player not found');
  res.json(p);
}));

router.post('/', requireAdmin, wrap(async (req, res) => {
  const data = prep(pick(req.body));
  if (!data.name) throw new HttpError(400, 'name is required');
  data.slug = slugify(data.name);
  if (await Player.exists({ slug: data.slug })) throw new HttpError(409, 'Player with this name already exists');
  res.status(201).json(await Player.create(data));
}));

router.post('/bulk', requireAdmin, wrap(async (req, res) => {
  const list = Array.isArray(req.body) ? req.body : req.body.players;
  if (!Array.isArray(list) || !list.length || list.length > 1000) throw new HttpError(400, 'Send 1-1000 players as an array');
  const ops = list.map((raw) => {
    const d = prep(pick(raw));
    if (!d.name) throw new HttpError(400, 'Every player needs a name');
    const slug = slugify(d.name);
    return { updateOne: { filter: { slug }, update: { $set: d, $setOnInsert: { slug } }, upsert: true } };
  });
  const r = await Player.bulkWrite(ops);
  res.json({ inserted: r.upsertedCount, updated: r.modifiedCount });
}));

router.put('/:id', requireAdmin, wrap(async (req, res) => {
  const p = await Player.findByIdAndUpdate(req.params.id, { $set: prep(pick(req.body)) }, { returnDocument: 'after', runValidators: true });
  if (!p) throw new HttpError(404, 'Player not found');
  res.json(p);
}));

router.delete('/:id', requireAdmin, wrap(async (req, res) => {
  const p = await Player.findByIdAndDelete(req.params.id);
  if (!p) throw new HttpError(404, 'Player not found');
  res.json({ ok: true });
}));

module.exports = router;
