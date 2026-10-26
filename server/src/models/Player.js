const { Schema, model } = require('mongoose');

const ROLES = ['Batter', 'Bowler', 'All-rounder', 'Wicketkeeper', 'Unassigned'];

const playerSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, unique: true, index: true },
  country: { type: String, default: 'Unknown', trim: true },
  isOverseas: { type: Boolean, default: false },
  role: { type: String, enum: ROLES, default: 'Unassigned' },
  team: { type: String, default: null },                         // current IPL franchise (official squad page)
  previousTeam: { type: String, default: null },
  marqueeRank: { type: Number, default: null },                   // lower = earlier in a Mega auction
  externalId: { type: Number, default: null },
  seedVersion: { type: Number, default: 0 },
  basePrice: { type: Number, default: null, min: 0 },          // lakhs
  basePriceVerified: { type: Boolean, default: false },
  auctionStatus: { type: String, enum: ['upcoming', 'sold', 'unsold', 'none'], default: 'upcoming' },
  soldTo: { type: String, default: null },                       // franchise short code (official result)
  soldPrice: { type: Number, default: null, min: 0 },            // lakhs (official result)
  profileVerified: { type: Boolean, default: false },            // role / country confirmed from an official source
  image: { type: String, default: null },                        // full-size official image URL
  imageThumb: { type: String, default: null },                   // small (384px) version used in the UI
  stats: { type: Map, of: Number, default: undefined },
  source: { type: String, default: null },
  notes: { type: String, default: null },
}, { timestamps: true });

playerSchema.index({ name: 'text' });
playerSchema.statics.ROLES = ROLES;
module.exports = model('Player', playerSchema);
