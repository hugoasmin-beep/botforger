// utils/richMessage.js — Envoie des blocs riches (texte, image, GIF, boutons)
// Compatible avec n'importe quel template bot

const interpolate = (template, data) => {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => data[k] !== undefined ? data[k] : `{${k}}`);
};

/**
 * Parse les boutons depuis un tableau 2D de blocks.buttons
 * Format: [[{text,type,value},...], ...]
 */
const buildInlineKeyboard = (buttons) => {
  if (!buttons || !Array.isArray(buttons) || buttons.length === 0) return undefined;
  try {
    return {
      inline_keyboard: buttons.map(row =>
        (Array.isArray(row) ? row : [row]).filter(b => b.text).map(btn => {
          if (btn.type === 'url')  return { text: btn.text, url: btn.value || '#' };
          if (btn.type === 'call') return { text: btn.text, url: `tel:${btn.value}` };
          return { text: btn.text, callback_data: btn.value || btn.text };
        })
      ).filter(row => row.length > 0),
    };
  } catch (_) { return undefined; }
};

/**
 * Envoie une liste de blocs riches dans un chat Telegram
 * @param {TelegramBot} bot
 * @param {string|number} chatId
 * @param {Array} blocks - [{type:'text'|'image'|'gif'|'buttons', content, url, buttons}]
 * @param {Object} vars - variables à interpoler dans les textes
 */
const sendBlocks = async (bot, chatId, blocks, vars = {}) => {
  if (!blocks || blocks.length === 0) return;

  // Grouper les boutons avec le dernier bloc texte précédent
  let pendingText     = null;
  let pendingButtons  = null;

  for (const block of blocks) {
    if (block.type === 'text') {
      // Envoyer le texte précédent si on a un nouveau texte
      if (pendingText !== null) {
        await bot.sendMessage(chatId, interpolate(pendingText, vars), {
          parse_mode: 'HTML',
          reply_markup: pendingButtons,
        }).catch(async () =>
          bot.sendMessage(chatId, interpolate(pendingText, vars), { reply_markup: pendingButtons })
        );
        pendingButtons = null;
      }
      pendingText = block.content || '';

    } else if (block.type === 'buttons') {
      pendingButtons = buildInlineKeyboard(block.buttons);

    } else if (block.type === 'image') {
      // Envoyer le texte en attente d'abord
      if (pendingText !== null) {
        await bot.sendMessage(chatId, interpolate(pendingText, vars), {
          parse_mode: 'HTML',
          reply_markup: pendingButtons,
        }).catch(() => bot.sendMessage(chatId, interpolate(pendingText, vars), { reply_markup: pendingButtons }));
        pendingText    = null;
        pendingButtons = null;
      }
      if (block.url) {
        await bot.sendPhoto(chatId, block.url, { parse_mode: 'HTML' }).catch(() => {});
      }

    } else if (block.type === 'gif') {
      if (pendingText !== null) {
        await bot.sendMessage(chatId, interpolate(pendingText, vars), {
          parse_mode: 'HTML',
          reply_markup: pendingButtons,
        }).catch(() => bot.sendMessage(chatId, interpolate(pendingText, vars), { reply_markup: pendingButtons }));
        pendingText    = null;
        pendingButtons = null;
      }
      if (block.url) {
        await bot.sendAnimation(chatId, block.url).catch(() => {});
      }
    }
  }

  // Envoyer le dernier texte en attente
  if (pendingText !== null) {
    await bot.sendMessage(chatId, interpolate(pendingText, vars), {
      parse_mode: 'HTML',
      reply_markup: pendingButtons,
    }).catch(() => bot.sendMessage(chatId, interpolate(pendingText, vars), { reply_markup: pendingButtons }));
  }
};

/**
 * Parse les blocs depuis la config (string JSON ou array)
 */
const parseBlocks = (blocksConfig) => {
  if (!blocksConfig) return [];
  if (Array.isArray(blocksConfig)) return blocksConfig;
  try { return JSON.parse(blocksConfig); } catch (_) { return []; }
};

module.exports = { sendBlocks, parseBlocks, buildInlineKeyboard, interpolate };
