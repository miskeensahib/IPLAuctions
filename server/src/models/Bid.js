const { Schema, model } = require('mongoose');

module.exports = model('Bid', new Schema({
  auction: { type: Schema.Types.ObjectId, ref: 'Auction', index: true },
  player: { type: Schema.Types.ObjectId, ref: 'Player' },
  team: { type: Schema.Types.ObjectId, ref: 'Team' },
  teamShort: String, amount: Number, byBot: Boolean,
  bidderName: { type: String, default: null }, // display name of the person who bid (null for bots)
}, { timestamps: true }));
