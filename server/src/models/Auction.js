const { Schema, model } = require('mongoose');

const teamState = new Schema({
  team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  short: String, name: String, color: String,
  purse: Number, spent: { type: Number, default: 0 },
  count: { type: Number, default: 0 }, overseas: { type: Number, default: 0 },
  isBot: { type: Boolean, default: true },
  ownerId: { type: String, default: null }, ownerName: { type: String, default: null },
}, { _id: false });

module.exports = model('Auction', new Schema({
  code: { type: String, required: true, unique: true, index: true },
  name: String,
  mode: String,
  play: { type: String, enum: ['solo', 'multi'], default: 'solo' },
  status: { type: String, enum: ['lobby', 'live', 'paused', 'completed'], default: 'lobby', index: true },
  hostId: String, hostName: String,
  settings: { type: Schema.Types.Mixed, required: true },
  teams: [teamState],
  pool: [{ type: Schema.Types.ObjectId, ref: 'Player' }],
  poolIndex: { type: Number, default: -1 },
  live: {
    player: { type: Schema.Types.ObjectId, ref: 'Player' },
    basePrice: Number, currentBid: { type: Number, default: 0 },
    highestTeam: { type: Schema.Types.ObjectId, default: null },
    bidCount: { type: Number, default: 0 },
    endsAt: Date, remainingMs: Number,
    overseas: Boolean, // is the player on the block overseas (saved with the lot so a bid needs no extra player lookup)
    clockSeconds: Number, // length of the countdown the current endsAt was set from (the screen never shows more than this)
    passed: [Schema.Types.ObjectId],
    phase: { type: String, enum: ['bidding', 'closed'], default: 'closed' },
    rev: { type: Number, default: 0 },
    lastResult: Schema.Types.Mixed,
  },
}, { timestamps: true }));
