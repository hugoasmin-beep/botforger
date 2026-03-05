// bot-templates/echoBot.js - Template 1: Bot Echo
const TelegramBot = require('node-telegram-bot-api');

/**
 * Crée et configure un bot echo
 * @param {Object} botDoc - Document bot de la base de données
 * @param {Function} onUpdate - Callback pour logger les updates
 * @returns {TelegramBot} Instance du bot configurée (sans polling, pour webhooks)
 */
const createEchoBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });
  const config = botDoc.config;

  return {
    /**
     * Traite une mise à jour Telegram entrante
     * @param {Object} update - Update Telegram
     */
    handleUpdate: async (update) => {
      try {
        const msg = update.message;
        if (!msg || !msg.text) return;

        const chatId = msg.chat.id;
        const text = msg.text;
        const firstName = msg.from.first_name || 'Utilisateur';

        // Commande /start
        if (text === '/start') {
          const welcomeMsg = config.echo_welcomeMessage || '👋 Bonjour ! Je suis un bot echo.';
          await bot.sendMessage(chatId, welcomeMsg.replace('{first_name}', firstName));
          await botDoc.addLog('info', `/start reçu de ${firstName} (${chatId})`);
          return;
        }

        // Commande /help
        if (text === '/help') {
          await bot.sendMessage(
            chatId,
            `🤖 <b>Bot Echo</b>\n\nJ'envoie en écho tout ce que vous m'écrivez.\n\n` +
            `📋 <b>Commandes :</b>\n/start - Message de bienvenue\n/help - Cette aide`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // Echo du message avec préfixe optionnel
        const prefix = config.echo_prefix ? config.echo_prefix + ' ' : '';
        await bot.sendMessage(chatId, `${prefix}${text}`);

        // Mise à jour stats
        await botDoc.incrementStats();

      } catch (error) {
        console.error('EchoBot error:', error.message);
        await botDoc.addLog('error', `Erreur: ${error.message}`);
      }
    },
  };
};

module.exports = { createEchoBot };
