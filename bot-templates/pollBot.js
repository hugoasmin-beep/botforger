// bot-templates/pollBot.js - Template 3: Bot de Sondages
const TelegramBot = require('node-telegram-bot-api');

// Stockage temporaire des sondages en mémoire (pour les résultats)
const activePollData = new Map(); // pollId -> { question, options, votes: {userId -> optionIndex} }

const createPollBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });
  const config = botDoc.config;

  return {
    handleUpdate: async (update) => {
      try {
        const msg = update.message;
        const pollAnswer = update.poll_answer;

        // Gérer les réponses aux sondages Telegram natifs
        if (pollAnswer) {
          const pollId = pollAnswer.poll_id;
          const userId = pollAnswer.user.id;
          const optionIds = pollAnswer.option_ids;

          const pollData = activePollData.get(pollId);
          if (pollData) {
            pollData.votes[userId] = optionIds;
            activePollData.set(pollId, pollData);
          }
          return;
        }

        if (!msg || !msg.text) return;

        const chatId = msg.chat.id;
        const text = msg.text;
        const firstName = msg.from.first_name || 'Utilisateur';

        // /start
        if (text === '/start') {
          await bot.sendMessage(
            chatId,
            `🗳️ <b>Bot de Sondages</b>\n\n` +
            `Créez des sondages interactifs facilement !\n\n` +
            `📋 <b>Commandes :</b>\n` +
            `/poll Question | Option1 | Option2 | Option3\n` +
            `/quickpoll Oui/Non Question\n` +
            `/help - Aide détaillée`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // /help
        if (text === '/help') {
          await bot.sendMessage(
            chatId,
            `🗳️ <b>Guide Sondages</b>\n\n` +
            `<b>/poll</b> - Créer un sondage\n` +
            `Exemple: <code>/poll Pizza ou Pasta? | Pizza | Pasta | Les deux!</code>\n\n` +
            `<b>/quickpoll</b> - Sondage Oui/Non rapide\n` +
            `Exemple: <code>/quickpoll Tu aimes le café ?</code>`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // /poll Question | Option1 | Option2 ...
        if (text.startsWith('/poll ')) {
          const content = text.slice(6).trim();
          const parts = content.split('|').map(p => p.trim()).filter(p => p);

          if (parts.length < 3) {
            await bot.sendMessage(
              chatId,
              `❌ Format incorrect !\n\nUtilisez : <code>/poll Question | Option1 | Option2</code>\n\nMinimum 2 options requises.`,
              { parse_mode: 'HTML' }
            );
            return;
          }

          const question = parts[0];
          const options = parts.slice(1).slice(0, 10); // Max 10 options Telegram

          const pollMsg = await bot.sendPoll(chatId, question, options, {
            is_anonymous: config.poll_allowAnonymous || false,
            allows_multiple_answers: false,
          });

          // Stocker les données du sondage
          if (pollMsg.poll) {
            activePollData.set(pollMsg.poll.id, {
              question,
              options,
              votes: {},
              messageId: pollMsg.message_id,
              chatId,
            });
          }

          await botDoc.addLog('info', `Sondage créé: "${question}" (${options.length} options)`);
          await botDoc.incrementStats();
          return;
        }

        // /quickpoll - Sondage Oui/Non rapide
        if (text.startsWith('/quickpoll ')) {
          const question = text.slice(11).trim();
          if (!question) {
            await bot.sendMessage(chatId, '❌ Entrez votre question après /quickpoll');
            return;
          }

          await bot.sendPoll(chatId, question, ['👍 Oui', '👎 Non', '🤷 Peut-être'], {
            is_anonymous: false,
          });

          await botDoc.addLog('info', `Sondage rapide: "${question}"`);
          await botDoc.incrementStats();
          return;
        }

      } catch (error) {
        console.error('PollBot error:', error.message);
        await botDoc.addLog('error', `Erreur: ${error.message}`);
      }
    },
  };
};

module.exports = { createPollBot };
