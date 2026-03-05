require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const connectDB = require('./database');
const { startScheduler } = require('./utils/scheduler');

const authRoutes = require('./routes/auth');
const botRoutes = require('./routes/bots');
const webhookRoutes = require('./routes/webhooks');

const app = express();

// ⚡ OBLIGATOIRE sur Wasmer/Vercel/Render (proxy)
app.set('trust proxy', 1);

// ============================================================
// WEBHOOKS EN PREMIER — Telegram n'est PAS un navigateur
// Doit être AVANT cors, helmet et rate-limit
// ============================================================
app.use('/api/webhooks', express.json({ limit: '1mb' }));
app.use('/api/webhooks', (req, res, next) => {
  console.log(`[WEBHOOK] ${req.method} ${req.path} body:`, JSON.stringify(req.body).substring(0, 100));
  next();
});
app.use('/api/webhooks', webhookRoutes);

// ============================================================
// Sécurité (après webhooks)
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS ouvert (les webhooks Telegram sont déjà gérés avant)
app.use(cors({ origin: '*' }));

// Rate limiting (ne touche PAS /api/webhooks déjà monté)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: 'Trop de requêtes' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Trop de tentatives' },
});
app.use('/api/auth/', authLimiter);

// ============================================================
// Parsing JSON (pour les autres routes)
// ============================================================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Routes API
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/bots', botRoutes);

// Route de diagnostic (tester que le serveur répond)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ============================================================
// Frontend statique
// ============================================================
app.use(express.static(path.join(__dirname, '../frontend/public')));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
  }
});

// ============================================================
// Erreurs
// ============================================================
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({ success: false, error: err.message });
});

// ============================================================
// Démarrage
// ============================================================
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
  startScheduler();
  app.listen(PORT, () => {
    console.log(`✅ BotForge démarré sur le port ${PORT}`);
    console.log(`   SITE_URL: ${process.env.SITE_URL || '⚠️  NON DÉFINI'}`);
  });
};

startServer().catch(err => {
  console.error('Échec du démarrage:', err);
  process.exit(1);
});

module.exports = app;
