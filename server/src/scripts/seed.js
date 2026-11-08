require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const { connectDb } = require('../config/db');
const Team = require('../models/Team');
const Player = require('../models/Player');
const AuctionSetting = require('../models/AuctionSetting');
const { TEAMS, PRESETS, PLAYERS, SEED_VERSION, LEGACY_SLUGS, RENAMES, slugify } = require('./seedData');

const STATS_VERSION = 3; // bump after re-running buildStats.js
let STATS = null;
try { STATS = require('./playerStats.json'); } catch { /* run `npm run build-stats` to create it */ }

// Career stats + Strength per player (from playerStats.json). Written once per STATS_VERSION; players without any IPL
// record get null ("unrated"), never an invented number.
async function seedStats() {
  if (!STATS) return 0;
  const ops = Object.entries(STATS.players).map(([slug, x]) => ({ updateOne: {
    filter: { slug, statsVersion: { $ne: STATS_VERSION } },
    update: { $set: {
      iplStats: x.matched ? x.stats : null,
      strength: typeof x.strength === 'number' ? x.strength : null,
      strengthKind: x.kind || null,
      strengthBreakdown: x.breakdown || null,
      strengthNote: x.note || null,
      statsMatchName: x.cricsheetName || null,
      statsVersion: STATS_VERSION,
    } },
  } }));
  const r = await Player.bulkWrite(ops, { ordered: false });
  return r.modifiedCount;
}

// A duplicate-key error just means "already at this seed version", which is what we want to skip.
const ignoreDup = (e) => { if (!(e.writeErrors || [e]).every((w) => (w.err?.code ?? w.code) === 11000)) throw e; return e.result; };

// Idempotent and non-destructive: records are rewritten only when their seedVersion is older than the
// current one, so later edits made in the Admin Panel survive restarts. basePrice is never overwritten.
async function seedAll() {
  // Fast path: everything is already at the current seed version, so there is nothing to write. This used to re-check
  // all 274 players on every start (about 2 s, which also delayed every wake-up of a sleeping server).
  const [seeded, presets, teams, withStats] = await Promise.all([
    Player.countDocuments({ seedVersion: SEED_VERSION }), AuctionSetting.countDocuments({ version: SEED_VERSION }), Team.countDocuments(),
    Player.countDocuments({ statsVersion: STATS_VERSION }),
  ]);
  const statsDone = !STATS || withStats >= Object.keys(STATS.players).length;
  if (seeded >= PLAYERS.length && presets >= PRESETS.length && teams >= TEAMS.length && statsDone) {
    return { teams, presets, players: await Player.countDocuments(), updated: 0, legacyRemoved: 0, skipped: true };
  }
  await Promise.all(TEAMS.map((t) => Team.updateOne({ short: t.short }, { $set: t }, { upsert: true })));
  for (const p of PRESETS) {
    await AuctionSetting.updateOne({ key: p.key, version: { $ne: SEED_VERSION } }, { $set: { ...p, version: SEED_VERSION } }, { upsert: true }).catch(ignoreDup);
  }
  const legacy = await Player.deleteMany({ slug: { $in: LEGACY_SLUGS }, seedVersion: { $lt: SEED_VERSION } });
  for (const [oldSlug, newName] of Object.entries(RENAMES)) { // same database record, new official spelling
    if (!(await Player.exists({ slug: slugify(newName) })) && await Player.exists({ slug: oldSlug })) await Player.updateOne({ slug: oldSlug }, { $set: { name: newName, slug: slugify(newName) } });
  }
  const ops = PLAYERS.map((p) => ({ updateOne: { filter: { slug: p.slug, seedVersion: { $ne: SEED_VERSION } }, update: { $set: p }, upsert: true } }));
  const r = await Player.bulkWrite(ops, { ordered: false }).catch(ignoreDup);
  const statsUpdated = await seedStats();
  return { teams: TEAMS.length, presets: PRESETS.length, players: await Player.countDocuments(), updated: (r?.upsertedCount || 0) + (r?.modifiedCount || 0), statsUpdated, legacyRemoved: legacy.deletedCount };
}

if (require.main === module) {
  connectDb()
    .then(() => seedAll())
    .then((r) => { console.log('[seed]', r); return mongoose.disconnect(); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}
module.exports = { seedAll };
