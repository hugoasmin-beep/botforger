// bot-templates/pollBot.js - Template 3: Bot de Sondages
const TelegramBot = require('node-telegram-bot-api');

// Stockage en mémoire (les votes en temps réel, non-critique)
const activePollData = new Map();

const createPollBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });

  return {
    handleUpdate: async (update, freshDoc = botDoc) => {
      try {
        const config  = freshDoc.config;
        const pollAnswer = update.poll_answer;

        if (pollAnswer) {
          const data = activePollData.get(pollAnswer.poll_id);
          if (data) {
            data.votes[pollAnswer.user.id] = pollAnswer.option_ids;
            activePollData.set(pollAnswer.poll_id, data);
          }
          return;
        }

        const msg = update.message;
        if (!msg || !msg.text) return;

        const chatId    = msg.chat.id;
        const text      = msg.text;
        const firstName = msg.from?.first_name || 'Utilisateur';
        const userId    = msg.from?.id;

        if (text === '/start') {
          await bot.sendMessage(
            chatId,
            `🗳️ <b>Bot de Sondages</b>\n\nCréez des sondages interactifs facilement !\n\n` +
            `📋 <b>Commandes :</b>\n/poll Question | Option1 | Option2 | Option3\n/quickpoll Oui/Non Question\n/help - Aide détaillée`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        if (text === '/help') {
          await bot.sendMessage(
            chatId,
            `🗳️ <b>Guide Sondages</b>\n\n<b>/poll</b> - Créer un sondage\nExemple: <code>/poll Pizza ou Pasta? | Pizza | Pasta | Les deux!</code>\n\n<b>/quickpoll</b> - Sondage Oui/Non rapide\nExemple: <code>/quickpoll Tu aimes le café ?</code>`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        if (text.startsWith('/poll ')) {
          const parts = text.slice(6).trim().split('|').map(p => p.trim()).filter(Boolean);
          if (parts.length < 3) {
            await bot.sendMessage(chatId, `❌ Format incorrect !\n\nUtilisez : <code>/poll Question | Option1 | Option2</code>\n\nMinimum 2 options requises.`, { parse_mode: 'HTML' });
            return;
          }
          const question = parts[0];
          const options  = parts.slice(1).slice(0, 10);
          const pollMsg  = await bot.sendPoll(chatId, question, options, {
            is_anonymous: config.poll_allowAnonymous || false,
            allows_multiple_answers: false,
          });
          if (pollMsg.poll) {
            activePollData.set(pollMsg.poll.id, { question, options, votes: {}, chatId });
          }
          await freshDoc.addLog('info', `Sondage créé: "${question}" (${options.length} options)`);
          await freshDoc.incrementStats(userId);
          return;
        }

        if (text.startsWith('/quickpoll ')) {
          const question = text.slice(11).trim();
          if (!question) { await bot.sendMessage(chatId, '❌ Entrez votre question après /quickpoll'); return; }
          await bot.sendPoll(chatId, question, ['👍 Oui', '👎 Non', '🤷 Peut-être'], { is_anonymous: false });
          await freshDoc.addLog('info', `Sondage rapide: "${question}"`);
          await freshDoc.incrementStats(userId);
          return;
        }

      } catch (err) {
        console.error('PollBot error:', err.message);
        await freshDoc.addLog('error', `Erreur: ${err.message}`);
      }
    },
  };
};

module.exports = { createPollBot };
