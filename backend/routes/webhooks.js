// routes/webhooks.js - Réception des updates Telegram via webhooks
const express = require('express');
const router = express.Router();
const Bot = require('../models/Bot');

// Import des templates
const { createEchoBot } = require('../bot-templates/echoBot');
const { createWelcomeBot } = require('../bot-templates/welcomeBot');
const { createPollBot } = require('../bot-templates/pollBot');
const { createReminderBot } = require('../bot-templates/reminderBot');
const { createTranslateBot } = require('../bot-templates/translateBot');
const { createStatsBot } = require('../bot-templates/statsBot');

// Cache des instances de bots (évite de recréer à chaque requête)
const botInstanceCache = new Map();

/**
 * Retourne l'instance du bot correspondant au template
 */
const getBotHandler = (botDoc) => {
  const cacheKey = `${botDoc._id}_${botDoc.updatedAt}`;

  // Invalider le cache si le bot a été mis à jour
  if (botInstanceCache.has(botDoc._id.toString())) {
    const cached = botInstanceCache.get(botDoc._id.toString());
    if (cached.updatedAt !== botDoc.updatedAt?.getTime()) {
      botInstanceCache.delete(botDoc._id.toString());
    } else {
      return cached.handler;
    }
  }

  let handler;
  switch (botDoc.template) {
    case 'echo':
      handler = createEchoBot(botDoc);
      break;
    case 'welcome':
      handler = createWelcomeBot(botDoc);
      break;
    case 'poll':
      handler = createPollBot(botDoc);
      break;
    case 'reminder':
      handler = createReminderBot(botDoc);
      break;
    case 'translate':
      handler = createTranslateBot(botDoc);
      break;
    case 'stats':
      handler = createStatsBot(botDoc);
      break;
    default:
      return null;
  }

  // Mettre en cache
  botInstanceCache.set(botDoc._id.toString(), {
    handler,
    updatedAt: botDoc.updatedAt?.getTime(),
  });

  return handler;
};

// @route  POST /api/webhooks/:secret
// @desc   Reçoit les updates Telegram
// @access Public (sécurisé par le secret unique)
router.post('/:secret', async (req, res) => {
  // Répondre immédiatement à Telegram (timeout 60s sinon)
  res.sendStatus(200);

  const { secret } = req.params;
  const update = req.body;

  try {
    // Trouver le bot correspondant au secret webhook
    const botDoc = await Bot.findOne({ webhookSecret: secret });

    if (!botDoc) {
      console.warn(`Webhook reçu pour secret inconnu: ${secret}`);
      return;
    }

    if (!botDoc.isActive) {
      return; // Bot désactivé, ignorer les updates
    }

    // Obtenir le handler du bon template
    const handler = getBotHandler(botDoc);
    if (!handler) {
      console.error(`Template inconnu: ${botDoc.template}`);
      return;
    }

    // Traiter l'update
    await handler.handleUpdate(update);

  } catch (error) {
    console.error(`Erreur webhook (${secret}):`, error.message);
  }
});

module.exports = router;
