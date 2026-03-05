// bot-templates/statsBot.js - Template 6: Bot de Stats de Groupe
const TelegramBot = require('node-telegram-bot-api');
const GroupStats  = require('../models/GroupStats');

const createStatsBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });

  const getOrCreateStats = async (botId, chatId, chatTitle) => {
    let stats = await GroupStats.findOne({ botId, chatId: String(chatId) });
    if (!stats) {
      stats = await GroupStats.create({ botId, chatId: String(chatId), chatTitle, members: [], totalMessages: 0, weekStart: new Date() });
    }
    return stats;
  };

  const trackMember = async (stats, user, trackMedia, isMedia) => {
    const idx = stats.members.findIndex(m => m.userId === String(user.id));
    if (idx >= 0) {
      stats.members[idx].messageCount += 1;
      if (isMedia && trackMedia) stats.members[idx].mediaCount += 1;
      stats.members[idx].lastSeen  = new Date();
      stats.members[idx].username  = user.username;
      stats.members[idx].firstName = user.first_name;
    } else {
      stats.members.push({ userId: String(user.id), username: user.username, firstName: user.first_name, messageCount: 1, mediaCount: isMedia ? 1 : 0, lastSeen: new Date() });
    }
    stats.totalMessages += 1;
    stats.updatedAt = new Date();
    await stats.save();
  };

  return {
    handleUpdate: async (update, freshDoc = botDoc) => {
      try {
        const msg = update.message;
        if (!msg) return;

        const chatId    = msg.chat.id;
        const chatType  = msg.chat.type;
        const chatTitle = msg.chat.title || 'Chat privé';
        const sender    = msg.from;
        const config    = freshDoc.config;

        if (!sender || sender.is_bot) return;

        if (msg.text === '/start') {
          await bot.sendMessage(chatId,
            `📊 <b>Bot de Statistiques</b>\n\nAjoutez-moi dans un groupe pour tracker les statistiques des membres !\n\nCommandes disponibles dans un groupe :\n/stats - Classement des membres\n/mystats - Vos stats personnelles\n/topmsg - Top messages\n/resetstats - Reset (admin uniquement)`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        if (chatType === 'group' || chatType === 'supergroup') {
          const stats  = await getOrCreateStats(freshDoc._id, chatId, chatTitle);
          const isMedia = !!(msg.photo || msg.video || msg.audio || msg.document || msg.sticker);

          // Tracker les messages non-commandes
          if (!msg.text?.startsWith('/')) {
            await trackMember(stats, sender, config.stats_trackMedia, isMedia);
            await freshDoc.incrementStats(sender.id);
          }

          if (msg.text === '/stats') {
            const s = await GroupStats.findOne({ botId: freshDoc._id, chatId: String(chatId) });
            if (!s || s.members.length === 0) { await bot.sendMessage(chatId, '📊 Pas encore de statistiques pour ce groupe.'); return; }
            const sorted = [...s.members].sort((a, b) => b.messageCount - a.messageCount).slice(0, 10);
            const medals = ['🥇', '🥈', '🥉'];
            let response = `📊 <b>Classement - ${chatTitle}</b>\n<i>Total: ${s.totalMessages} messages</i>\n\n`;
            sorted.forEach((m, i) => {
              const medal = medals[i] || `${i + 1}.`;
              const name  = m.username ? `@${m.username}` : m.firstName || 'Anonyme';
              response += `${medal} ${name}: <b>${m.messageCount}</b> msgs`;
              if (config.stats_trackMedia && m.mediaCount > 0) response += ` (📸 ${m.mediaCount})`;
              response += '\n';
            });
            await bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
            return;
          }

          if (msg.text === '/mystats') {
            const s          = await GroupStats.findOne({ botId: freshDoc._id, chatId: String(chatId) });
            const memberData = s?.members.find(m => m.userId === String(sender.id));
            if (!memberData) { await bot.sendMessage(chatId, `${sender.first_name}, vous n'avez pas encore de messages trackés dans ce groupe.`); return; }
            const rank = [...s.members].sort((a, b) => b.messageCount - a.messageCount).findIndex(m => m.userId === String(sender.id)) + 1;
            await bot.sendMessage(chatId,
              `📊 <b>Vos stats, ${sender.first_name} :</b>\n\n💬 Messages : <b>${memberData.messageCount}</b>\n📸 Médias : <b>${memberData.mediaCount}</b>\n🏆 Rang : <b>#${rank}</b> sur ${s.members.length}\n🕐 Dernière activité : ${memberData.lastSeen.toLocaleDateString('fr-FR')}`,
              { parse_mode: 'HTML' }
            );
            return;
          }

          if (msg.text === '/resetstats') {
            try {
              const chatMember = await bot.getChatMember(chatId, sender.id);
              if (!['administrator', 'creator'].includes(chatMember.status)) {
                await bot.sendMessage(chatId, '❌ Seuls les administrateurs peuvent reset les stats.');
                return;
              }
              await GroupStats.findOneAndUpdate({ botId: freshDoc._id, chatId: String(chatId) }, { members: [], totalMessages: 0, weekStart: new Date() });
              await bot.sendMessage(chatId, '✅ Statistiques remises à zéro !');
              await freshDoc.addLog('info', `Stats resetées pour ${chatTitle} par ${sender.first_name}`);
            } catch (e) {
              await bot.sendMessage(chatId, '❌ Impossible de vérifier les permissions.');
            }
            return;
          }

          // Reset automatique hebdomadaire
          if (config.stats_resetWeekly) {
            const stats2 = await GroupStats.findOne({ botId: freshDoc._id, chatId: String(chatId) });
            if (stats2 && stats2.weekStart) {
              const weekMs = 7 * 24 * 60 * 60 * 1000;
              if (Date.now() - stats2.weekStart.getTime() > weekMs) {
                await GroupStats.findByIdAndUpdate(stats2._id, { members: [], totalMessages: 0, weekStart: new Date() });
              }
            }
          }
        }

      } catch (err) {
        console.error('StatsBot error:', err.message);
        await freshDoc.addLog('error', `Erreur: ${err.message}`);
      }
    },
  };
};

module.exports = { createStatsBot };
