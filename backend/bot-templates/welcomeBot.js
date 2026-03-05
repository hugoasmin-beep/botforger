// bot-templates/welcomeBot.js - Template 2: Bot de Bienvenue
const TelegramBot = require('node-telegram-bot-api');

/**
 * Remplace les variables dans un template de message
 * Variables supportées: {username}, {first_name}, {last_name}, {chat_title}
 */
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
  const config = botDoc.config;

  return {
    handleUpdate: async (update) => {
      try {
        const msg = update.message;
        if (!msg) return;

        const chatId = msg.chat.id;
        const chatTitle = msg.chat.title;

        // Commande /start
        if (msg.text === '/start') {
          await bot.sendMessage(
            chatId,
            `👋 <b>Bot de bienvenue activé !</b>\n\n` +
            `Ajoutez-moi dans un groupe et je accueillerai automatiquement les nouveaux membres.\n\n` +
            `N'oubliez pas de me donner les droits d'administrateur !`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // Nouveaux membres dans un groupe
        if (msg.new_chat_members && msg.new_chat_members.length > 0) {
          for (const member of msg.new_chat_members) {
            // Ignorer si c'est le bot lui-même qui rejoint
            const me = await bot.getMe();
            if (member.id === me.id) continue;

            const welcomeTemplate = config.welcome_joinMessage || '👋 Bienvenue {first_name} dans le groupe !';
            const welcomeMsg = interpolate(welcomeTemplate, {
              username: member.username,
              first_name: member.first_name,
              last_name: member.last_name,
              chat_title: chatTitle,
            });

            await bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'HTML' });
            await botDoc.addLog('info', `Bienvenue envoyé à ${member.first_name} dans ${chatTitle}`);
            await botDoc.incrementStats();
          }
        }

        // Membres quittant le groupe
        if (msg.left_chat_member) {
          const member = msg.left_chat_member;
          const me = await bot.getMe();
          if (member.id === me.id) return;

          const leaveTemplate = config.welcome_leaveMessage || '👋 Au revoir {first_name} !';
          const leaveMsg = interpolate(leaveTemplate, {
            username: member.username,
            first_name: member.first_name,
            last_name: member.last_name,
            chat_title: chatTitle,
          });

          await bot.sendMessage(chatId, leaveMsg, { parse_mode: 'HTML' });
          await botDoc.addLog('info', `Au revoir envoyé pour ${member.first_name}`);
        }

      } catch (error) {
        console.error('WelcomeBot error:', error.message);
        await botDoc.addLog('error', `Erreur: ${error.message}`);
      }
    },
  };
};

module.exports = { createWelcomeBot };
