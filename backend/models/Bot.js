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
    activeUsers: { type: Number, default: 0 },
    lastActivity: { type: Date, default: null },
  },
  logs: {
    type: [LogSchema],
    default: [],
  },
}, {
  // ✅ FIX: timestamps activé pour que updatedAt existe (cache webhook)
  timestamps: true,
});

BotSchema.methods.addLog = async function (type, message) {
  this.logs.push({ type, message });
  if (this.logs.length > 100) {
    this.logs = this.logs.slice(-100);
  }
  await this.save();
};

BotSchema.methods.incrementStats = async function () {
  this.stats.totalMessages += 1;
  this.stats.lastActivity = new Date();
  await this.save();
};

BotSchema.methods.getMaskedToken = function () {
  if (!this.token) return '***';
  const parts = this.token.split(':');
  if (parts.length !== 2) return '***';
  return `${parts[0]}:${parts[1].substring(0, 4)}${'*'.repeat(parts[1].length - 4)}`;
};

module.exports = mongoose.model('Bot', BotSchema);
