// bot-templates/welcomeBot.js — Template Bienvenue
const TelegramBot = require('node-telegram-bot-api');
const { sendBlocks, parseBlocks, interpolate } = require('../utils/richMessage');

const createWelcomeBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });

  return {
    handleUpdate: async (update, freshDoc = botDoc) => {
      try {
        const msg = update.message;
        if (!msg) return;

        const chatId    = msg.chat.id;
        const chatTitle = msg.chat.title;
        const config    = freshDoc.config;

        if (msg.text === '/start') {
          const startBlocks = parseBlocks(config.msg_start_blocks);
          if (startBlocks.length > 0) {
            await sendBlocks(bot, chatId, startBlocks, { first_name: 'vous', chat_title: chatTitle || 'votre groupe' });
          } else {
            await bot.sendMessage(chatId,
              `👋 <b>Bot de bienvenue activé !</b>\n\nAjoutez-moi dans un groupe et j'accueillerai automatiquement les nouveaux membres.\n\nDonnez-moi les droits d'administrateur !`,
              { parse_mode: 'HTML' }
            );
          }
          return;
        }

        // Nouveaux membres
        if (msg.new_chat_members?.length > 0) {
          const me = await bot.getMe();
          for (const member of msg.new_chat_members) {
            if (member.id === me.id) continue;
            const vars = {
              first_name: member.first_name || 'User',
              last_name:  member.last_name  || '',
              full_name:  `${member.first_name || ''} ${member.last_name || ''}`.trim(),
              username:   member.username ? `@${member.username}` : member.first_name || 'User',
              chat_title: chatTitle || 'this group',
            };

            const joinMsg = interpolate(config.welcome_joinMessage || 'Welcome {first_name}!', vars);
            await bot.sendMessage(chatId, joinMsg, { parse_mode: 'HTML' })
              .catch(() => bot.sendMessage(chatId, joinMsg));
            await freshDoc.addLog('info', `Welcome sent to ${member.first_name}`);
            await freshDoc.incrementStats(member.id);
          }
        }

        // Membres quittant
        if (msg.left_chat_member) {
          const member = msg.left_chat_member;
          const me = await bot.getMe();
          if (member.id === me.id) return;
          const vars = {
            first_name: member.first_name || 'User',
            last_name:  member.last_name  || '',
            username:   member.username ? `@${member.username}` : member.first_name || 'User',
            chat_title: chatTitle || 'this group',
          };
          const leaveMsg = interpolate(config.welcome_leaveMessage || 'Goodbye {first_name}!', vars);
          await bot.sendMessage(chatId, leaveMsg, { parse_mode: 'HTML' })
            .catch(() => bot.sendMessage(chatId, leaveMsg));
          await freshDoc.addLog('info', `Goodbye sent for ${member.first_name}`);
        }

      } catch (err) {
        console.error('WelcomeBot error:', err.message);
        await freshDoc.addLog('error', `Erreur: ${err.message}`);
      }
    },
  };
};

module.exports = { createWelcomeBot };
