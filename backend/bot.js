const axios = require('axios');

// Telegram Bot Handler using Telegram Bot API (no external dependencies)
class TelegramBot {
  constructor(token, config) {
    this.token = token;
    this.config = config;
    this.offset = 0;
    this.running = false;
    this.callbacks = {};
  }

  get apiUrl() {
    return `https://api.telegram.org/bot${this.token}`;
  }

  // Получение обновлений через long polling
  async getUpdates() {
    try {
      const response = await axios.get(`${this.apiUrl}/getUpdates`, {
        params: {
          offset: this.offset,
          timeout: 30,
        },
      });
      return response.data.result || [];
    } catch (error) {
      console.error('Telegram getUpdates error:', error.response?.data || error.message);
      return [];
    }
  }

  // Отправка сообщения
  async sendMessage(chatId, text, options = {}) {
    try {
      await axios.post(`${this.apiUrl}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: options.reply_markup,
        ...options,
      });
    } catch (error) {
      console.error('Telegram sendMessage error:', error.response?.data || error.message);
    }
  }

  // Установка команд
  async setCommands(commands) {
    try {
      await axios.post(`${this.apiUrl}/setMyCommands`, {
        commands,
      });
    } catch (error) {
      console.error('Telegram setCommands error:', error.response?.data || error.message);
    }
  }

  // Обработка команд
  on(command, callback) {
    this.callbacks[command] = callback;
  }

  // Запуск бота
  start() {
    if (this.running) return;
    this.running = true;
    console.log('🤖 Telegram bot started');

    const poll = async () => {
      while (this.running) {
        const updates = await this.getUpdates();
        for (const update of updates) {
          this.offset = update.update_id + 1;
          this.handleUpdate(update);
        }
        // Небольшая пауза между запросами
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    };

    poll().catch(err => console.error('Bot polling error:', err));
  }

  stop() {
    this.running = false;
  }

  handleUpdate(update) {
    const message = update.message || update.callback_query?.message;
    if (!message) return;

    const chatId = message.chat.id;
    const text = message.text || (update.callback_query?.data) || '';
    const command = text.startsWith('/') ? text.split(' ')[0] : '';

    // Обработка callback_query
    if (update.callback_query) {
      this.handleCallback(update.callback_query, chatId);
      return;
    }

    if (this.callbacks[command]) {
      this.callbacks[command](chatId, text);
    } else if (this.callbacks['default']) {
      this.callbacks['default'](chatId, text);
    }
  }

  handleCallback(callbackQuery, chatId) {
    const data = callbackQuery.data || '';
    const command = data.split(':')[0];
    const payload = data.split(':').slice(1).join(':');

    if (this.callbacks[`callback_${command}`]) {
      this.callbacks[`callback_${command}`](chatId, payload, callbackQuery);
    }
  }

  // Кнопка для открытия Mini App
  static miniAppButton(text, appUrl) {
    return {
      reply_markup: {
        inline_keyboard: [[
          {
            text,
            url: appUrl,
          }
        ]]
      }
    };
  }
}

module.exports = TelegramBot;