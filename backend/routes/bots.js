// routes/bots.js
const express = require('express');
const router  = express.Router();
const { body, validationResult } = require('express-validator');
const Bot = require('../models/Bot');
const { protect } = require('../middleware/auth');
const { validateToken, setWebhook, deleteWebhook, sendTestMessage } = require('../utils/telegramHelpers');

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const VALID_TEMPLATES = ['echo', 'welcome', 'poll', 'reminder', 'translate', 'stats', 'ai'];

// ─── GET /api/bots ────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const bots = await Bot.find({ owner: req.user._id }).select('-token -logs').sort({ createdAt: -1 });
    const safeBots = bots.map(bot => {
      const obj = bot.toObject();
      obj.token = bot.getMaskedToken();
      if (obj.config?.ai_apiKey) obj.config.ai_apiKey = bot.getMaskedApiKey();
      return obj;
    });
    res.json({ success: true, bots: safeBots });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET /api/bots/validate-token ────────────────────────────────────────
// Doit être AVANT /:id sinon Express le capture comme id="validate-token"
router.post('/validate-token', protect, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ success: false, error: 'Token requis' });

  const result = await validateToken(token);
  if (result.valid) {
    res.json({ success: true, botInfo: result.botInfo });
  } else {
    res.status(400).json({ success: false, error: result.error });
  }
});

// ─── GET /api/bots/:id ────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    const botObj = bot.toObject();
    botObj.tokenMasked = bot.getMaskedToken();
    if (botObj.config?.ai_apiKey) botObj.config.ai_apiKey = bot.getMaskedApiKey();
    delete botObj.token;

    res.json({ success: true, bot: botObj });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── POST /api/bots ───────────────────────────────────────────────────────
router.post('/',
  protect,
  [
    body('name').trim().notEmpty().withMessage('Nom requis').isLength({ max: 50 }),
    body('token').trim().notEmpty().withMessage('Token requis'),
    body('template').isIn(VALID_TEMPLATES).withMessage('Template invalide'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, token, template, config } = req.body;

    try {
      const botCount = await Bot.countDocuments({ owner: req.user._id });
      if (botCount >= req.user.botsLimit) {
        return res.status(403).json({ success: false, error: `Limite atteinte (${req.user.botsLimit} bots max)` });
      }

      const existing = await Bot.findOne({ token });
      if (existing) return res.status(400).json({ success: false, error: 'Ce token est déjà utilisé' });

      const validation = await validateToken(token);
      if (!validation.valid) return res.status(400).json({ success: false, error: `Token invalide: ${validation.error}` });

      const bot = await Bot.create({
        owner: req.user._id,
        name,
        token,
        template,
        telegramUsername: validation.botInfo?.username,
        config: config || {},
      });

      const webhookUrl = `${SITE_URL}/api/webhooks/${bot.webhookSecret}`;
      const webhookResult = await setWebhook(token, webhookUrl);
      await bot.addLog('info', webhookResult.success
        ? `Bot créé et webhook configuré: ${webhookUrl}`
        : `Bot créé mais webhook non configuré: ${webhookResult.error}`
      );

      const botObj = bot.toObject();
      delete botObj.token;
      botObj.tokenMasked = bot.getMaskedToken();

      res.status(201).json({ success: true, bot: botObj, botInfo: validation.botInfo });
    } catch (err) {
      console.error('Create bot error:', err);
      res.status(500).json({ success: false, error: 'Erreur serveur' });
    }
  }
);

// ─── PUT /api/bots/:id ────────────────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    const { name, config } = req.body;
    if (name) bot.name = name;

    if (config) {
      const existing = bot.config.toObject ? bot.config.toObject() : { ...bot.config };
      // Si l'API key est masquée (contient •), ne pas l'écraser
      if (config.ai_apiKey && config.ai_apiKey.includes('•')) {
        delete config.ai_apiKey;
      }
      bot.config = { ...existing, ...config };
    }

    await bot.save();
    await bot.addLog('info', 'Configuration mise à jour');

    const botObj = bot.toObject();
    delete botObj.token;
    botObj.tokenMasked = bot.getMaskedToken();
    if (botObj.config?.ai_apiKey) botObj.config.ai_apiKey = bot.getMaskedApiKey();

    res.json({ success: true, bot: botObj });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── PUT /api/bots/:id/toggle ─────────────────────────────────────────────
router.put('/:id/toggle', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    bot.isActive = !bot.isActive;
    await bot.save();
    const status = bot.isActive ? 'activé' : 'désactivé';
    await bot.addLog('info', `Bot ${status}`);
    res.json({ success: true, isActive: bot.isActive, message: `Bot ${status}` });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── PUT /api/bots/:id/ai-key ─────────────────────────────────────────────
// Endpoint dédié pour mettre à jour la clé API IA (pour éviter qu'elle circule partout)
router.put('/:id/ai-key', protect, async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ success: false, error: 'apiKey requis' });

    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    bot.config.ai_apiKey = apiKey;
    bot.config.ai_enabled = true;
    await bot.save();
    await bot.addLog('info', 'Clé API IA mise à jour');

    res.json({ success: true, maskedKey: bot.getMaskedApiKey() });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── DELETE /api/bots/:id ─────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    await deleteWebhook(bot.token);
    await Bot.findByIdAndDelete(bot._id);
    res.json({ success: true, message: 'Bot supprimé' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET /api/bots/:id/logs ───────────────────────────────────────────────
router.get('/:id/logs', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id }).select('logs');
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });
    res.json({ success: true, logs: bot.logs.slice().reverse() });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── POST /api/bots/:id/test ──────────────────────────────────────────────
router.post('/:id/test', protect, async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ success: false, error: 'chatId requis' });

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
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

module.exports = router;
