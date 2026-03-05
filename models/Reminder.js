// models/Reminder.js - Modèle rappels pour le bot Template 4
const mongoose = require('mongoose');

const ReminderSchema = new mongoose.Schema({
  botId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bot',
    required: true,
  },
  chatId: {
    type: String,
    required: true, // ID du chat Telegram
  },
  userId: {
    type: String,
    required: true, // ID de l'utilisateur Telegram
  },
  message: {
    type: String,
    required: true,
    maxlength: [500, 'Message trop long'],
  },
  scheduledAt: {
    type: Date,
    required: true, // Quand envoyer le rappel
  },
  isSent: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Index pour les requêtes de rappels en attente
ReminderSchema.index({ scheduledAt: 1, isSent: 1 });
ReminderSchema.index({ botId: 1 });

module.exports = mongoose.model('Reminder', ReminderSchema);
