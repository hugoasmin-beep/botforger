// bot-templates/reminderBot.js - Template 4: Bot de Rappels
const TelegramBot = require('node-telegram-bot-api');
const Reminder = require('../models/Reminder');
const { parseDuration, formatDuration } = require('../utils/scheduler');

const createReminderBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });

  return {
    handleUpdate: async (update, freshDoc = botDoc) => {
      try {
        const msg = update.message;
        if (!msg || !msg.text) return;

        const chatId    = msg.chat.id;
        const userId    = String(msg.from.id);
        const text      = msg.text;
        const firstName = msg.from?.first_name || 'Utilisateur';

        if (text === '/start') {
          await bot.sendMessage(chatId,
            `⏰ <b>Bot de Rappels</b>\n\nBonjour ${firstName} ! Je vais vous aider à ne rien oublier.\n\n` +
            `📋 <b>Commandes :</b>\n/remind &lt;durée&gt; &lt;message&gt;\n/reminders - Voir vos rappels\n/cancel - Annuler un rappel\n/help - Aide complète`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        if (text === '/help') {
          await bot.sendMessage(chatId,
            `⏰ <b>Guide Rappels</b>\n\n` +
            `<b>Créer un rappel :</b>\n<code>/remind 10min Boire de l'eau</code>\n<code>/remind 2h Réunion importante</code>\n<code>/remind 1j Anniversaire de Marie</code>\n\n` +
            `<b>Durées supportées :</b>\n• Secondes : 30s\n• Minutes : 10min, 5m\n• Heures : 2h, 1h30min\n• Jours : 1j, 2d\n\n` +
            `<b>Autres commandes :</b>\n/reminders - Liste de vos rappels actifs\n/cancel &lt;numéro&gt; - Annuler un rappel`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        if (text.startsWith('/remind ')) {
          const content   = text.slice(8).trim();
          const spaceIdx  = content.indexOf(' ');
          if (spaceIdx === -1) {
            await bot.sendMessage(chatId, `❌ Format: <code>/remind &lt;durée&gt; &lt;message&gt;</code>\nExemple: <code>/remind 10min Appeler maman</code>`, { parse_mode: 'HTML' });
            return;
          }
          const durationStr = content.substring(0, spaceIdx);
          const reminderMsg = content.substring(spaceIdx + 1).trim();
          const durationMs  = parseDuration(durationStr);

          if (durationMs === -1 || durationMs < 10000) {
            await bot.sendMessage(chatId, `❌ Durée invalide ou trop courte (min 10 secondes).\n\nFormats supportés: 30s, 10min, 2h, 1j`, { parse_mode: 'HTML' });
            return;
          }
          if (durationMs > 30 * 24 * 60 * 60 * 1000) {
            await bot.sendMessage(chatId, '❌ Maximum 30 jours de délai.');
            return;
          }

          const activeCount = await Reminder.countDocuments({ botId: freshDoc._id, userId, isSent: false });
          if (activeCount >= 10) {
            await bot.sendMessage(chatId, '❌ Vous avez déjà 10 rappels actifs. Annulez-en un avec /cancel.');
            return;
          }

          const scheduledAt = new Date(Date.now() + durationMs);
          await Reminder.create({ botId: freshDoc._id, chatId: String(chatId), userId, message: reminderMsg, scheduledAt });

          const humanDuration = formatDuration(durationMs);
          await bot.sendMessage(chatId,
            `✅ <b>Rappel programmé !</b>\n\n📝 Message : ${reminderMsg}\n⏰ Dans : ${humanDuration}\n🕐 À : ${scheduledAt.toLocaleString('fr-FR')}`,
            { parse_mode: 'HTML' }
          );
          await freshDoc.addLog('info', `Rappel créé par ${firstName}: "${reminderMsg}" dans ${humanDuration}`);
          await freshDoc.incrementStats(msg.from.id);
          return;
        }

        if (text === '/reminders') {
          const reminders = await Reminder.find({ botId: freshDoc._id, userId, isSent: false, scheduledAt: { $gt: new Date() } }).sort({ scheduledAt: 1 }).limit(10);
          if (reminders.length === 0) {
            await bot.sendMessage(chatId, '📭 Vous n\'avez aucun rappel actif.\n\nUtilisez /remind pour en créer un !');
            return;
          }
          let response = `📋 <b>Vos rappels actifs (${reminders.length}) :</b>\n\n`;
          reminders.forEach((r, idx) => {
            response += `${idx + 1}. ⏰ ${r.scheduledAt.toLocaleString('fr-FR')}\n   📝 ${r.message}\n\n`;
          });
          response += `Utilisez /cancel &lt;numéro&gt; pour annuler.`;
          await bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
          return;
        }

        if (text.startsWith('/cancel')) {
          const num = parseInt(text.split(' ')[1]);
          if (isNaN(num) || num < 1) {
            await bot.sendMessage(chatId, '❌ Utilisez /cancel <numéro> (ex: /cancel 1)\n\nVoir vos rappels avec /reminders');
            return;
          }
          const reminders = await Reminder.find({ botId: freshDoc._id, userId, isSent: false, scheduledAt: { $gt: new Date() } }).sort({ scheduledAt: 1 });
          if (num > reminders.length) {
            await bot.sendMessage(chatId, `❌ Rappel #${num} introuvable. Vous avez ${reminders.length} rappel(s) actif(s).`);
            return;
          }
          const toDelete = reminders[num - 1];
          await Reminder.findByIdAndDelete(toDelete._id);
          await bot.sendMessage(chatId, `✅ Rappel annulé : "${toDelete.message}"`);
          return;
        }

      } catch (err) {
        console.error('ReminderBot error:', err.message);
        await freshDoc.addLog('error', `Erreur: ${err.message}`);
      }
    },
  };
};

module.exports = { createReminderBot };
