// bot-templates/translateBot.js - Template 5: Bot de Traduction
const TelegramBot = require('node-telegram-bot-api');

// Langues supportées (MyMemory API)
const LANGUAGES = {
  fr: '🇫🇷 Français',
  en: '🇬🇧 Anglais',
  es: '🇪🇸 Espagnol',
  de: '🇩🇪 Allemand',
  it: '🇮🇹 Italien',
  pt: '🇵🇹 Portugais',
  ru: '🇷🇺 Russe',
  ar: '🇸🇦 Arabe',
  zh: '🇨🇳 Chinois',
  ja: '🇯🇵 Japonais',
  ko: '🇰🇷 Coréen',
  nl: '🇳🇱 Néerlandais',
  pl: '🇵🇱 Polonais',
  tr: '🇹🇷 Turc',
};

/**
 * Traduit du texte via MyMemory API (gratuite, sans clé pour ~1000 mots/jour)
 */
const translateText = async (text, targetLang, sourceLang = 'auto') => {
  try {
    const langPair = sourceLang === 'auto'
      ? `|${targetLang}`
      : `${sourceLang}|${targetLang}`;

    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;

    const fetch = require('node-fetch');
    const response = await fetch(url);
    const data = await response.json();

    if (data.responseStatus === 200 && data.responseData) {
      return {
        success: true,
        text: data.responseData.translatedText,
        confidence: data.responseData.match,
      };
    }
    return { success: false, error: 'Traduction échouée' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const createTranslateBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });
  const config = botDoc.config;
  // Stockage temporaire de la langue préférée par utilisateur
  const userPrefs = new Map();

  return {
    handleUpdate: async (update) => {
      try {
        const msg = update.message;
        if (!msg || !msg.text) return;

        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;
        const firstName = msg.from.first_name || 'Utilisateur';

        // /start
        if (text === '/start') {
          const welcome = config.translate_welcomeMessage || '🌍 Bonjour ! Envoyez /translate <texte> pour traduire.';
          await bot.sendMessage(chatId, welcome.replace('{first_name}', firstName), { parse_mode: 'HTML' });
          return;
        }

        // /help
        if (text === '/help') {
          await bot.sendMessage(
            chatId,
            `🌍 <b>Bot de Traduction</b>\n\n` +
            `<b>Commandes :</b>\n` +
            `/translate &lt;texte&gt; - Traduit en ${LANGUAGES[config.translate_defaultLang] || 'anglais'}\n` +
            `/translate &lt;texte&gt; -&gt; &lt;langue&gt; - Traduit dans une langue spécifique\n` +
            `/setlang &lt;code&gt; - Changer votre langue par défaut\n` +
            `/langs - Voir les langues disponibles\n\n` +
            `<b>Exemples :</b>\n` +
            `<code>/translate Bonjour le monde</code>\n` +
            `<code>/translate Hello world -> fr</code>`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        // /langs - Liste des langues
        if (text === '/langs') {
          const langList = Object.entries(LANGUAGES)
            .map(([code, name]) => `<code>${code}</code> - ${name}`)
            .join('\n');
          await bot.sendMessage(chatId, `🌍 <b>Langues disponibles :</b>\n\n${langList}`, { parse_mode: 'HTML' });
          return;
        }

        // /setlang <code>
        if (text.startsWith('/setlang ')) {
          const langCode = text.slice(9).trim().toLowerCase();
          if (!LANGUAGES[langCode]) {
            await bot.sendMessage(chatId, `❌ Langue inconnue: <code>${langCode}</code>\n\nVoir /langs pour la liste.`, { parse_mode: 'HTML' });
            return;
          }
          userPrefs.set(userId, langCode);
          await bot.sendMessage(chatId, `✅ Langue par défaut: ${LANGUAGES[langCode]}`);
          return;
        }

        // /translate <text> ou /translate <text> -> <lang>
        if (text.startsWith('/translate ') || text.startsWith('/tr ')) {
          const prefix = text.startsWith('/translate ') ? '/translate ' : '/tr ';
          const content = text.slice(prefix.length).trim();

          if (!content) {
            await bot.sendMessage(chatId, '❌ Entrez du texte à traduire.\nExemple: <code>/translate Bonjour</code>', { parse_mode: 'HTML' });
            return;
          }

          let textToTranslate = content;
          let targetLang = userPrefs.get(userId) || config.translate_defaultLang || 'en';

          // Vérifier si une langue cible est spécifiée avec ->
          const arrowMatch = content.match(/^(.+?)\s*->\s*([a-z]{2})$/i);
          if (arrowMatch) {
            textToTranslate = arrowMatch[1].trim();
            const specifiedLang = arrowMatch[2].toLowerCase();
            if (LANGUAGES[specifiedLang]) {
              targetLang = specifiedLang;
            }
          }

          if (textToTranslate.length > 500) {
            await bot.sendMessage(chatId, '❌ Texte trop long (max 500 caractères).');
            return;
          }

          // Message de chargement
          const loadingMsg = await bot.sendMessage(chatId, '🔄 Traduction en cours...');

          const result = await translateText(textToTranslate, targetLang);

          await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

          if (result.success) {
            const langName = LANGUAGES[targetLang] || targetLang;
            await bot.sendMessage(
              chatId,
              `🌍 <b>Traduction → ${langName}</b>\n\n${result.text}`,
              { parse_mode: 'HTML' }
            );
            await botDoc.addLog('info', `Traduction: "${textToTranslate.substring(0, 50)}..." → ${targetLang}`);
            await botDoc.incrementStats();
          } else {
            await bot.sendMessage(chatId, `❌ Erreur de traduction: ${result.error}`);
          }
          return;
        }

      } catch (error) {
        console.error('TranslateBot error:', error.message);
        await botDoc.addLog('error', `Erreur: ${error.message}`);
      }
    },
  };
};

module.exports = { createTranslateBot };
