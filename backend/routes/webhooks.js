// routes/webhooks.js
const express = require('express');
const router  = express.Router();
const Bot     = require('../models/Bot');

const { createEchoBot      } = require('../bot-templates/echoBot');
const { createWelcomeBot   } = require('../bot-templates/welcomeBot');
const { createPollBot      } = require('../bot-templates/pollBot');
const { createReminderBot  } = require('../bot-templates/reminderBot');
const { createTranslateBot } = require('../bot-templates/translateBot');
const { createStatsBot     } = require('../bot-templates/statsBot');

// Cache des instances TelegramBot (le bot lui-même est coûteux à instancier)
// On cache SEULEMENT l'instance TelegramBot + la config, pas le botDoc.
const botInstanceCache = new Map();

const getBotHandler = (botDoc) => {
  const id = botDoc._id.toString();
  const cached = botInstanceCache.get(id);

  // Invalider si la config/template a changé
  if (cached && cached.configHash === botDoc.updatedAt?.getTime()) {
    return cached.handler;
  }

  let handler;
  switch (botDoc.template) {
    case 'echo':      handler = createEchoBot(botDoc);      break;
    case 'welcome':   handler = createWelcomeBot(botDoc);   break;
    case 'poll':      handler = createPollBot(botDoc);      break;
    case 'reminder':  handler = createReminderBot(botDoc);  break;
    case 'translate': handler = createTranslateBot(botDoc); break;
    case 'stats':     handler = createStatsBot(botDoc);     break;
    default: return null;
  }

  botInstanceCache.set(id, { handler, configHash: botDoc.updatedAt?.getTime() });
  return handler;
};

// ─── POST /api/webhooks/:secret  (Telegram → bot) ────────────────────────
router.post('/:secret', async (req, res) => {
  res.sendStatus(200); // Répondre immédiatement à Telegram

  const { secret } = req.params;
  const update = req.body;

  try {
    // Toujours charger un botDoc FRAIS depuis la DB pour que les stats
    // soient correctes (incrementStats utilise l'_id, pas l'objet en mémoire)
    const botDoc = await Bot.findOne({ webhookSecret: secret });
    if (!botDoc || !botDoc.isActive) return;

    const handler = getBotHandler(botDoc);
    if (!handler) {
      console.error(`Template inconnu: ${botDoc.template}`);
      return;
    }

    // On passe le botDoc FRAIS au handler (les templates acceptent un 2e arg)
    await handler.handleUpdate(update, botDoc);

  } catch (err) {
    console.error(`Erreur webhook (${secret}):`, err.message);
  }
});

// ─── GET /api/webhooks/debug/:secret  (diagnostic frontend) ──────────────
router.get('/debug/:secret', async (req, res) => {
  try {
    const bot = await Bot.findOne({ webhookSecret: req.params.secret })
      .select('name template isActive telegramUsername stats logs webhookSecret token');

    if (!bot) return res.json({ found: false });

    // Vérifier le statut du webhook Telegram (appel getWebhookInfo)
    let webhookInfo = null;
    try {
      const TelegramBot = require('node-telegram-bot-api');
      const tgBot = new TelegramBot(bot.token, { polling: false });
      webhookInfo = await tgBot.getWebHookInfo();
    } catch (_) {}

    const lastLogs = bot.logs.slice(-3).reverse();

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
      lastLogs,
    });
  } catch (err) {
    res.status(500).json({ found: false, error: err.message });
  }
});

module.exports = router;
