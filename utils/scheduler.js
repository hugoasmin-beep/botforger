// utils/scheduler.js - Gestion des rappels programmés
const cron = require('node-cron');
const TelegramBot = require('node-telegram-bot-api');
const Reminder = require('../models/Reminder');
const Bot = require('../models/Bot');

let schedulerTask = null;

/**
 * Démarre le scheduler qui vérifie les rappels toutes les minutes
 */
const startScheduler = () => {
  if (schedulerTask) return; // Déjà démarré

  console.log('⏰ Scheduler de rappels démarré');

  schedulerTask = cron.schedule('* * * * *', async () => {
    await processReminders();
  });
};

/**
 * Traite les rappels en attente
 */
const processReminders = async () => {
  try {
    const now = new Date();

    // Trouver les rappels à envoyer
    const dueReminders = await Reminder.find({
      scheduledAt: { $lte: now },
      isSent: false,
    }).populate('botId');

    for (const reminder of dueReminders) {
      const botDoc = reminder.botId;

      if (!botDoc || !botDoc.isActive) {
        // Bot désactivé: marquer comme envoyé quand même
        reminder.isSent = true;
        await reminder.save();
        continue;
      }

      try {
        const telegramBot = new TelegramBot(botDoc.token, { polling: false });
        await telegramBot.sendMessage(
          reminder.chatId,
          `⏰ <b>Rappel !</b>\n\n${reminder.message}`,
          { parse_mode: 'HTML' }
        );

        reminder.isSent = true;
        await reminder.save();

        // Log dans le bot
        await botDoc.addLog('info', `Rappel envoyé à ${reminder.userId}: ${reminder.message}`);
      } catch (error) {
        console.error(`Erreur envoi rappel ${reminder._id}:`, error.message);
        // Marquer quand même comme envoyé pour éviter les boucles
        reminder.isSent = true;
        await reminder.save();
      }
    }
  } catch (error) {
    console.error('Erreur processReminders:', error);
  }
};

/**
 * Parse une durée depuis texte (ex: "10min", "2h", "1jour")
 * @param {string} durationStr - Ex: "10min", "2h30", "1d"
 * @returns {number} Millisecondes, ou -1 si invalide
 */
const parseDuration = (durationStr) => {
  const str = durationStr.toLowerCase().trim();

  // Patterns supportés: 30s, 10min, 2h, 1j/1d, 1jour/1day
  const patterns = [
    { regex: /^(\d+)s(ec)?$/, multiplier: 1000 },
    { regex: /^(\d+)(min|m)$/, multiplier: 60 * 1000 },
    { regex: /^(\d+)h$/, multiplier: 60 * 60 * 1000 },
    { regex: /^(\d+)(j|d|jour|day)s?$/, multiplier: 24 * 60 * 60 * 1000 },
    // Format combiné: 2h30min
    { regex: /^(\d+)h(\d+)(min|m)?$/, multiplier: null, combined: true },
  ];

  for (const pattern of patterns) {
    const match = str.match(pattern.regex);
    if (match) {
      if (pattern.combined) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        return (hours * 60 + minutes) * 60 * 1000;
      }
      return parseInt(match[1]) * pattern.multiplier;
    }
  }

  return -1; // Format non reconnu
};

/**
 * Formate une durée en millisecondes en texte lisible
 */
const formatDuration = (ms) => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} jour${days > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours}h${minutes % 60 > 0 ? (minutes % 60) + 'min' : ''}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
};

module.exports = { startScheduler, parseDuration, formatDuration };
