const { Schema, model } = require('mongoose');

// Mode presets; each auction snapshots one of these (plus overrides) when created.
module.exports = model('AuctionSetting', new Schema({
  key: { type: String, required: true, unique: true },
  label: String,
  description: String,
  purse: { type: Number, default: 10000 },        // lakhs
  minSquad: { type: Number, default: 0 },          // 0 = no minimum
  maxSquad: { type: Number, default: 25 },
  maxOverseas: { type: Number, default: 8 },
  initialSeconds: { type: Number, default: 30 },
  resetSeconds: { type: Number, default: 15 },
  breakSeconds: { type: Number, default: 4 },
  version: { type: Number, default: 0 },
  poolSize: { type: Number, default: 0 },          // 0 = whole pool
  poolOrder: { type: String, enum: ['random', 'sequential', 'marquee'], default: 'random' },
}, { timestamps: true }));
