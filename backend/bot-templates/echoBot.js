// bot-templates/echoBot.js - Template 1: Bot Echo
const TelegramBot = require('node-telegram-bot-api');

const createEchoBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });

  return {
    // freshDoc est le botDoc rechargé depuis la DB à chaque requête
    // (garantit que incrementStats / addLog opèrent sur le bon document)
    handleUpdate: async (update, freshDoc = botDoc) => {
      try {
        const msg = update.message;
        if (!msg || !msg.text) return;

        const chatId    = msg.chat.id;
        const text      = msg.text;
        const firstName = msg.from?.first_name || 'Utilisateur';
        const userId    = msg.from?.id;
        const config    = freshDoc.config;

        if (text === '/start') {
          const welcome = config.echo_welcomeMessage || '👋 Bonjour ! Je suis un bot echo.';
          await bot.sendMessage(chatId, welcome.replace('{first_name}', firstName));
          await freshDoc.addLog('info', `/start reçu de ${firstName} (${chatId})`);
          return;
        }

        if (text === '/help') {
          await bot.sendMessage(
            chatId,
            `🤖 <b>Bot Echo</b>\n\nJ'envoie en écho tout ce que vous m'écrivez.\n\n` +
            `📋 <b>Commandes :</b>\n/start - Message de bienvenue\n/help - Cette aide`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // Echo
        const prefix = config.echo_prefix ? config.echo_prefix + ' ' : '';
        await bot.sendMessage(chatId, `${prefix}${text}`);
        await freshDoc.incrementStats(userId);

      } catch (err) {
        console.error('EchoBot error:', err.message);
        await freshDoc.addLog('error', `Erreur: ${err.message}`);
      }
    },
  };
};

module.exports = { createEchoBot };
