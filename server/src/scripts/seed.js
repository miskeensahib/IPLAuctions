require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const Team = require('../models/Team');
const Player = require('../models/Player');
const AuctionSetting = require('../models/AuctionSetting');
const { TEAMS, PRESETS, PLAYERS, SEED_VERSION, LEGACY_SLUGS } = require('./seedData');

// A duplicate-key error just means "already at this seed version", which is what we want to skip.
const ignoreDup = (e) => { if (!(e.writeErrors || [e]).every((w) => (w.err?.code ?? w.code) === 11000)) throw e; return e.result; };

// Idempotent and non-destructive: records are rewritten only when their seedVersion is older than the
// current one, so later edits made in the Admin Panel survive restarts. basePrice is never overwritten.
async function seedAll() {
  await Promise.all(TEAMS.map((t) => Team.updateOne({ short: t.short }, { $set: t }, { upsert: true })));
  for (const p of PRESETS) {
    await AuctionSetting.updateOne({ key: p.key, version: { $ne: SEED_VERSION } }, { $set: { ...p, version: SEED_VERSION } }, { upsert: true }).catch(ignoreDup);
  }
  const legacy = await Player.deleteMany({ slug: { $in: LEGACY_SLUGS }, seedVersion: { $lt: SEED_VERSION } });
  const ops = PLAYERS.map((p) => ({ updateOne: { filter: { slug: p.slug, seedVersion: { $ne: SEED_VERSION } }, update: { $set: p }, upsert: true } }));
  const r = await Player.bulkWrite(ops, { ordered: false }).catch(ignoreDup);
  return { teams: TEAMS.length, presets: PRESETS.length, players: await Player.countDocuments(), updated: (r?.upsertedCount || 0) + (r?.modifiedCount || 0), legacyRemoved: legacy.deletedCount };
}

if (require.main === module) {
  connectDb()
    .then(() => seedAll())
    .then((r) => { console.log('[seed]', r); return mongoose.disconnect(); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { seedAll };
