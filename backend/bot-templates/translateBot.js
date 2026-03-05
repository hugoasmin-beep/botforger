// bot-templates/translateBot.js - Template 5: Bot de Traduction
const TelegramBot = require('node-telegram-bot-api');

const LANGUAGES = {
  fr: '🇫🇷 Français', en: '🇬🇧 Anglais',  es: '🇪🇸 Espagnol',
  de: '🇩🇪 Allemand', it: '🇮🇹 Italien',   pt: '🇵🇹 Portugais',
  ru: '🇷🇺 Russe',    ar: '🇸🇦 Arabe',     zh: '🇨🇳 Chinois',
  ja: '🇯🇵 Japonais', ko: '🇰🇷 Coréen',    nl: '🇳🇱 Néerlandais',
  pl: '🇵🇱 Polonais', tr: '🇹🇷 Turc',
};

const translateText = async (text, targetLang) => {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=|${targetLang}`;
    const fetch = require('node-fetch');
    const response = await fetch(url);
    const data = await response.json();
    if (data.responseStatus === 200 && data.responseData) {
      return { success: true, text: data.responseData.translatedText };
    }
    return { success: false, error: 'Traduction échouée' };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

const createTranslateBot = (botDoc) => {
  const bot = new TelegramBot(botDoc.token, { polling: false });
  // Préférences utilisateur stockées en mémoire (non-critiques, remises à 0 au redémarrage)
  const userPrefs = new Map();

  return {
    handleUpdate: async (update, freshDoc = botDoc) => {
      try {
        const msg = update.message;
        if (!msg || !msg.text) return;

        const chatId    = msg.chat.id;
        const userId    = msg.from.id;
        const text      = msg.text;
        const firstName = msg.from?.first_name || 'Utilisateur';
        const config    = freshDoc.config;

        if (text === '/start') {
          const welcome = config.translate_welcomeMessage || '🌍 Bonjour ! Envoyez /translate <texte> pour traduire.';
          await bot.sendMessage(chatId, welcome.replace('{first_name}', firstName), { parse_mode: 'HTML' });
          return;
        }

        if (text === '/help') {
          await bot.sendMessage(chatId,
            `🌍 <b>Bot de Traduction</b>\n\n<b>Commandes :</b>\n` +
            `/translate &lt;texte&gt; - Traduit en ${LANGUAGES[config.translate_defaultLang] || 'anglais'}\n` +
            `/translate &lt;texte&gt; -&gt; &lt;langue&gt; - Traduit dans une langue spécifique\n` +
            `/setlang &lt;code&gt; - Changer votre langue par défaut\n` +
            `/langs - Voir les langues disponibles\n\n<b>Exemples :</b>\n` +
            `<code>/translate Bonjour le monde</code>\n<code>/translate Hello world -> fr</code>`,
            { parse_mode: 'HTML' }
          );
          return;
        }

        if (text === '/langs') {
          const langList = Object.entries(LANGUAGES).map(([code, name]) => `<code>${code}</code> - ${name}`).join('\n');
          await bot.sendMessage(chatId, `🌍 <b>Langues disponibles :</b>\n\n${langList}`, { parse_mode: 'HTML' });
          return;
        }

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

        if (text.startsWith('/translate ') || text.startsWith('/tr ')) {
          const prefix  = text.startsWith('/translate ') ? '/translate ' : '/tr ';
          const content = text.slice(prefix.length).trim();
          if (!content) {
            await bot.sendMessage(chatId, '❌ Entrez du texte à traduire.\nExemple: <code>/translate Bonjour</code>', { parse_mode: 'HTML' });
            return;
          }

          let textToTranslate = content;
          let targetLang = userPrefs.get(userId) || config.translate_defaultLang || 'en';

          const arrowMatch = content.match(/^(.+?)\s*->\s*([a-z]{2})$/i);
          if (arrowMatch) {
            textToTranslate = arrowMatch[1].trim();
            const lang = arrowMatch[2].toLowerCase();
            if (LANGUAGES[lang]) targetLang = lang;
          }

          if (textToTranslate.length > 500) {
            await bot.sendMessage(chatId, '❌ Texte trop long (max 500 caractères).');
            return;
          }

          const loadingMsg = await bot.sendMessage(chatId, '🔄 Traduction en cours...');
          const result = await translateText(textToTranslate, targetLang);
          await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

          if (result.success) {
            await bot.sendMessage(chatId,
              `🌍 <b>Traduction → ${LANGUAGES[targetLang] || targetLang}</b>\n\n${result.text}`,
              { parse_mode: 'HTML' }
            );
            await freshDoc.addLog('info', `Traduction: "${textToTranslate.substring(0, 50)}" → ${targetLang}`);
            await freshDoc.incrementStats(userId);
          } else {
            await bot.sendMessage(chatId, `❌ Erreur de traduction: ${result.error}`);
          }
          return;
        }

      } catch (err) {
        console.error('TranslateBot error:', err.message);
        await freshDoc.addLog('error', `Erreur: ${err.message}`);
      }
    },
  };
};

module.exports = { createTranslateBot };
