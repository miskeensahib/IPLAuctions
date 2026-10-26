const { Schema, model } = require('mongoose');

const squadSchema = new Schema({
  auction: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
  team: { type: Schema.Types.ObjectId, ref: 'Team', required: true },
  players: [{ player: { type: Schema.Types.ObjectId, ref: 'Player' }, price: Number, _id: false }],
}, { timestamps: true });
squadSchema.index({ auction: 1, team: 1 }, { unique: true });

module.exports = model('Squad', squadSchema);
