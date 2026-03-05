// bot-templates/aiBot.js - Template 7: Bot IA (OpenAI / Mistral / endpoint custom)
const TelegramBot = require('node-telegram-bot-api');

/**
 * Appelle n'importe quel endpoint compatible OpenAI Chat API
 */
const callAI = async (messages, aiConfig) => {
  const fetch = require('node-fetch');

  const provider = aiConfig.ai_provider || 'openai';
  let endpoint = aiConfig.ai_endpoint?.trim();
  let apiKey   = aiConfig.ai_apiKey?.trim();
  let model    = aiConfig.ai_model?.trim();

  // Endpoints par défaut selon le provider
  if (!endpoint) {
    if (provider === 'openai')  endpoint = 'https://api.openai.com/v1/chat/completions';
    if (provider === 'mistral') endpoint = 'https://api.mistral.ai/v1/chat/completions';
    if (provider === 'groq')    endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  }
  if (!model) {
    if (provider === 'openai')  model = 'gpt-3.5-turbo';
    if (provider === 'mistral') model = 'mistral-small-latest';
    if (provider === 'groq')    model = 'llama3-8b-8192';
  }

  if (!apiKey || !endpoint) throw new Error('API key ou endpoint manquant');

  const body = {
    model,
    max_tokens: 800,
    temperature: parseFloat(aiConfig.ai_temperature) || 0.7,
    messages,
  };

  const res  = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API Error ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '(Réponse vide)';
};

const createAiBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });

  // Historique de conversation par chatId (mémoire courte, max 20 messages)
  const histories = new Map();

  const getHistory = (chatId) => histories.get(chatId) || [];
  const addToHistory = (chatId, role, content) => {
    const hist = getHistory(chatId);
    hist.push({ role, content });
    if (hist.length > 20) hist.splice(0, hist.length - 20);
    histories.set(chatId, hist);
  };

  return {
    handleUpdate: async (update, freshDoc = botDoc) => {
      try {
        const msg = update.message;
        if (!msg || !msg.text) return;

        const chatId    = msg.chat.id;
        const text      = msg.text;
        const firstName = msg.from?.first_name || 'Utilisateur';
        const userId    = msg.from?.id;
        const config    = freshDoc.config;

        if (!config.ai_enabled) {
          if (text === '/start') {
            await bot.sendMessage(chatId, `🤖 Ce bot IA n'est pas encore configuré.\n\nL'administrateur doit ajouter une clé API dans les paramètres.`);
          }
          return;
        }

        if (text === '/start') {
          const persona = config.ai_persona_name || 'Assistant IA';
          const emoji   = config.ai_persona_emoji || '🤖';
          const welcome = config.ai_welcome_message || `Bonjour ${firstName} ! Je suis ${persona}. Comment puis-je vous aider ?`;
          await bot.sendMessage(chatId, `${emoji} ${welcome.replace('{first_name}', firstName)}`, { parse_mode: 'HTML' });
          return;
        }

        if (text === '/reset') {
          histories.delete(chatId);
          await bot.sendMessage(chatId, '🔄 Mémoire de conversation effacée !');
          return;
        }

        if (text === '/help') {
          const persona = config.ai_persona_name || 'Assistant IA';
          await bot.sendMessage(chatId,
            `🤖 <b>${persona}</b>\n\n` +
            `Envoyez-moi n'importe quel message et je vous répondrai.\n\n` +
            `📋 <b>Commandes :</b>\n/start - Message de bienvenue\n/reset - Effacer la mémoire de conversation\n/help - Cette aide`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // Envoyer "En train d'écrire..."
        await bot.sendChatAction(chatId, 'typing');

        // Construire les messages avec historique
        const systemPrompt = config.ai_system_prompt || `Tu es ${config.ai_persona_name || 'un assistant IA'} utile et amical. Réponds en français sauf si l'utilisateur écrit dans une autre langue.`;
        const messages = [
          { role: 'system', content: systemPrompt },
          ...getHistory(chatId),
          { role: 'user', content: text },
        ];

        const reply = await callAI(messages, config);

        // Sauvegarder dans l'historique
        addToHistory(chatId, 'user',      text);
        addToHistory(chatId, 'assistant', reply);

        await bot.sendMessage(chatId, reply, { parse_mode: 'HTML' }).catch(() =>
          bot.sendMessage(chatId, reply) // fallback sans parse_mode si HTML invalide
        );

        await freshDoc.addLog('info', `Message IA: "${text.substring(0, 40)}" → réponse (${reply.length} chars)`);
        await freshDoc.incrementStats(userId);

      } catch (err) {
        console.error('AiBot error:', err.message);
        await freshDoc.addLog('error', `Erreur IA: ${err.message}`);
        try {
          const chatId = update.message?.chat?.id;
          if (chatId) await bot.sendMessage(chatId, `❌ Erreur IA : ${err.message.substring(0, 200)}`);
        } catch (_) {}
      }
    },
  };
};

module.exports = { createAiBot };
