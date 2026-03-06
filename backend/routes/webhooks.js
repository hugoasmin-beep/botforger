// routes/webhooks.js
const express = require('express');
const router  = express.Router();
const Bot     = require('../models/Bot');
const TelegramBot = require('node-telegram-bot-api');

const { createEchoBot      } = require('../bot-templates/echoBot');
const { createWelcomeBot   } = require('../bot-templates/welcomeBot');
const { createPollBot      } = require('../bot-templates/pollBot');
const { createReminderBot  } = require('../bot-templates/reminderBot');
const { createTranslateBot } = require('../bot-templates/translateBot');
const { createStatsBot     } = require('../bot-templates/statsBot');
const { createAiBot        } = require('../bot-templates/aiBot');
const { createApiBot       } = require('../bot-templates/apiBot');

// ─── Cache des instances de bot ───────────────────────────────────────────
// Clé : botId, Valeur : { handler, configHash, tgBot }
const botInstanceCache = new Map();

// ─── Rate limiter store (in-memory, per botId:userId) ─────────────────────
// Map<"botId:userId", { count, windowStart }>
const rateLimitStore = new Map();

// ─── Universal pre/post middleware ────────────────────────────────────────
const universalMiddleware = async (update, botDoc, tgBot) => {
  const msg = update.message || update.edited_message;
  if (!msg) return { pass: true };

  const config    = botDoc.config;
  const chatId    = msg.chat?.id;
  const userId    = msg.from?.id;
  const chatTitle = msg.chat?.title || msg.chat?.first_name || String(chatId);
  const firstName = msg.from?.first_name || 'User';

  // ── 1. Track chat for broadcast ──────────────────────────────────────
  if (chatId) {
    // Fire-and-forget
    botDoc.trackChat(chatId, chatTitle).catch(() => {});
  }

  // ── 2. Maintenance mode ───────────────────────────────────────────────
  if (config.maintenance_mode) {
    const maintMsg = config.maintenance_message || '🔧 Bot en maintenance.';
    await tgBot.sendMessage(chatId, maintMsg, { parse_mode: 'HTML' }).catch(() => {});
    await botDoc.addLog('info', `[Maintenance] Message ignoré de ${firstName}`);
    return { pass: false };
  }

  // ── 3. Blacklist ──────────────────────────────────────────────────────
  if (config.blacklist_enabled && userId) {
    const ids = (config.blacklist_ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.includes(String(userId))) {
      await botDoc.addLog('warning', `[Blacklist] User ${userId} (${firstName}) bloqué`);
      return { pass: false };
    }
  }

  // ── 4. Whitelist ──────────────────────────────────────────────────────
  if (config.whitelist_enabled && userId) {
    const ids = (config.whitelist_ids || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length > 0 && !ids.includes(String(userId))) {
      await botDoc.addLog('warning', `[Whitelist] User ${userId} (${firstName}) non autorisé`);
      return { pass: false };
    }
  }

  // ── 5. Rate limiter ───────────────────────────────────────────────────
  if (config.rate_limit_enabled && userId && chatId) {
    const max     = parseInt(config.rate_limit_max)        || 5;
    const winSec  = parseInt(config.rate_limit_window_sec) || 60;
    const key     = `${botDoc._id}:${userId}`;
    const now     = Date.now();
    const entry   = rateLimitStore.get(key) || { count: 0, windowStart: now };

    if (now - entry.windowStart > winSec * 1000) {
      // New window
      entry.count = 1; entry.windowStart = now;
    } else {
      entry.count++;
    }
    rateLimitStore.set(key, entry);

    if (entry.count > max) {
      const ratMsg = config.rate_limit_message || '⏱ Trop de messages ! Patientez.';
      if (entry.count === max + 1) { // Only send warning once per window
        await tgBot.sendMessage(chatId, ratMsg, { parse_mode: 'HTML' }).catch(() => {});
        await botDoc.addLog('warning', `[RateLimit] User ${userId} (${firstName}) limité`);
      }
      return { pass: false };
    }
  }

  // ── 6. Track command stats ────────────────────────────────────────────
  if (msg.text?.startsWith('/')) {
    const cmd = msg.text.split(' ')[0].split('@')[0].toLowerCase();
    botDoc.trackCommand(cmd).catch(() => {});
  }

  return { pass: true, needsDefaultMsg: true };
};


const getBotHandler = (botDoc) => {
  const id     = botDoc._id.toString();
  const cached = botInstanceCache.get(id);

  // Hash basé sur updatedAt + template pour détecter tout changement
  const configHash = botDoc.updatedAt
    ? `${botDoc.template}:${botDoc.updatedAt.getTime()}`
    : `${botDoc.template}:0`;

  if (cached && cached.configHash === configHash) return cached;

  let handler;
  switch (botDoc.template) {
    case 'echo':      handler = createEchoBot(botDoc);      break;
    case 'welcome':   handler = createWelcomeBot(botDoc);   break;
    case 'poll':      handler = createPollBot(botDoc);      break;
    case 'reminder':  handler = createReminderBot(botDoc);  break;
    case 'translate': handler = createTranslateBot(botDoc); break;
    case 'stats':     handler = createStatsBot(botDoc);     break;
    case 'ai':        handler = createAiBot(botDoc);        break;
    case 'api':       handler = createApiBot(botDoc);       break;
    default: return null;
  }

  // Instance Telegram dédiée au traitement des commandes personnalisées
  const tgBot = new TelegramBot(botDoc.token, { polling: false });

  const entry = { handler, configHash, tgBot };
  botInstanceCache.set(id, entry);
  return entry;
};

// ─── Traitement universel des commandes personnalisées ────────────────────
// Appelé avant le handler du template. Retourne true si la commande a été traitée.
const handleCustomCommand = async (update, botDoc, tgBot) => {
  const msg = update.message;
  if (!msg || !msg.text || !msg.text.startsWith('/')) return false;

  const rawCmd   = msg.text.split(' ')[0];               // ex: /test ou /test@MonBot
  const cmdName  = rawCmd.slice(1).split('@')[0].toLowerCase(); // ex: test
  const chatId   = msg.chat.id;
  const firstName = msg.from?.first_name || 'Utilisateur';

  let commands = [];
  try {
    const raw = botDoc.config?.custom_commands;
    if (raw) commands = JSON.parse(raw);
  } catch (_) {}

  // Legacy : command_name + command_reply (premier bloc de l'ancien create-bot)
  if (!commands.length && botDoc.config?.command_name) {
    commands = [{ name: botDoc.config.command_name, reply: botDoc.config.command_reply || '', parse_mode: 'HTML' }];
  }

  const match = commands.find(c => (c.name || '').toLowerCase() === cmdName);
  if (!match) return false;

  let reply = (match.reply || '').replace(/{first_name}/g, firstName);

  const sendOpts = { parse_mode: match.parse_mode || 'HTML' };

  // Boutons inline optionnels
  if (match.buttons) {
    try {
      const btns = JSON.parse(match.buttons);
      if (Array.isArray(btns) && btns.length > 0) {
        sendOpts.reply_markup = {
          inline_keyboard: btns.map(row =>
            row.map(b => {
              if (b.type === 'url')      return { text: b.text, url: b.value };
              if (b.type === 'callback') return { text: b.text, callback_data: b.value };
              return { text: b.text, callback_data: b.value || b.text };
            })
          ),
        };
      }
    } catch (_) {}
  }

  if (reply) {
    if (match.reply_image_url) {
      // Send photo with caption
      await tgBot.sendPhoto(chatId, match.reply_image_url, {
        caption:     reply,
        parse_mode:  match.parse_mode || 'HTML',
        ...(sendOpts.reply_markup ? { reply_markup: sendOpts.reply_markup } : {}),
      }).catch(async () => {
        // Image failed, send text only
        await tgBot.sendMessage(chatId, reply, sendOpts);
      });
    } else {
      await tgBot.sendMessage(chatId, reply, sendOpts);
    }
  }

  await botDoc.incrementStats(msg.from?.id);
  await botDoc.addLog('info', `Commande /${cmdName} exécutée pour ${firstName} (${chatId})`);
  return true;
};

// POST /api/webhooks/:secret
router.post('/:secret', async (req, res) => {
  res.sendStatus(200);
  const { secret } = req.params;
  try {
    const botDoc = await Bot.findOne({ webhookSecret: secret });
    if (!botDoc || !botDoc.isActive) return;

    const cached = getBotHandler(botDoc);
    if (!cached) return;

    // 0. Universal middleware (maintenance, blacklist, whitelist, rate limit, tracking)
    const mw = await universalMiddleware(req.body, botDoc, cached.tgBot);
    if (!mw.pass) return;

    // 1. Custom commands (priority)
    const handled = await handleCustomCommand(req.body, botDoc, cached.tgBot);
    if (handled) return;

    // 2. Template handler
    const templateHandled = await cached.handler.handleUpdate(req.body, botDoc);

    // 3. Default message fallback
    const msg = req.body.message;
    if (templateHandled === false && msg && msg.text && !msg.text.startsWith('/')) {
      const cfg = botDoc.config;
      if (cfg.default_message_enabled && cfg.default_message_text) {
        const chatId = msg.chat && msg.chat.id;
        const firstName = (msg.from && msg.from.first_name) || 'User';
        const reply = cfg.default_message_text
          .replace(/{first_name}/g, firstName)
          .replace(/{query}/g, msg.text);
        await cached.tgBot.sendMessage(chatId, reply, { parse_mode: 'HTML' }).catch(() => {});
      }
    }
  } catch (err) {
    console.error(`Erreur webhook (${secret}):`, err.message);
  }
});

// GET /api/webhooks/debug/:secret
router.get('/debug/:secret', async (req, res) => {
  try {
    const bot = await Bot.findOne({ webhookSecret: req.params.secret })
      .select('name template isActive telegramUsername stats logs webhookSecret token config');
    if (!bot) return res.json({ found: false });

    let webhookInfo = null;
    try {
      const TelegramBot = require('node-telegram-bot-api');
      const tg = new TelegramBot(bot.token, { polling: false });
      webhookInfo = await tg.getWebHookInfo();
    } catch (_) {}

    res.json({
      found: true,
      name: bot.name,
      template: bot.template,
      isActive: bot.isActive,
      tokenMasked: bot.getMaskedToken(),
      totalMessages: bot.stats?.totalMessages ?? 0,
      activeUsers: bot.stats?.activeUsers ?? 0,
      lastActivity: bot.stats?.lastActivity ?? null,
      webhookUrl: webhookInfo?.url || null,
      webhookPending: webhookInfo?.pending_update_count ?? null,
      aiEnabled: bot.config?.ai_enabled ?? false,
      lastLogs: bot.logs.slice(-3).reverse(),
    });
  } catch (err) {
    res.status(500).json({ found: false, error: err.message });
  }
});

module.exports = router;
