# 🤖 BotForge — Créez des bots Telegram sans coder

> Plateforme SaaS pour créer, configurer et gérer des bots Telegram via une interface graphique simple. Aucune ligne de code nécessaire pour les utilisateurs finaux.

---

## 📋 Table des matières

- [Aperçu](#aperçu)
- [Templates disponibles](#templates-disponibles)
- [Stack technique](#stack-technique)
- [Installation locale](#installation-locale)
- [Déploiement en production](#déploiement-en-production)
- [Structure du projet](#structure-du-projet)
- [Variables d'environnement](#variables-denvironnement)
- [API Reference](#api-reference)
- [Sécurité](#sécurité)

---

## Aperçu

BotForge permet à n'importe qui de créer un bot Telegram en moins de 5 minutes :

1. **Inscription** → Créer un compte avec email/mot de passe
2. **Token** → Entrer son token obtenu via @BotFather
3. **Template** → Choisir parmi 6 templates prêts à l'emploi
4. **Personnaliser** → Configurer les messages via une interface simple
5. **C'est en ligne !** → Le bot répond automatiquement via webhooks

---

## Templates disponibles

| Template | Description | Commandes |
|----------|-------------|-----------|
| 🔁 **Echo** | Répond en écho à chaque message | /start, /help |
| 👋 **Welcome** | Accueille les nouveaux membres | Automatique |
| 🗳️ **Poll** | Crée des sondages interactifs | /poll, /quickpoll |
| ⏰ **Reminder** | Programme des rappels | /remind, /reminders, /cancel |
| 🌍 **Translate** | Traduit dans 14 langues | /translate, /setlang, /langs |
| 📊 **Stats** | Classement des membres | /stats, /mystats, /resetstats |

---

## Stack technique

- **Backend** : Node.js + Express.js
- **Base de données** : MongoDB (Mongoose)
- **API Telegram** : node-telegram-bot-api (mode webhook)
- **Auth** : JWT + bcryptjs
- **Traductions** : MyMemory API (gratuite)
- **Rappels** : node-cron (scheduler)
- **Sécurité** : helmet, express-rate-limit, express-validator
- **Frontend** : HTML/CSS/JS vanilla (SPA)

---

## Installation locale

### Prérequis

- Node.js v18+ ([télécharger](https://nodejs.org))
- MongoDB local ou compte [MongoDB Atlas](https://www.mongodb.com/atlas) (gratuit)
- Un compte Telegram et accès à @BotFather

### Étapes

```bash
# 1. Cloner le repo
git clone https://github.com/votre-user/botforge.git
cd botforge

# 2. Installer les dépendances backend
cd backend
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditez .env avec vos valeurs (voir section Variables)

# 4. Démarrer MongoDB (si local)
mongod --dbpath ./data/db
# OU utiliser MongoDB Atlas (recommandé)

# 5. Démarrer le serveur
npm run dev   # Mode développement (avec nodemon)
# OU
npm start     # Mode production
```

Le serveur démarre sur `http://localhost:3000`

### ⚠️ Note importante pour le développement local

Les webhooks Telegram nécessitent une URL HTTPS publique. Pour développer en local, utilisez [ngrok](https://ngrok.com) :

```bash
# Dans un autre terminal
ngrok http 3000

# Mettez à jour SITE_URL dans .env avec l'URL ngrok
# Ex: SITE_URL=https://abc123.ngrok.io
```

---

## Déploiement en production

### Option 1 : Render.com (Recommandé, gratuit)

1. **Créer un compte** sur [render.com](https://render.com)

2. **Nouveau Web Service** → connecter votre repo GitHub

3. **Configuration** :
   - **Build Command** : `cd backend && npm install`
   - **Start Command** : `cd backend && npm start`
   - **Root Directory** : laisser vide

4. **Variables d'environnement** dans Render :
   ```
   NODE_ENV=production
   MONGODB_URI=mongodb+srv://...
   JWT_SECRET=votre_secret_super_long
   SITE_URL=https://votre-app.onrender.com
   PORT=3000
   ```

5. **Déployer** → Render génère une URL HTTPS automatiquement

### Option 2 : Railway.app

```bash
# Installer Railway CLI
npm install -g @railway/cli

railway login
railway init
railway up
```

Configurez les variables d'environnement dans le dashboard Railway.

### Option 3 : VPS (Ubuntu)

```bash
# Sur le serveur
git clone https://github.com/votre-user/botforge.git
cd botforge/backend
npm install --production

# Installer PM2
npm install -g pm2

# Démarrer avec PM2
pm2 start server.js --name botforge
pm2 save
pm2 startup

# Nginx comme reverse proxy (recommandé)
# Voir config Nginx ci-dessous
```

**Config Nginx** (`/etc/nginx/sites-available/botforge`) :
```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Puis activer HTTPS avec Certbot :
```bash
sudo certbot --nginx -d votre-domaine.com
```

---

## Structure du projet

```
botforge/
├── backend/
│   ├── models/
│   │   ├── User.js          # Utilisateurs (email, password, plan)
│   │   ├── Bot.js           # Bots (token, config, stats, logs)
│   │   ├── Reminder.js      # Rappels programmés
│   │   └── GroupStats.js    # Stats de groupe (template stats)
│   ├── routes/
│   │   ├── auth.js          # POST /register, /login, GET /me
│   │   ├── bots.js          # CRUD bots + toggle + logs + test
│   │   └── webhooks.js      # POST /webhooks/:secret (Telegram)
│   ├── bot-templates/
│   │   ├── echoBot.js       # Template 1: Echo
│   │   ├── welcomeBot.js    # Template 2: Welcome
│   │   ├── pollBot.js       # Template 3: Sondages
│   │   ├── reminderBot.js   # Template 4: Rappels
│   │   ├── translateBot.js  # Template 5: Traduction
│   │   └── statsBot.js      # Template 6: Stats
│   ├── middleware/
│   │   └── auth.js          # JWT middleware
│   ├── utils/
│   │   ├── telegramHelpers.js  # validateToken, setWebhook, etc.
│   │   └── scheduler.js        # Cron job pour les rappels
│   ├── database.js
│   ├── server.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   └── public/
│       ├── index.html       # Landing page
│       ├── login.html       # Connexion
│       ├── register.html    # Inscription
│       ├── dashboard.html   # Dashboard principal
│       ├── bots.html        # Liste des bots
│       ├── create-bot.html  # Créer un bot
│       ├── bot-detail.html  # Gérer un bot
│       ├── css/
│       │   └── style.css    # Styles complets
│       └── js/
│           └── app.js       # Utilitaires JS partagés
└── README.md
```

---

## Variables d'environnement

| Variable | Description | Exemple |
|----------|-------------|---------|
| `PORT` | Port du serveur | `3000` |
| `NODE_ENV` | Environnement | `production` |
| `MONGODB_URI` | URL MongoDB | `mongodb+srv://...` |
| `JWT_SECRET` | Clé secrète JWT (min 32 chars) | `super_secret_key_123...` |
| `SITE_URL` | URL publique du site (sans /) | `https://botforge.onrender.com` |
| `MYMEMORY_API_KEY` | Clé API MyMemory (optionnel) | `votre_clé` |

---

## API Reference

### Auth
```
POST /api/auth/register  { email, password }
POST /api/auth/login     { email, password }
GET  /api/auth/me        (Authorization: Bearer <token>)
```

### Bots
```
GET    /api/bots                 Liste des bots
POST   /api/bots                 Créer un bot { name, token, template, config }
GET    /api/bots/:id             Détails d'un bot
PUT    /api/bots/:id             Modifier { name?, config? }
DELETE /api/bots/:id             Supprimer
PUT    /api/bots/:id/toggle      Activer/désactiver
GET    /api/bots/:id/logs        Logs d'activité
POST   /api/bots/:id/test        Envoyer message test { chatId }
```

### Webhooks Telegram
```
POST /api/webhooks/:secret       Reçoit les updates Telegram (public)
```

---

## Sécurité

- **Mots de passe** : hashés avec bcrypt (salt rounds: 12)
- **JWT** : expire après 7 jours, validé à chaque requête protégée
- **Rate limiting** : 100 req/15min global, 10 req/15min pour l'auth
- **Validation** : tous les inputs validés avec express-validator
- **Tokens Telegram** : masqués dans les réponses API
- **Webhooks** : sécurisés par UUID unique par bot
- **CORS** : configuré pour l'URL de production uniquement
- **Helmet** : headers de sécurité HTTP

---

## Limitations (plan gratuit)

- **3 bots maximum** par compte
- **100 logs** conservés par bot (rotation automatique)
- **10 rappels actifs** maximum par utilisateur (template Reminder)
- **500 caractères** maximum par traduction (template Translate)

---

## Développer un nouveau template

1. Créer `backend/bot-templates/monTemplate.js` :

```javascript
const TelegramBot = require('node-telegram-bot-api');

const createMonTemplate = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });

  return {
    handleUpdate: async (update) => {
      const msg = update.message;
      if (!msg?.text) return;

      // Votre logique ici
      await bot.sendMessage(msg.chat.id, 'Réponse !');
      await botDoc.incrementStats();
    },
  };
};

module.exports = { createMonTemplate };
```

2. Enregistrer dans `routes/webhooks.js`
3. Ajouter dans le schema `Bot.js` (enum template)
4. Ajouter dans `TEMPLATES` dans `frontend/public/js/app.js`

---

## Licence

MIT — Libre d'utilisation, modification et distribution.
