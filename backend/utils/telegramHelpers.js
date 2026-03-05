// utils/telegramHelpers.js - Fonctions utilitaires Telegram
const TelegramBot = require('node-telegram-bot-api');

/**
 * Valide un token Telegram en appelant getMe()
 * @param {string} token - Token Telegram
 * @returns {Promise<{valid: boolean, botInfo?: object, error?: string}>}
 */
const validateToken = async (token) => {
  try {
    const bot = new TelegramBot(token, { polling: false });
    const botInfo = await bot.getMe();
    return { valid: true, botInfo };
  } catch (error) {
    if (error.code === 'ETELEGRAM' || error.message.includes('401')) {
      return { valid: false, error: 'Token invalide ou bot désactivé' };
    }
    return { valid: false, error: error.message };
  }
};

/**
 * Enregistre un webhook Telegram pour un bot
 * @param {string} token - Token Telegram
 * @param {string} webhookUrl - URL complète du webhook
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const setWebhook = async (token, webhookUrl) => {
  try {
    const bot = new TelegramBot(token, { polling: false });
    await bot.setWebHook(webhookUrl);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Supprime le webhook d'un bot Telegram
 * @param {string} token - Token Telegram
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const deleteWebhook = async (token) => {
  try {
    const bot = new TelegramBot(token, { polling: false });
    await bot.deleteWebHook();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Envoie un message de test depuis le bot vers l'admin
 * @param {string} token - Token Telegram
 * @param {string} chatId - Chat ID de l'admin
 * @param {string} message - Message à envoyer
 */
const sendTestMessage = async (token, chatId, message) => {
  try {
    const bot = new TelegramBot(token, { polling: false });
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = { validateToken, setWebhook, deleteWebhook, sendTestMessage };
