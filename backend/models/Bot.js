const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const LogSchema = new mongoose.Schema({
  type: { type: String, enum: ['info', 'error', 'warning'], default: 'info' },
  message: String,
  timestamp: { type: Date, default: Date.now },
});

const BotSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:  { type: String, required: true, trim: true, maxlength: 50 },
  token: { type: String, required: true },
  webhookSecret: { type: String, default: () => uuidv4() },
  template: {
    type: String,
    required: true,
    enum: ['echo', 'welcome', 'poll', 'reminder', 'translate', 'stats', 'ai', 'api'],
  },
  isActive:         { type: Boolean, default: true },
  telegramUsername: { type: String,  default: null },

  config: {
    // ─ Echo ─
    echo_welcomeMessage: { type: String, default: '👋 Bonjour ! Je suis un bot echo.' },
    echo_prefix:         { type: String, default: '' },
    // ─ Welcome ─
    welcome_joinMessage:  { type: String, default: '👋 Bienvenue {first_name} dans le groupe !' },
    welcome_leaveMessage: { type: String, default: '👋 Au revoir {first_name} !' },
    welcome_enabled:      { type: Boolean, default: true },
    // ─ Poll ─
    poll_allowAnonymous: { type: Boolean, default: false },
    // ─ Reminder ─
    reminder_timezone: { type: String, default: 'Europe/Paris' },
    // ─ Translate ─
    translate_defaultLang:    { type: String, default: 'en' },
    translate_welcomeMessage: { type: String, default: '🌍 Bonjour ! Envoyez /translate <texte> pour traduire.' },
    // ─ Stats ─
    stats_resetWeekly: { type: Boolean, default: false },
    stats_trackMedia:  { type: Boolean, default: true },
    // ─ AI Bot ─
    ai_enabled:         { type: Boolean, default: false },
    ai_provider:        { type: String,  default: 'openai' },
    ai_apiKey:          { type: String,  default: '' },
    ai_endpoint:        { type: String,  default: '' },
    ai_model:           { type: String,  default: '' },
    ai_system_prompt:   { type: String,  default: '' },
    ai_persona_name:    { type: String,  default: 'Assistant IA' },
    ai_persona_emoji:   { type: String,  default: '🤖' },
    ai_welcome_message: { type: String,  default: 'Bonjour {first_name} ! Comment puis-je vous aider ?' },
    ai_temperature:     { type: String,  default: '0.7' },
    // ─ API Endpoint Bot ─
    api_url:               { type: String, default: '' },
    api_method:            { type: String, default: 'GET' },
    api_headers:           { type: String, default: '' },     // "Key: Value\nKey2: Value2"
    api_body:              { type: String, default: '' },     // JSON body template
    api_triggers:          { type: String, default: '' },     // "weather,meteo,forecast" CSV
    api_response_path:     { type: String, default: '' },     // JSON path "data.temp"
    api_response_template: { type: String, default: '🔗 Résultat :\n\n{result}' },
    api_fallback_message:  { type: String, default: '❌ Impossible de récupérer les données.' },
    api_welcome_message:   { type: String, default: '🔗 Bot API prêt ! Envoyez un mot-clé pour déclencher l\'appel.' },
    api_buttons:           { type: String, default: '' },     // JSON inline buttons
    api_cooldown_ms:       { type: String, default: '2000' },
    // ─ Rich message builder (partagé entre templates) ─
    // JSON stringifié : [{type:'text'|'image'|'gif'|'buttons', ...}]
    msg_start_blocks:  { type: String, default: '' },
    msg_help_blocks:   { type: String, default: '' },
    msg_custom_blocks: { type: String, default: '' },
    // ─ Commandes personnalisées (universel, tous templates) ─
    // JSON stringifié : [{name:'test', reply:'Bonjour !', desc:'...', parse_mode:'HTML', buttons:''}]
    custom_commands:   { type: String, default: '' },
    // Legacy (premier bloc commande du create-bot)
    command_name:      { type: String, default: '' },
    command_reply:     { type: String, default: '' },
  },

  stats: {
    totalMessages: { type: Number,   default: 0 },
    activeUsers:   { type: Number,   default: 0 },
    seenUserIds:   { type: [String], default: [], select: false },
    lastActivity:  { type: Date,     default: null },
  },

  logs: { type: [LogSchema], default: [] },
}, { timestamps: true });

// ─── Atomic ops ────────────────────────────────────────────────────────────
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

BotSchema.methods.getMaskedApiKey = function () {
  const key = this.config?.ai_apiKey;
  if (!key || key.length < 8) return key ? '***' : '';
  return key.substring(0, 7) + '•'.repeat(Math.min(key.length - 7, 20));
};

const Bot = mongoose.model('Bot', BotSchema);
module.exports = Bot;
// Note: Bot.js is already defined above — this file exports the Bot model.
