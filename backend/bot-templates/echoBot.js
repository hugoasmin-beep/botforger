// bot-templates/echoBot.js
// Universal "smart bot" — handles text replies, images, welcome messages,
// keyword triggers, and custom commands. Falls back to echo if nothing matches.
const TelegramBot = require('node-telegram-bot-api');
const { interpolate, buildInlineKeyboard } = require('../utils/richMessage');

const safeJSON = (str) => {
  if (!str) return [];
  if (Array.isArray(str)) return str;
  try { return JSON.parse(str); } catch (_) { return []; }
};

const matchesTriggers = (text, triggersStr) => {
  const t = (triggersStr || '').trim();
  if (!t) return true;
  const lower = text.toLowerCase();
  return t.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
           .some(kw => lower.includes(kw));
};

const safeSend = async (bot, chatId, text, opts = {}) => {
  if (!text) return;
  try {
    await bot.sendMessage(chatId, text, { parse_mode: 'HTML', ...opts });
  } catch (_) {
    await bot.sendMessage(chatId, text, opts).catch(() => {});
  }
};

const sendImageBlock = async (bot, chatId, block, vars) => {
  if (!block.image_url) return;
  const caption  = interpolate(block.caption || '', vars);
  const keyboard = block.buttons ? buildInlineKeyboard(safeJSON(block.buttons)) : undefined;
  const opts = {};
  if (caption)  opts.caption      = caption;
  if (keyboard) opts.reply_markup = keyboard;
  try {
    await bot.sendPhoto(chatId, block.image_url, opts);
  } catch (e) {
    await bot.sendMessage(chatId, `Could not load image.`).catch(() => {});
  }
};

const createEchoBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });

  return {
    handleUpdate: async (update, freshDoc = botDoc) => {
      try {
        const msg = update.message;
        if (!msg) return;

        const chatId    = msg.chat.id;
        const chatTitle = msg.chat.title || '';
        const config    = freshDoc.config;
        const firstName = msg.from?.first_name || 'User';
        const userId    = msg.from?.id;
        const vars      = {
          first_name: firstName,
          last_name:  msg.from?.last_name  || '',
          username:   msg.from?.username   || firstName,
          user_id:    userId,
          chat_title: chatTitle,
        };

        // 1. New member joined
        if (msg.new_chat_members?.length > 0) {
          if (config.welcome_enabled || config.welcome_joinMessage) {
            const me = await bot.getMe().catch(() => null);
            for (const member of msg.new_chat_members) {
              if (me && member.id === me.id) continue;
              const mVars = {
                ...vars,
                first_name: member.first_name || 'User',
                last_name:  member.last_name  || '',
                username:   member.username   || member.first_name || 'User',
              };
              await safeSend(bot, chatId,
                interpolate(config.welcome_joinMessage || 'Welcome {first_name}!', mVars));
              await freshDoc.addLog('info', `Welcome sent to ${member.first_name}`);
            }
          }
          return;
        }

        // 2. Member left
        if (msg.left_chat_member) {
          if (config.welcome_leaveMessage) {
            const member = msg.left_chat_member;
            const me = await bot.getMe().catch(() => null);
            if (me && member.id === me.id) return;
            const mVars = {
              ...vars,
              first_name: member.first_name || 'User',
              username:   member.username   || member.first_name || 'User',
            };
            await safeSend(bot, chatId, interpolate(config.welcome_leaveMessage, mVars));
          }
          return;
        }

        // Only handle text from here
        if (!msg.text) return;
        const text = msg.text;

        // 3. /start
        if (text === '/start') {
          const startMsg = config.echo_welcomeMessage
            || `Hi ${firstName}! I am ready.`;
          await safeSend(bot, chatId, interpolate(startMsg, vars));
          await freshDoc.addLog('info', `/start from ${firstName} (${chatId})`);
          return;
        }

        // 4. /help
        if (text === '/help') {
          const cmds = safeJSON(config.custom_commands);
          let helpText = `🤖 <b>${freshDoc.name}</b>\n\n`;
          if (cmds.length > 0) {
            helpText += '<b>Commands:</b>\n';
            cmds.forEach(c => {
              if (c.name) helpText += `/${c.name}${c.desc ? ' — ' + c.desc : ''}\n`;
            });
          }
          helpText += '/start — Welcome message\n/help — This help';
          await safeSend(bot, chatId, helpText);
          return;
        }

        // 5. Image trigger blocks (checked before text, more specific)
        const imgBlocks = safeJSON(config.custom_image_replies);
        for (const block of imgBlocks) {
          if (matchesTriggers(text, block.triggers)) {
            await sendImageBlock(bot, chatId, block, vars);
            await freshDoc.incrementStats(userId);
            await freshDoc.addLog('info', `Image reply sent to ${firstName}`);
            return;
          }
        }

        // 6. Text reply blocks
        const txtBlocks = safeJSON(config.custom_text_replies);
        for (const block of txtBlocks) {
          if (matchesTriggers(text, block.triggers)) {
            const reply = interpolate(block.message || '', { ...vars, query: text });
            await safeSend(bot, chatId, reply);
            await freshDoc.incrementStats(userId);
            await freshDoc.addLog('info', `Text reply sent to ${firstName}`);
            return;
          }
        }

        // 7. Legacy single-block compat
        if (config.echo_welcomeMessage && matchesTriggers(text, config.api_triggers || '')) {
          await safeSend(bot, chatId, interpolate(config.echo_welcomeMessage, { ...vars, query: text }));
          await freshDoc.incrementStats(userId);
          return;
        }
        if (config.image_url && matchesTriggers(text, config.image_triggers || '')) {
          await sendImageBlock(bot, chatId, {
            image_url: config.image_url,
            caption:   config.image_caption || '',
          }, vars);
          await freshDoc.incrementStats(userId);
          return;
        }

        // 8. Pure echo fallback (only if bot has no custom blocks at all)
        const hasBlocks = imgBlocks.length > 0 || txtBlocks.length > 0
          || config.welcome_enabled || safeJSON(config.custom_commands).length > 0
          || config.echo_welcomeMessage || config.image_url;
        if (!hasBlocks) {
          const prefix = config.echo_prefix ? config.echo_prefix + ' ' : '';
          await bot.sendMessage(chatId, `${prefix}${text}`);
          await freshDoc.incrementStats(userId);
        }

      } catch (err) {
        console.error('SmartBot error:', err.message);
        await freshDoc.addLog('error', `Error: ${err.message}`);
      }
    },
  };
};

module.exports = { createEchoBot };
