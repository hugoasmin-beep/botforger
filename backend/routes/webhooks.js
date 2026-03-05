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
const { createAiBot        } = require('../bot-templates/aiBot');
const { createApiBot       } = require('../bot-templates/apiBot');

const botInstanceCache = new Map();

const getBotHandler = (botDoc) => {
  const id     = botDoc._id.toString();
  const cached = botInstanceCache.get(id);
  if (cached && cached.configHash === botDoc.updatedAt?.getTime()) return cached.handler;

  let handler;
  switch (botDoc.template) {
    case 'echo':      handler = createEchoBot(botDoc);      break;
    case 'welcome':   handler = createWelcomeBot(botDoc);   break;
    case 'poll':      handler = createPollBot(botDoc);      break;
    case 'reminder':  handler = createReminderBot(botDoc);  break;
    case 'translate': handler = createTranslateBot(botDoc); break;
    case 'stats':     handler = createStatsBot(botDoc);     break;
    case 'ai':        handler = createAiBot(botDoc);        break;
    case 'api':        handler = createApiBot(botDoc);       break;
    default: return null;
  }

  botInstanceCache.set(id, { handler, configHash: botDoc.updatedAt?.getTime() });
  return handler;
};

// POST /api/webhooks/:secret
router.post('/:secret', async (req, res) => {
  res.sendStatus(200);
  const { secret } = req.params;
  try {
    const botDoc = await Bot.findOne({ webhookSecret: secret });
    if (!botDoc || !botDoc.isActive) return;
    const handler = getBotHandler(botDoc);
    if (!handler) return;
    await handler.handleUpdate(req.body, botDoc);
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
