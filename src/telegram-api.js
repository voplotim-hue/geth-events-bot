export class TelegramApi {
  constructor(token) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async request(method, payload = {}) {
    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      const description = data?.description || response.statusText;
      throw new Error(`Telegram ${method} failed: ${description}`);
    }

    return data.result;
  }

  getUpdates(payload) {
    return this.request("getUpdates", payload);
  }

  sendMessage(chatId, text, extra = {}) {
    return this.request("sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...extra
    });
  }

  editMessageReplyMarkup(chatId, messageId, replyMarkup = {}) {
    return this.request("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup
    });
  }

  answerCallbackQuery(callbackQueryId, text, extra = {}) {
    return this.request("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
      ...extra
    });
  }
}
