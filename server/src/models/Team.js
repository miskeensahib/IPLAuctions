const { Schema, model } = require('mongoose');

module.exports = model('Team', new Schema({
  short: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  color: { type: String, default: '#6d28d9' },
  accent: { type: String, default: '#ffffff' },
}, { timestamps: true }));
