const { Schema, model } = require('mongoose');

// One document per (browser identity, player). There are no user accounts, so the identity is the browser's clientId.
const watchSchema = new Schema({
  clientId: { type: String, required: true, index: true },
  player: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
}, { timestamps: true });
watchSchema.index({ clientId: 1, player: 1 }, { unique: true });

module.exports = model('Watchlist', watchSchema);
