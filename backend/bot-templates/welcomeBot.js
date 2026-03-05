// bot-templates/welcomeBot.js - Template 2: Bot de Bienvenue
const TelegramBot = require('node-telegram-bot-api');

const interpolate = (template, data) => {
  return template
    .replace(/{username}/g, data.username ? `@${data.username}` : data.first_name || 'Utilisateur')
    .replace(/{first_name}/g, data.first_name || 'Utilisateur')
    .replace(/{last_name}/g, data.last_name || '')
    .replace(/{chat_title}/g, data.chat_title || 'ce groupe')
    .replace(/{full_name}/g, `${data.first_name || ''} ${data.last_name || ''}`.trim());
};

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
          await bot.sendMessage(
            chatId,
            `👋 <b>Bot de bienvenue activé !</b>\n\nAjoutez-moi dans un groupe et j'accueillerai automatiquement les nouveaux membres.\n\nN'oubliez pas de me donner les droits d'administrateur !`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // Nouveaux membres
        if (msg.new_chat_members?.length > 0) {
          const me = await bot.getMe();
          for (const member of msg.new_chat_members) {
            if (member.id === me.id) continue;
            const text = interpolate(
              config.welcome_joinMessage || '👋 Bienvenue {first_name} dans le groupe !',
              { username: member.username, first_name: member.first_name, last_name: member.last_name, chat_title: chatTitle }
            );
            await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
            await freshDoc.addLog('info', `Bienvenue envoyé à ${member.first_name} dans ${chatTitle}`);
            await freshDoc.incrementStats(member.id);
          }
        }

        // Membre quittant
        if (msg.left_chat_member) {
          const member = msg.left_chat_member;
          const me = await bot.getMe();
          if (member.id === me.id) return;
          const text = interpolate(
            config.welcome_leaveMessage || '👋 Au revoir {first_name} !',
            { username: member.username, first_name: member.first_name, last_name: member.last_name, chat_title: chatTitle }
          );
          await bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
          await freshDoc.addLog('info', `Au revoir envoyé pour ${member.first_name}`);
        }

      } catch (err) {
        console.error('WelcomeBot error:', err.message);
        await freshDoc.addLog('error', `Erreur: ${err.message}`);
      }
    },
  };
};

module.exports = { createWelcomeBot };
