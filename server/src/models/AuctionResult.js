const { Schema, model } = require('mongoose');

module.exports = model('AuctionResult', new Schema({
  auction: { type: Schema.Types.ObjectId, ref: 'Auction', index: true },
  player: { type: Schema.Types.ObjectId, ref: 'Player' },
  team: { type: Schema.Types.ObjectId, ref: 'Team', default: null },
  teamShort: String,
  status: { type: String, enum: ['sold', 'unsold'] },
  price: Number, basePrice: Number, bidCount: Number,
}, { timestamps: true }));
