const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const LogSchema = new mongoose.Schema({
  type: { type: String, enum: ['info', 'error', 'warning'], default: 'info' },
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const BotSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: [true, 'Nom du bot requis'],
    trim: true,
    maxlength: [50, 'Nom trop long (max 50 chars)'],
  },
  token: {
    type: String,
    required: [true, 'Token Telegram requis'],
  },
  webhookSecret: {
    type: String,
    default: () => uuidv4(),
  },
  template: {
    type: String,
    required: true,
    enum: ['echo', 'welcome', 'poll', 'reminder', 'translate', 'stats'],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  telegramUsername: {
    type: String,
    default: null,
  },
  config: {
    echo_welcomeMessage: { type: String, default: '👋 Bonjour ! Je suis un bot echo.' },
    echo_prefix: { type: String, default: '' },
    welcome_joinMessage: { type: String, default: '👋 Bienvenue {first_name} dans le groupe !' },
    welcome_leaveMessage: { type: String, default: '👋 Au revoir {first_name} !' },
    welcome_enabled: { type: Boolean, default: true },
    poll_allowAnonymous: { type: Boolean, default: false },
    reminder_timezone: { type: String, default: 'Europe/Paris' },
    translate_defaultLang: { type: String, default: 'en' },
    translate_welcomeMessage: { type: String, default: '🌍 Bonjour ! Envoyez /translate <texte> pour traduire.' },
    stats_resetWeekly: { type: Boolean, default: false },
    stats_trackMedia: { type: Boolean, default: true },
  },
  stats: {
    totalMessages: { type: Number, default: 0 },
    activeUsers:   { type: Number, default: 0 },
    seenUserIds:   { type: [String], default: [], select: false }, // hidden from API
    lastActivity:  { type: Date, default: null },
  },
  logs: {
    type: [LogSchema],
    default: [],
  },
}, {
  timestamps: true,
});

// ─── ATOMIC incrementStats ─────────────────────────────────────────────────
// Uses MongoDB $inc — safe even with stale in-memory docs or concurrent calls.
BotSchema.methods.incrementStats = async function (userId) {
  const update = {
    $inc: { 'stats.totalMessages': 1 },
    $set: { 'stats.lastActivity': new Date() },
  };

  // Track unique active users (avoid double-counting the same user)
  if (userId) {
    const userStr = String(userId);
    const bot = await Bot.findById(this._id).select('stats.seenUserIds');
    const alreadySeen = bot?.stats?.seenUserIds?.includes(userStr);
    if (!alreadySeen) {
      update.$inc['stats.activeUsers'] = 1;
      if (!update.$push) update.$push = {};
      update.$push['stats.seenUserIds'] = userStr;
    }
  }

  await Bot.findByIdAndUpdate(this._id, update);
};

// ─── ATOMIC addLog ─────────────────────────────────────────────────────────
// Uses $push with $slice so we never accumulate >100 logs, atomically.
BotSchema.methods.addLog = async function (type, message) {
  await Bot.findByIdAndUpdate(this._id, {
    $push: {
      logs: {
        $each: [{ type, message, timestamp: new Date() }],
        $slice: -100,
      },
    },
  });
};

BotSchema.methods.getMaskedToken = function () {
  if (!this.token) return '***';
  const parts = this.token.split(':');
  if (parts.length !== 2) return '***';
  return `${parts[0]}:${parts[1].substring(0, 4)}${'*'.repeat(parts[1].length - 4)}`;
};

const Bot = mongoose.model('Bot', BotSchema);
module.exports = Bot;
