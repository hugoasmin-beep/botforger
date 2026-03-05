// js/app.js - Utilitaires partagés pour toutes les pages dashboard
const API = 'https://botforger.vercel.app/api';

// ============================================================
// Auth helpers
// ============================================================
const Auth = {
  getToken() { return localStorage.getItem('bf_token'); },
  getUser() {
    try {
      return JSON.parse(localStorage.getItem('bf_user'));
    } catch { return null; }
  },
  logout() {
    localStorage.removeItem('bf_token');
    localStorage.removeItem('bf_user');
    window.location.href = '/login.html';
  },
  requireAuth() {
    if (!this.getToken()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },
};

// ============================================================
// API helper
// ============================================================
const api = async (endpoint, options = {}) => {
  const token = Auth.getToken();
  const res = await fetch(`${API}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    Auth.logout();
    return null;
  }

  const data = await res.json();
  return data;
};

// ============================================================
// Toast notifications
// ============================================================
const Toast = {
  container: null,
  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 4000) {
    if (!this.container) this.init();

    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || '•'}</span><span>${message}</span>`;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); },
};

// ============================================================
// Templates config
// ============================================================
const TEMPLATES = {
  echo: {
    emoji: '🔁',
    name: 'Bot Echo',
    desc: 'Répond le même message que l\'utilisateur',
    configFields: [
      { key: 'echo_welcomeMessage', label: 'Message de bienvenue', type: 'textarea', placeholder: '👋 Bonjour ! Je suis un bot echo.' },
      { key: 'echo_prefix', label: 'Préfixe (optionnel)', type: 'text', placeholder: 'Ex: "Echo:" ou laisser vide' },
    ],
  },
  welcome: {
    emoji: '👋',
    name: 'Bot de Bienvenue',
    desc: 'Accueille et salue les membres de groupe',
    configFields: [
      { key: 'welcome_joinMessage', label: 'Message de bienvenue', type: 'textarea', placeholder: '👋 Bienvenue {first_name} dans le groupe !', variables: true },
      { key: 'welcome_leaveMessage', label: 'Message d\'au revoir', type: 'textarea', placeholder: '👋 Au revoir {first_name} !', variables: true },
    ],
  },
  poll: {
    emoji: '🗳️',
    name: 'Bot de Sondages',
    desc: 'Crée des sondages interactifs avec /poll',
    configFields: [
      { key: 'poll_allowAnonymous', label: 'Sondages anonymes', type: 'toggle', hint: 'Si activé, les votes ne seront pas visibles' },
    ],
  },
  reminder: {
    emoji: '⏰',
    name: 'Bot de Rappels',
    desc: 'Programme des rappels avec /remind',
    configFields: [
      { key: 'reminder_timezone', label: 'Fuseau horaire', type: 'text', placeholder: 'Europe/Paris' },
    ],
  },
  translate: {
    emoji: '🌍',
    name: 'Bot Traducteur',
    desc: 'Traduit du texte dans 14 langues',
    configFields: [
      { key: 'translate_defaultLang', label: 'Langue par défaut', type: 'select', options: [
        { value: 'en', label: '🇬🇧 Anglais' },
        { value: 'fr', label: '🇫🇷 Français' },
        { value: 'es', label: '🇪🇸 Espagnol' },
        { value: 'de', label: '🇩🇪 Allemand' },
        { value: 'it', label: '🇮🇹 Italien' },
        { value: 'ar', label: '🇸🇦 Arabe' },
        { value: 'ru', label: '🇷🇺 Russe' },
        { value: 'zh', label: '🇨🇳 Chinois' },
      ]},
      { key: 'translate_welcomeMessage', label: 'Message de démarrage', type: 'text', placeholder: '🌍 Bonjour ! Envoyez /translate <texte>' },
    ],
  },
  stats: {
    emoji: '📊',
    name: 'Bot de Stats',
    desc: 'Classement des membres par activité',
    configFields: [
      { key: 'stats_resetWeekly', label: 'Reset automatique hebdomadaire', type: 'toggle' },
      { key: 'stats_trackMedia', label: 'Tracker aussi les médias', type: 'toggle' },
    ],
  },
  ai: {
    emoji: '✨',
    name: 'Bot IA',
    desc: 'Chatbot intelligent avec votre propre clé API',
    badge: 'NEW',
    configFields: [
      { key: 'ai_persona_name',    label: 'Nom du bot (persona)', type: 'text', placeholder: 'Mon Assistant IA' },
      { key: 'ai_persona_emoji',   label: 'Emoji avatar', type: 'text', placeholder: '🤖' },
      { key: 'ai_welcome_message', label: 'Message de bienvenue', type: 'textarea', placeholder: 'Bonjour {first_name} ! Comment puis-je vous aider ?', variables: true },
      { key: 'ai_system_prompt',   label: 'Prompt système (personnalité)', type: 'textarea', placeholder: 'Tu es un assistant IA utile et amical. Réponds en français.', hint: 'Définit le comportement et la personnalité du bot' },
      { key: 'ai_provider', label: 'Fournisseur IA', type: 'select', options: [
        { value: 'openai',  label: '🟢 OpenAI (ChatGPT)' },
        { value: 'mistral', label: '🟠 Mistral AI' },
        { value: 'groq',    label: '🔵 Groq (ultra rapide)' },
        { value: 'custom',  label: '⚙️ Endpoint personnalisé' },
      ]},
      { key: 'ai_model',    label: 'Modèle (laisser vide = auto)', type: 'text', placeholder: 'gpt-4o-mini / mistral-small / llama3-8b-8192', hint: 'Exemples: gpt-4o-mini, gpt-4o, mistral-large-latest' },
      { key: 'ai_endpoint', label: 'Endpoint API (optionnel, custom uniquement)', type: 'text', placeholder: 'https://api.openai.com/v1/chat/completions', hint: 'Laisser vide sauf pour un endpoint custom compatible OpenAI' },
      { key: 'ai_temperature', label: 'Créativité (0 = précis, 1 = créatif)', type: 'text', placeholder: '0.7' },
      // La clé API est gérée séparément via un champ sécurisé
    ],
  },
};

// ============================================================
// Sidebar & layout helpers
// ============================================================
const initLayout = () => {
  if (!Auth.requireAuth()) return false;

  const user = Auth.getUser();

  // Remplir les infos utilisateur dans la sidebar
  const userEmailEl = document.getElementById('sidebar-user-email');
  const userAvatarEl = document.getElementById('sidebar-user-avatar');
  const userPlanEl = document.getElementById('sidebar-user-plan');

  if (user) {
    if (userEmailEl) userEmailEl.textContent = user.email;
    if (userAvatarEl) userAvatarEl.textContent = user.email[0].toUpperCase();
    if (userPlanEl) userPlanEl.textContent = user.plan || 'FREE';
  }

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', Auth.logout);

  // Mobile menu
  const menuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.querySelector('.sidebar-overlay');

  menuBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay?.classList.toggle('active');
  });

  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('active');
  });

  // Active nav item
  const currentPage = window.location.pathname;
  document.querySelectorAll('.sidebar-nav-item[data-page]').forEach(item => {
    if (item.dataset.page && currentPage.includes(item.dataset.page)) {
      item.classList.add('active');
    }
  });

  return true;
};

// ============================================================
// Format helpers
// ============================================================
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatNumber = (n) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
};

// ============================================================
// Sidebar HTML component (reusable)
// ============================================================
const SIDEBAR_HTML = `
<nav class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <a href="/dashboard.html" class="sidebar-logo">
      <span class="logo-icon">🤖</span>
      BotForge
    </a>
  </div>

  <div class="sidebar-nav">
    <p class="sidebar-section-label">Navigation</p>

    <a href="/dashboard.html" class="sidebar-nav-item" data-page="dashboard">
      <span class="sidebar-nav-icon">🏠</span> Dashboard
    </a>
    <a href="/bots.html" class="sidebar-nav-item" data-page="bots">
      <span class="sidebar-nav-icon">🤖</span> Mes Bots
    </a>
    <a href="/create-bot.html" class="sidebar-nav-item" data-page="create-bot">
      <span class="sidebar-nav-icon">➕</span> Créer un bot
    </a>

    <p class="sidebar-section-label" style="margin-top:1.5rem;">Compte</p>

    <button class="sidebar-nav-item" id="logout-btn">
      <span class="sidebar-nav-icon">🚪</span> Déconnexion
    </button>
  </div>

  <div class="sidebar-footer">
    <div class="user-info">
      <div class="user-avatar" id="sidebar-user-avatar">U</div>
      <div>
        <div class="user-email" id="sidebar-user-email">chargement...</div>
        <div class="user-plan" id="sidebar-user-plan">FREE</div>
      </div>
    </div>
  </div>
</nav>
<div class="sidebar-overlay"></div>
`;

const MOBILE_TOPBAR_HTML = `
<div class="mobile-topbar">
  <a href="/" style="display:flex;align-items:center;gap:0.5rem;font-weight:800;text-decoration:none;color:var(--text-primary);">
    <span style="font-size:1.2rem;">🤖</span> BotForge
  </a>
  <button class="mobile-menu-btn" id="mobile-menu-btn">☰</button>
</div>
`;

// Injecter la sidebar dans les pages qui en ont besoin
document.addEventListener('DOMContentLoaded', () => {
  const sidebarContainer = document.getElementById('sidebar-container');
  if (sidebarContainer) {
    sidebarContainer.innerHTML = SIDEBAR_HTML + MOBILE_TOPBAR_HTML;
  }
  Toast.init();
});
