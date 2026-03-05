// routes/bots.js - Gestion des bots (CRUD + contrôles)
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Bot = require('../models/Bot');
const { protect } = require('../middleware/auth');
const { validateToken, setWebhook, deleteWebhook, sendTestMessage } = require('../utils/telegramHelpers');

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';

// Templates disponibles
const VALID_TEMPLATES = ['echo', 'welcome', 'poll', 'reminder', 'translate', 'stats'];

// @route  GET /api/bots
// @desc   Liste les bots de l'utilisateur
// @access Private
router.get('/', protect, async (req, res) => {
  try {
    const bots = await Bot.find({ owner: req.user._id })
      .select('-token -logs') // Ne pas retourner le token et les logs complets
      .sort({ createdAt: -1 });

    // Masquer les tokens
    const safeBots = bots.map(bot => ({
      ...bot.toObject(),
      token: bot.getMaskedToken(),
    }));

    res.json({ success: true, bots: safeBots });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// @route  GET /api/bots/:id
// @desc   Récupère un bot spécifique
// @access Private
router.get('/:id', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });

    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot introuvable' });
    }

    const botObj = bot.toObject();
    botObj.tokenMasked = bot.getMaskedToken();
    delete botObj.token; // Ne pas retourner le token en clair

    res.json({ success: true, bot: botObj });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// @route  POST /api/bots
// @desc   Créer un nouveau bot
// @access Private
router.post(
  '/',
  protect,
  [
    body('name').trim().notEmpty().withMessage('Nom requis').isLength({ max: 50 }),
    body('token').trim().notEmpty().withMessage('Token requis'),
    body('template').isIn(VALID_TEMPLATES).withMessage('Template invalide'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, token, template, config } = req.body;

    try {
      // Vérifier la limite de bots
      const botCount = await Bot.countDocuments({ owner: req.user._id });
      if (botCount >= req.user.botsLimit) {
        return res.status(403).json({
          success: false,
          error: `Limite atteinte (${req.user.botsLimit} bots max sur le plan gratuit)`,
        });
      }

      // Vérifier que le token n'est pas déjà utilisé
      const existingBot = await Bot.findOne({ token });
      if (existingBot) {
        return res.status(400).json({
          success: false,
          error: 'Ce token est déjà utilisé par un autre bot',
        });
      }

      // Valider le token avec Telegram
      const validation = await validateToken(token);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: `Token Telegram invalide: ${validation.error}`,
        });
      }

      // Créer le bot
      const bot = await Bot.create({
        owner: req.user._id,
        name,
        token,
        template,
        telegramUsername: validation.botInfo?.username,
        config: config || {},
      });

      // Configurer le webhook
      const webhookUrl = `${SITE_URL}/api/webhooks/${bot.webhookSecret}`;
      const webhookResult = await setWebhook(token, webhookUrl);

      if (webhookResult.success) {
        await bot.addLog('info', `Bot créé et webhook configuré: ${webhookUrl}`);
      } else {
        await bot.addLog('warning', `Bot créé mais webhook non configuré: ${webhookResult.error}`);
      }

      const botObj = bot.toObject();
      delete botObj.token;
      botObj.tokenMasked = bot.getMaskedToken();

      res.status(201).json({
        success: true,
        bot: botObj,
        botInfo: validation.botInfo,
      });
    } catch (error) {
      console.error('Create bot error:', error);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

// @route  PUT /api/bots/:id
// @desc   Modifier la configuration d'un bot
// @access Private
router.put('/:id', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });

    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot introuvable' });
    }

    const { name, config } = req.body;

    if (name) bot.name = name;
    if (config) {
      // Merge de la config existante avec la nouvelle
      bot.config = { ...bot.config.toObject(), ...config };
    }

    await bot.save();
    await bot.addLog('info', 'Configuration mise à jour');

    const botObj = bot.toObject();
    delete botObj.token;
    botObj.tokenMasked = bot.getMaskedToken();

    res.json({ success: true, bot: botObj });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// @route  PUT /api/bots/:id/toggle
// @desc   Activer/Désactiver un bot
// @access Private
router.put('/:id/toggle', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });

    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot introuvable' });
    }

    bot.isActive = !bot.isActive;
    await bot.save();

    const status = bot.isActive ? 'activé' : 'désactivé';
    await bot.addLog('info', `Bot ${status}`);

    res.json({ success: true, isActive: bot.isActive, message: `Bot ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// @route  DELETE /api/bots/:id
// @desc   Supprimer un bot
// @access Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });

    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot introuvable' });
    }

    // Supprimer le webhook Telegram
    await deleteWebhook(bot.token);

    await Bot.findByIdAndDelete(bot._id);

    res.json({ success: true, message: 'Bot supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// @route  GET /api/bots/:id/logs
// @desc   Récupérer les logs d'un bot
// @access Private
router.get('/:id/logs', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id }).select('logs');

    if (!bot) {
      return res.status(404).json({ success: false, error: 'Bot introuvable' });
    }

    const logs = bot.logs.slice().reverse(); // Derniers en premier
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// @route  POST /api/bots/:id/test
// @desc   Envoyer un message de test
// @access Private
router.post('/:id/test', protect, async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) {
      return res.status(400).json({ success: false, error: 'chatId requis' });
    }

    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    const result = await sendTestMessage(
      bot.token,
      chatId,
      `🧪 <b>Message de test BotForge</b>\n\nVotre bot <b>${bot.name}</b> fonctionne correctement !`
    );

    if (result.success) {
      await bot.addLog('info', `Message de test envoyé à ${chatId}`);
      res.json({ success: true, message: 'Message de test envoyé' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
