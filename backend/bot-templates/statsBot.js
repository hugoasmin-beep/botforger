// bot-templates/statsBot.js - Template 6: Bot de Stats de Groupe
const TelegramBot = require('node-telegram-bot-api');
const GroupStats = require('../models/GroupStats');

const createStatsBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });
  const config = botDoc.config;

  /**
   * Récupère ou crée les stats d'un groupe
   */
  const getOrCreateStats = async (chatId, chatTitle) => {
    let stats = await GroupStats.findOne({ botId: botDoc._id, chatId: String(chatId) });
    if (!stats) {
      stats = await GroupStats.create({
        botId: botDoc._id,
        chatId: String(chatId),
        chatTitle,
        members: [],
        totalMessages: 0,
        weekStart: new Date(),
      });
    }
    return stats;
  };

  /**
   * Incrémente les stats d'un membre
   */
  const trackMember = async (stats, user, isMedia = false) => {
    const existingIdx = stats.members.findIndex(m => m.userId === String(user.id));

    if (existingIdx >= 0) {
      stats.members[existingIdx].messageCount += 1;
      if (isMedia && config.stats_trackMedia) stats.members[existingIdx].mediaCount += 1;
      stats.members[existingIdx].lastSeen = new Date();
      stats.members[existingIdx].username = user.username;
      stats.members[existingIdx].firstName = user.first_name;
    } else {
      stats.members.push({
        userId: String(user.id),
        username: user.username,
        firstName: user.first_name,
        messageCount: 1,
        mediaCount: isMedia ? 1 : 0,
        lastSeen: new Date(),
      });
    }

    stats.totalMessages += 1;
    stats.updatedAt = new Date();
    await stats.save();
  };

  return {
    handleUpdate: async (update) => {
      try {
        const msg = update.message;
        if (!msg) return;

        const chatId = msg.chat.id;
        const chatType = msg.chat.type;
        const chatTitle = msg.chat.title || 'Chat privé';
        const sender = msg.from;

        // Ignorer les bots
        if (!sender || sender.is_bot) return;

        // /start (messages privés)
        if (msg.text === '/start') {
          await bot.sendMessage(
            chatId,
            `📊 <b>Bot de Statistiques</b>\n\n` +
            `Ajoutez-moi dans un groupe pour tracker les statistiques des membres !\n\n` +
            `Commandes disponibles dans un groupe :\n` +
            `/stats - Classement des membres\n` +
            `/mystats - Vos stats personnelles\n` +
            `/topmsg - Top messages\n` +
            `/resetstats - Reset (admin uniquement)`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // Dans les groupes: tracker les messages
        if (chatType === 'group' || chatType === 'supergroup') {
          const stats = await getOrCreateStats(chatId, chatTitle);
          const isMedia = !!(msg.photo || msg.video || msg.audio || msg.document || msg.sticker);

          // Tracker seulement les vrais messages (pas les commandes)
          if (!msg.text?.startsWith('/')) {
            await trackMember(stats, sender, isMedia);
            await botDoc.incrementStats();
          }

          // /stats - Classement
          if (msg.text === '/stats') {
            const freshStats = await GroupStats.findOne({ botId: botDoc._id, chatId: String(chatId) });
            if (!freshStats || freshStats.members.length === 0) {
              await bot.sendMessage(chatId, '📊 Pas encore de statistiques pour ce groupe.');
              return;
            }

            const sorted = [...freshStats.members]
              .sort((a, b) => b.messageCount - a.messageCount)
              .slice(0, 10);

            const medals = ['🥇', '🥈', '🥉'];
            let response = `📊 <b>Classement - ${chatTitle}</b>\n`;
            response += `<i>Total: ${freshStats.totalMessages} messages</i>\n\n`;

            sorted.forEach((member, idx) => {
              const medal = medals[idx] || `${idx + 1}.`;
              const name = member.username ? `@${member.username}` : member.firstName || 'Anonyme';
              response += `${medal} ${name}: <b>${member.messageCount}</b> msgs`;
              if (config.stats_trackMedia && member.mediaCount > 0) {
                response += ` (📸 ${member.mediaCount})`;
              }
              response += '\n';
            });

            await bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
            return;
          }

          // /mystats - Stats personnelles
          if (msg.text === '/mystats') {
            const freshStats = await GroupStats.findOne({ botId: botDoc._id, chatId: String(chatId) });
            const memberData = freshStats?.members.find(m => m.userId === String(sender.id));

            if (!memberData) {
              await bot.sendMessage(chatId, `${sender.first_name}, vous n'avez pas encore de messages trackés dans ce groupe.`);
              return;
            }

            const rank = freshStats.members
              .sort((a, b) => b.messageCount - a.messageCount)
              .findIndex(m => m.userId === String(sender.id)) + 1;

            await bot.sendMessage(
              chatId,
              `📊 <b>Vos stats, ${sender.first_name} :</b>\n\n` +
              `💬 Messages : <b>${memberData.messageCount}</b>\n` +
              `📸 Médias : <b>${memberData.mediaCount}</b>\n` +
              `🏆 Rang : <b>#${rank}</b> sur ${freshStats.members.length}\n` +
              `🕐 Dernière activité : ${memberData.lastSeen.toLocaleDateString('fr-FR')}`,
              { parse_mode: 'HTML' }
            );
            return;
          }

          // /resetstats (admin uniquement)
          if (msg.text === '/resetstats') {
            try {
              const chatMember = await bot.getChatMember(chatId, sender.id);
              const isAdmin = ['administrator', 'creator'].includes(chatMember.status);

              if (!isAdmin) {
                await bot.sendMessage(chatId, '❌ Seuls les administrateurs peuvent reset les stats.');
                return;
              }

              await GroupStats.findOneAndUpdate(
                { botId: botDoc._id, chatId: String(chatId) },
                { members: [], totalMessages: 0, weekStart: new Date() }
              );

              await bot.sendMessage(chatId, '✅ Statistiques remises à zéro !');
              await botDoc.addLog('info', `Stats resetées pour ${chatTitle} par ${sender.first_name}`);
            } catch (e) {
              await bot.sendMessage(chatId, '❌ Impossible de vérifier les permissions.');
            }
            return;
          }
        }

      } catch (error) {
        console.error('StatsBot error:', error.message);
        await botDoc.addLog('error', `Erreur: ${error.message}`);
      }
    },
  };
};

module.exports = { createStatsBot };
