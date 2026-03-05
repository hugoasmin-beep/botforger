// models/Bot.js - Modèle bot Telegram
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
    // Le token est stocké mais idéalement chiffré en production
  },
  webhookSecret: {
    type: String,
    default: () => uuidv4(), // Identifiant unique pour le webhook
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
    type: String, // @username du bot Telegram (récupéré via getMe)
    default: null,
  },
  // Configuration spécifique au template
  config: {
    // Template: echo
    echo_welcomeMessage: { type: String, default: '👋 Bonjour ! Je suis un bot echo.' },
    echo_prefix: { type: String, default: '' },

    // Template: welcome
    welcome_joinMessage: { type: String, default: '👋 Bienvenue {first_name} dans le groupe !' },
    welcome_leaveMessage: { type: String, default: '👋 Au revoir {first_name} !' },
    welcome_enabled: { type: Boolean, default: true },

    // Template: poll (pas de config spéciale, dynamique)
    poll_allowAnonymous: { type: Boolean, default: false },

    // Template: reminder (timezone)
    reminder_timezone: { type: String, default: 'Europe/Paris' },

    // Template: translate
    translate_defaultLang: { type: String, default: 'en' },
    translate_welcomeMessage: { type: String, default: '🌍 Bonjour ! Envoyez /translate <texte> pour traduire.' },

    // Template: stats
    stats_resetWeekly: { type: Boolean, default: false },
    stats_trackMedia: { type: Boolean, default: true },
  },
  // Statistiques d'utilisation
  stats: {
    totalMessages: { type: Number, default: 0 },
    activeUsers: { type: Number, default: 0 },
    lastActivity: { type: Date, default: null },
  },
  // Logs récents (garde les 100 derniers)
  logs: {
    type: [LogSchema],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Méthode pour ajouter un log (garde les 100 derniers)
BotSchema.methods.addLog = async function (type, message) {
  this.logs.push({ type, message });
  if (this.logs.length > 100) {
    this.logs = this.logs.slice(-100); // Garde les 100 derniers
  }
  await this.save();
};

// Méthode pour incrémenter les stats
BotSchema.methods.incrementStats = async function () {
  this.stats.totalMessages += 1;
  this.stats.lastActivity = new Date();
  await this.save();
};

// Retourner le token masqué pour l'affichage
BotSchema.methods.getMaskedToken = function () {
  if (!this.token) return '***';
  const parts = this.token.split(':');
  if (parts.length !== 2) return '***';
  return `${parts[0]}:${parts[1].substring(0, 4)}${'*'.repeat(parts[1].length - 4)}`;
};

module.exports = mongoose.model('Bot', BotSchema);
