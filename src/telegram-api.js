export class TelegramApi {
  constructor(token) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async request(method, payload = {}) {
    const timeoutMs = method === "getUpdates"
      ? (Number(payload.timeout || 25) + 10) * 1000
      : 15000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(`${this.baseUrl}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`Telegram ${method} failed: request timed out after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

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

  sendPhoto(chatId, photo, extra = {}) {
    return this.request("sendPhoto", {
      chat_id: chatId,
      photo,
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

  editMessageText(chatId, messageId, text, extra = {}) {
    return this.request("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      disable_web_page_preview: true,
      ...extra
    });
  }

  editMessageCaption(chatId, messageId, caption, extra = {}) {
    return this.request("editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption,
      ...extra
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
