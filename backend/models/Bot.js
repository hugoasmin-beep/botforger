const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const LogSchema = new mongoose.Schema({
  type: { type: String, enum: ['info', 'error', 'warning'], default: 'info' },
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const BotSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:  { type: String, required: [true, 'Nom du bot requis'], trim: true, maxlength: [50, 'Nom trop long'] },
  token: { type: String, required: [true, 'Token Telegram requis'] },
  webhookSecret: { type: String, default: () => uuidv4() },
  template: {
    type: String,
    required: true,
    enum: ['echo', 'welcome', 'poll', 'reminder', 'translate', 'stats', 'ai'],
  },
  isActive: { type: Boolean, default: true },
  telegramUsername: { type: String, default: null },

  config: {
    // — Echo
    echo_welcomeMessage: { type: String, default: '👋 Bonjour ! Je suis un bot echo.' },
    echo_prefix:         { type: String, default: '' },
    // — Welcome
    welcome_joinMessage:  { type: String, default: '👋 Bienvenue {first_name} dans le groupe !' },
    welcome_leaveMessage: { type: String, default: '👋 Au revoir {first_name} !' },
    welcome_enabled:      { type: Boolean, default: true },
    // — Poll
    poll_allowAnonymous: { type: Boolean, default: false },
    // — Reminder
    reminder_timezone: { type: String, default: 'Europe/Paris' },
    // — Translate
    translate_defaultLang:    { type: String, default: 'en' },
    translate_welcomeMessage: { type: String, default: '🌍 Bonjour ! Envoyez /translate <texte> pour traduire.' },
    // — Stats
    stats_resetWeekly: { type: Boolean, default: false },
    stats_trackMedia:  { type: Boolean, default: true },
    // — AI Bot
    ai_enabled:          { type: Boolean,  default: false },
    ai_provider:         { type: String,   default: 'openai' },   // openai | mistral | groq | custom
    ai_apiKey:           { type: String,   default: '' },          // chiffré idéalement
    ai_endpoint:         { type: String,   default: '' },          // laisser vide = auto selon provider
    ai_model:            { type: String,   default: '' },          // laisser vide = auto
    ai_system_prompt:    { type: String,   default: '' },          // prompt système personnalisé
    ai_persona_name:     { type: String,   default: 'Assistant IA' },
    ai_persona_emoji:    { type: String,   default: '🤖' },
    ai_welcome_message:  { type: String,   default: 'Bonjour {first_name} ! Comment puis-je vous aider ?' },
    ai_temperature:      { type: String,   default: '0.7' },
  },

  stats: {
    totalMessages: { type: Number, default: 0 },
    activeUsers:   { type: Number, default: 0 },
    seenUserIds:   { type: [String], default: [], select: false },
    lastActivity:  { type: Date, default: null },
  },

  logs: { type: [LogSchema], default: [] },
}, { timestamps: true });

// ─── ATOMIC incrementStats ────────────────────────────────────────────────
BotSchema.methods.incrementStats = async function (userId) {
  const update = {
    $inc: { 'stats.totalMessages': 1 },
    $set: { 'stats.lastActivity': new Date() },
  };
  if (userId) {
    const doc = await Bot.findById(this._id).select('stats.seenUserIds');
    if (!doc?.stats?.seenUserIds?.includes(String(userId))) {
      update.$inc['stats.activeUsers'] = 1;
      update.$push = { 'stats.seenUserIds': String(userId) };
    }
  }
  await Bot.findByIdAndUpdate(this._id, update);
};

// ─── ATOMIC addLog ────────────────────────────────────────────────────────
BotSchema.methods.addLog = async function (type, message) {
  await Bot.findByIdAndUpdate(this._id, {
    $push: { logs: { $each: [{ type, message, timestamp: new Date() }], $slice: -100 } },
  });
};

BotSchema.methods.getMaskedToken = function () {
  if (!this.token) return '***';
  const parts = this.token.split(':');
  if (parts.length !== 2) return '***';
  return `${parts[0]}:${parts[1].substring(0, 4)}${'*'.repeat(parts[1].length - 4)}`;
};

// Masquer la clé API dans les réponses publiques
BotSchema.methods.getMaskedApiKey = function () {
  const key = this.config?.ai_apiKey;
  if (!key || key.length < 8) return key ? '***' : '';
  return key.substring(0, 7) + '•'.repeat(Math.min(key.length - 7, 20));
};

const Bot = mongoose.model('Bot', BotSchema);
module.exports = Bot;
