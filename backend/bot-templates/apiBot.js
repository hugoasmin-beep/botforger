// bot-templates/apiBot.js — Template: Bot API Endpoint
const TelegramBot = require('node-telegram-bot-api');

const getByPath = (obj, path) => {
  if (!path || path === '.') return JSON.stringify(obj, null, 2);
  try { return path.split('.').reduce((acc, key) => acc?.[key], obj); }
  catch (_) { return undefined; }
};

const interpolate = (template, vars) =>
  String(template || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined ? vars[k] : `{${k}}`);

const parseHeaders = (headersText) => {
  const headers = {};
  if (!headersText) return headers;
  headersText.split('\n').forEach(line => {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return headers;
};

/**
 * Envoie un message riche (texte + boutons inline + image/gif)
 */
const sendRichMessage = async (bot, chatId, text, buttonsJson, mediaUrl, mediaType) => {
  // Build inline keyboard
  let replyMarkup;
  try {
    const btns = typeof buttonsJson === 'string' ? JSON.parse(buttonsJson) : buttonsJson;
    if (Array.isArray(btns) && btns.length > 0) {
      replyMarkup = {
        inline_keyboard: btns.map(row =>
          (Array.isArray(row) ? row : [row]).map(btn => {
            if (btn.type === 'url')      return { text: btn.text, url: btn.value };
            if (btn.type === 'callback') return { text: btn.text, callback_data: btn.value || btn.text };
            return { text: btn.text, callback_data: btn.value || btn.text };
          })
        ),
      };
    }
  } catch (_) {}

  const opts = { parse_mode: 'HTML', ...(replyMarkup ? { reply_markup: replyMarkup } : {}) };

  // Send media if provided
  if (mediaUrl) {
    if (mediaType === 'gif') {
      await bot.sendAnimation(chatId, mediaUrl, { caption: text, ...opts });
      return;
    }
    if (mediaType === 'image') {
      await bot.sendPhoto(chatId, mediaUrl, { caption: text, ...opts });
      return;
    }
  }

  await bot.sendMessage(chatId, text || '…', opts);
};

const createApiBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });
  const lastCall = new Map();

  return {
    handleUpdate: async (update, freshDoc = botDoc) => {
      try {
        // Callback query (bouton inline cliqué)
        if (update.callback_query) {
          await bot.answerCallbackQuery(update.callback_query.id);
          return;
        }

        const msg = update.message;
        if (!msg) return;

        const chatId    = msg.chat.id;
        const text      = msg.text || '';
        const firstName = msg.from?.first_name || 'Utilisateur';
        const userId    = msg.from?.id;
        const config    = freshDoc.config;

        if (text === '/start') {
          const welcome = config.api_welcome_message || `🔗 <b>Bot API</b>\n\nEnvoyez un mot-clé pour déclencher l'appel API.\n\n/help — Aide`;
          await bot.sendMessage(chatId, interpolate(welcome, { first_name: firstName }), { parse_mode: 'HTML' });
          return;
        }

        if (text === '/help') {
          const triggers   = (config.api_triggers || '').split(',').map(t => t.trim()).filter(Boolean);
          const triggerList = triggers.length ? triggers.map(t => `• <code>${t}</code>`).join('\n') : '• (tous les messages)';
          await bot.sendMessage(chatId,
            `🔗 <b>Bot API Endpoint</b>\n\n<b>Déclencheurs :</b>\n${triggerList}\n\n<b>Méthode :</b> ${config.api_method || 'GET'}\n<b>URL :</b> <code>${(config.api_url || '(non configuré)').substring(0, 80)}</code>`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // Vérifier triggers
        const triggers  = (config.api_triggers || '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
        const textLower = text.toLowerCase().trim();
        const triggered = triggers.length === 0 || triggers.some(t => textLower === t || textLower.startsWith(t + ' '));
        if (!triggered) return;

        // Cooldown
        const cooldown = parseInt(config.api_cooldown_ms) || 2000;
        if (lastCall.has(userId) && Date.now() - lastCall.get(userId) < cooldown) {
          await bot.sendMessage(chatId, '⏳ Veuillez patienter avant de refaire une requête.');
          return;
        }
        lastCall.set(userId, Date.now());

        await bot.sendChatAction(chatId, 'typing');

        const rawUrl = config.api_url || '';
        if (!rawUrl) { await bot.sendMessage(chatId, '❌ URL API non configurée.'); return; }

        // Extraire le paramètre
        const firstTrigger = triggers[0] || '';
        const param = textLower.startsWith(firstTrigger + ' ') ? text.slice(firstTrigger.length + 1).trim() : text;

        const url = interpolate(rawUrl, { query: encodeURIComponent(param), raw_query: param, user_id: userId, first_name: firstName });
        const method  = (config.api_method || 'GET').toUpperCase();
        const headers = { 'Content-Type': 'application/json', ...parseHeaders(config.api_headers) };

        const fetchOptions = { method, headers };
        if (['POST','PUT','PATCH'].includes(method) && config.api_body) {
          fetchOptions.body = interpolate(config.api_body, { query: param, raw_query: param, user_id: userId, first_name: firstName });
        }

        const fetch    = require('node-fetch');
        const response = await fetch(url, fetchOptions);

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          await bot.sendMessage(chatId, config.api_fallback_message || `❌ Erreur API: ${response.status}`, { parse_mode: 'HTML' });
          await freshDoc.addLog('error', `API ${method} ${url} → ${response.status}: ${errText.substring(0, 100)}`);
          return;
        }

        // Parse response
        let result;
        const ct = response.headers.get('content-type') || '';
        if (ct.includes('json')) {
          const json      = await response.json();
          const extracted = getByPath(json, config.api_response_path || '');
          result = extracted !== undefined ? String(extracted) : JSON.stringify(json, null, 2).substring(0, 3000);
        } else {
          result = (await response.text()).substring(0, 3000);
        }

        const message = interpolate(config.api_response_template || '🔗 Résultat :\n\n{result}', {
          result, query: param, raw_query: param, first_name: firstName, user_id: userId,
        });

        await sendRichMessage(bot, chatId, message, config.api_buttons);
        await freshDoc.addLog('info', `API call: ${method} ${url} → OK (${result.length} chars)`);
        await freshDoc.incrementStats(userId);

      } catch (err) {
        console.error('ApiBot error:', err.message);
        const chatId = update.message?.chat?.id;
        if (chatId) {
          await bot.sendMessage(chatId, freshDoc.config?.api_fallback_message || '❌ Erreur lors de l\'appel API.', { parse_mode: 'HTML' }).catch(() => {});
        }
        await freshDoc.addLog('error', `Erreur: ${err.message}`);
      }
    },
  };
};

module.exports = { createApiBot };
