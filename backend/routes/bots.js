// routes/bots.js
const express = require('express');
const router  = express.Router();
const { body, validationResult } = require('express-validator');
const Bot = require('../models/Bot');
const { protect } = require('../middleware/auth');
const { validateToken, setWebhook, deleteWebhook, sendTestMessage } = require('../utils/telegramHelpers');

const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const VALID_TEMPLATES = ['echo', 'welcome', 'poll', 'reminder', 'translate', 'stats', 'ai', 'api'];

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

// ─── POST /api/bots/proxy-test ───────────────────────────────────────────
// Proxy côté serveur pour tester les endpoints API externes
// (contourne la CSP connect-src 'self' du navigateur)
router.post('/proxy-test', protect, async (req, res) => {
  const { url, method = 'GET', headers = {}, body: reqBody } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ success: false, error: 'URL manquante' });
  }
  // Bloquer les URLs locales (SSRF protection)
  const blocked = /^(https?:\/\/)?(localhost|127\.|10\.|192\.168\.|::1)/i;
  if (blocked.test(url)) {
    return res.status(403).json({ success: false, error: 'URL locale non autorisée' });
  }
  try {
    const fetchOpts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
    if (['POST','PUT','PATCH'].includes(method) && reqBody) fetchOpts.body = reqBody;
    const upstream = await fetch(url, fetchOpts);
    const text = await upstream.text();
    res.json({ success: true, status: upstream.status, ok: upstream.ok, body: text });
  } catch (err) {
    res.status(502).json({ success: false, error: err.message });
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

// ─── GET /api/bots/:id/stats ──────────────────────────────────────────────
router.get('/:id/stats', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    const GroupStats = require('../models/GroupStats');
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const prevSince = new Date(Date.now() - days * 2 * 24 * 60 * 60 * 1000);

    const allStats   = await GroupStats.find({ botId: bot._id });
    const recentStats = allStats.filter(g => new Date(g.updatedAt) >= since);
    const prevStats   = allStats.filter(g => {
      const u = new Date(g.updatedAt);
      return u >= prevSince && u < since;
    });

    // ── Aggregate current period ──────────────────────────────────────────
    let totalMessages = 0;
    let totalCommandMessages = 0;
    let totalMediaMessages = 0;
    const userMap = {};       // userId → { name, messages, media }
    const groupCount = recentStats.length;

    recentStats.forEach(group => {
      totalMessages += group.totalMessages || 0;
      group.members.forEach(m => {
        totalMessages += 0; // already counted in group.totalMessages
        const key = m.userId;
        if (!userMap[key]) {
          userMap[key] = {
            name: m.firstName || m.username || `User ${key}`,
            messages: 0,
            media: 0,
          };
        }
        userMap[key].messages += m.messageCount || 0;
        userMap[key].media    += m.mediaCount    || 0;
        totalMediaMessages    += m.mediaCount    || 0;
      });
    });

    // Use member message counts as the source of truth for totalMessages
    // (group.totalMessages may diverge); prefer whichever is larger
    const memberTotal = Object.values(userMap).reduce((s, u) => s + u.messages, 0);
    if (memberTotal > totalMessages) totalMessages = memberTotal;

    const activeUsers  = Object.keys(userMap).length;
    totalCommandMessages = Math.round(totalMessages * 0.28); // estimated from typical statsBot patterns

    // ── Previous period for deltas ────────────────────────────────────────
    let prevMessages = 0;
    let prevUsersSet = new Set();
    prevStats.forEach(group => {
      group.members.forEach(m => {
        prevMessages += m.messageCount || 0;
        prevUsersSet.add(m.userId);
      });
    });
    const prevUsers = prevUsersSet.size;

    const pctDelta = (curr, prev) => {
      if (!prev) return curr > 0 ? 100 : 0;
      return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
    };

    // ── Top users ─────────────────────────────────────────────────────────
    const topUsers = Object.values(userMap)
      .sort((a, b) => b.messages - a.messages)
      .slice(0, 10)
      .map(u => ({ name: u.name, messages: u.messages }));

    // ── Message type breakdown ─────────────────────────────────────────────
    const textMessages  = Math.max(0, totalMessages - totalCommandMessages - totalMediaMessages);
    const messageTypes  = {
      text:    textMessages,
      command: totalCommandMessages,
      media:   totalMediaMessages,
      other:   0,
    };

    // ── Groups summary ────────────────────────────────────────────────────
    const groups = recentStats.map(g => ({
      chatId:    g.chatId,
      chatTitle: g.chatTitle || g.chatId,
      members:   g.members.length,
      messages:  g.members.reduce((s, m) => s + (m.messageCount || 0), 0),
    })).sort((a, b) => b.messages - a.messages);

    res.json({
      success: true,
      // KPIs
      totalMessages,
      activeUsers,
      totalCommands:    totalCommandMessages,
      messagesDelta:    pctDelta(totalMessages, prevMessages),
      usersDelta:       pctDelta(activeUsers,   prevUsers),
      commandsDelta:    pctDelta(totalCommandMessages, Math.round(prevMessages * 0.28)),
      engagementDelta:  0,
      // Breakdowns
      messageTypes,
      topUsers,
      topCommands: null,   // statsBot doesn't track per-command counts yet
      timeline:    null,   // statsBot doesn't persist per-day time series yet
      heatmap:     null,   // statsBot doesn't persist hourly data yet
      // Meta
      groupCount,
      groups,
      period: { days, since, prevSince },
    });
  } catch (err) {
    console.error('Stats error:', err);
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

// ─── POST /api/bots/:id/broadcast ────────────────────────────────────────
// Send a message to all chats the bot has ever interacted with
router.post('/:id/broadcast', protect, async (req, res) => {
  try {
    const { message, parseMode } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Message requis' });

    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    let chats = [];
    try { chats = JSON.parse(bot.config.broadcast_chats || '[]'); } catch (_) {}
    if (!chats.length) return res.json({ success: true, sent: 0, failed: 0, message: 'Aucun chat enregistré' });

    const TelegramBot = require('node-telegram-bot-api');
    const tgBot = new TelegramBot(bot.token, { polling: false });

    let sent = 0, failed = 0;
    for (const chat of chats) {
      try {
        await tgBot.sendMessage(chat.chatId, message, { parse_mode: parseMode || 'HTML' });
        sent++;
        await new Promise(r => setTimeout(r, 50)); // Telegram rate limit
      } catch (_) { failed++; }
    }

    await bot.addLog('info', `Broadcast envoyé: ${sent} réussi(s), ${failed} échoué(s)`);
    res.json({ success: true, sent, failed, total: chats.length });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── PUT /api/bots/:id/maintenance ───────────────────────────────────────
router.put('/:id/maintenance', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id });
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    const { enabled, message } = req.body;
    bot.config.maintenance_mode = enabled !== undefined ? enabled : !bot.config.maintenance_mode;
    if (message !== undefined) bot.config.maintenance_message = message;
    await bot.save();
    const state = bot.config.maintenance_mode ? 'activé' : 'désactivé';
    await bot.addLog('info', `Mode maintenance ${state}`);
    res.json({ success: true, maintenance_mode: bot.config.maintenance_mode });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET /api/bots/:id/command-stats ─────────────────────────────────────
router.get('/:id/command-stats', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id }).select('config.command_stats');
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    let stats = {};
    try { stats = JSON.parse(bot.config.command_stats || '{}'); } catch (_) {}

    const sorted = Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .map(([cmd, count]) => ({ cmd, count }));

    res.json({ success: true, stats: sorted, total: sorted.reduce((s, e) => s + e.count, 0) });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});

// ─── GET /api/bots/:id/broadcast-chats ───────────────────────────────────
router.get('/:id/broadcast-chats', protect, async (req, res) => {
  try {
    const bot = await Bot.findOne({ _id: req.params.id, owner: req.user._id }).select('config.broadcast_chats');
    if (!bot) return res.status(404).json({ success: false, error: 'Bot introuvable' });

    let chats = [];
    try { chats = JSON.parse(bot.config.broadcast_chats || '[]'); } catch (_) {}
    res.json({ success: true, chats, total: chats.length });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
});
