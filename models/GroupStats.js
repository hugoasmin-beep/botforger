// models/GroupStats.js - Statistiques de groupe pour Template 6
const mongoose = require('mongoose');

const MemberStatSchema = new mongoose.Schema({
  userId: String,
  username: String,
  firstName: String,
  messageCount: { type: Number, default: 0 },
  mediaCount: { type: Number, default: 0 },
  lastSeen: Date,
});

const GroupStatsSchema = new mongoose.Schema({
  botId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
    required: true,
  },
  chatId: {
    type: String,
    required: true,
  },
  chatTitle: String,
  members: [MemberStatSchema],
  totalMessages: { type: Number, default: 0 },
  weekStart: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

GroupStatsSchema.index({ botId: 1, chatId: 1 }, { unique: true });

module.exports = mongoose.model('GroupStats', GroupStatsSchema);
