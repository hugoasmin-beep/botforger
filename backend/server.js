// server.js - Point d'entrée principal de BotForge
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const connectDB = require('./database');
const { startScheduler } = require('./utils/scheduler');

// Routes
const authRoutes = require('./routes/auth');
const botRoutes = require('./routes/bots');
const webhookRoutes = require('./routes/webhooks');

const app = express();

// ============================================================
// Middlewares de sécurité
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

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.SITE_URL
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));

// Rate limiting global
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes par IP
  message: { success: false, error: 'Trop de requêtes, réessayez dans 15 minutes' },
});
app.use('/api/', limiter);

// Rate limiting strict pour l'auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Trop de tentatives, réessayez dans 15 minutes' },
});
app.use('/api/auth/', authLimiter);

// ============================================================
// Parsing
// ============================================================

// Les webhooks Telegram sont en raw pour pouvoir les vérifier
app.use('/api/webhooks', express.json({ limit: '1mb' }));

// Reste: JSON standard
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Routes API
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/webhooks', webhookRoutes);

// ============================================================
// Fichiers statiques (Frontend)
// ============================================================
app.use(express.static(path.join(__dirname, '../frontend/public')));

// SPA fallback - toutes les routes non-API servent index.html
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
  }
});

// ============================================================
// Gestion des erreurs
// ============================================================
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'development' ? err.message : 'Erreur serveur interne',
  });
});

// ============================================================
// Démarrage
// ============================================================
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  // Connexion MongoDB
  await connectDB();

  // Démarrer le scheduler de rappels
  startScheduler();

  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║      🤖 BotForge - Démarré          ║
║  Port    : ${PORT}                      ║
║  Mode    : ${process.env.NODE_ENV || 'development'}                ║
║  URL     : http://localhost:${PORT}      ║
╚══════════════════════════════════════╝
    `);
  });
};

startServer().catch(err => {
  console.error('Échec du démarrage:', err);
  process.exit(1);
});

module.exports = app;
