import {
  approveBirthdayGreeting,
  rejectBirthdayGreeting,
  runBirthdaySweep,
  sendBirthdayApprovalRequest
} from "./birthdays.js";

function stripCommand(text) {
  return text.replace(/^\/[a-zA-Z0-9_]+(?:@[a-zA-Z0-9_]+)?\s*/, "").trim();
}

function callbackData(eventId, optionIndex) {
  return `vote:${eventId}:${optionIndex}`;
}

function eventText({ title, dates, description }) {
  const lines = [title];
  if (dates) lines.push(`Даты: ${dates}`);
  if (description) lines.push("", description);
  lines.push("", "Выберите вариант:");
  return lines.join("\n");
}

function parseEventCommand(text, defaultOptions) {
  const body = stripCommand(text);
  const parts = body.split("|").map((item) => item.trim());
  const [title, dates = "", description = "", optionsRaw = ""] = parts;

  const options = optionsRaw
    ? optionsRaw.split(",").map((item) => item.trim()).filter(Boolean)
    : defaultOptions;

  if (!title || options.length < 2) {
    return null;
  }

  return { title, dates, description, options };
}

const PROFILE_FIELDS = [
  {
    key: "birth_date",
    label: "Дата рождения",
    prompt: "Укажите дату рождения в формате ДД.ММ.ГГГГ, например 22.03.1996."
  },
  {
    key: "last_name",
    label: "Фамилия",
    prompt: "Укажите вашу фамилию."
  },
  {
    key: "first_name",
    label: "Имя",
    prompt: "Укажите ваше имя."
  },
  {
    key: "middle_name",
    label: "Отчество",
    prompt: "Укажите ваше отчество. Если отчества нет, отправьте -."
  },
  {
    key: "church",
    label: "Церковь",
    prompt: "Укажите название вашей церкви."
  }
];

function normalizeProfileText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeBirthDate(value) {
  const text = normalizeProfileText(value);
  let day;
  let month;
  let year;

  const dotMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dotMatch) {
    [, day, month, year] = dotMatch;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!dotMatch && isoMatch) {
    [, year, month, day] = isoMatch;
  }

  if (!day || !month || !year) return null;

  const dd = Number(day);
  const mm = Number(month);
  const yyyy = Number(year);
  const date = new Date(Date.UTC(yyyy, mm - 1, dd));
  const valid = date.getUTCFullYear() === yyyy
    && date.getUTCMonth() === mm - 1
    && date.getUTCDate() === dd;

  if (!valid || yyyy < 1900 || yyyy > 2100) return null;

  return [
    String(yyyy).padStart(4, "0"),
    String(mm).padStart(2, "0"),
    String(dd).padStart(2, "0")
  ].join("-");
}

function normalizeProfileValue(field, text) {
  if (field.key === "birth_date") {
    return normalizeBirthDate(text);
  }

  if (field.key === "middle_name") {
    const value = normalizeProfileText(text);
    return ["-", "нет", "не указано", "без отчества"].includes(value.toLowerCase()) ? "" : value;
  }

  return normalizeProfileText(text);
}

function profileSummary(profile) {
  return [
    "Проверьте анкету:",
    "",
    `Дата рождения: ${profile.birth_date}`,
    `Фамилия: ${profile.last_name}`,
    `Имя: ${profile.first_name}`,
    `Отчество: ${profile.middle_name || "-"}`,
    `Церковь: ${profile.church}`,
    "",
    "Если всё верно, нажмите «Отправить»."
  ].join("\n");
}

export class Bot {
  constructor({ config, telegram, store, logger = console }) {
    this.config = config;
    this.telegram = telegram;
    this.store = store;
    this.logger = logger;
    this.offset = 0;
    this.stopped = false;
    this.pendingBirthdayEdits = new Map();
    this.pendingUserProfiles = new Map();
  }

  isAdmin(userId) {
    if (!this.config.adminUserIds.size) return false;
    return this.config.adminUserIds.has(String(userId));
  }

  isBirthdayApprover(userId) {
    if (this.config.birthdayApproverChatId) {
      return String(this.config.birthdayApproverChatId) === String(userId);
    }

    return this.isAdmin(userId);
  }

  async start() {
    this.logger.log("[bot] long polling started");
    while (!this.stopped) {
      try {
        const updates = await this.telegram.getUpdates({
          offset: this.offset,
          timeout: 25,
          allowed_updates: ["message", "callback_query"]
        });

        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (error) {
        this.logger.error("[bot]", error);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
  }

  async handleUpdate(update) {
    if (update.message) {
      await this.handleMessage(update.message);
      return;
    }

    if (update.callback_query) {
      await this.handleCallback(update.callback_query);
    }
  }

  async handleMessage(message) {
    this.logger.log(`[message] chat=${message.chat?.id} type=${message.chat?.type} from=${message.from?.id} text=${message.text || ""}`);
    const text = message.text || "";
    const command = text.startsWith("/")
      ? text.split(/\s+/)[0].split("@")[0].toLowerCase()
      : "";

    if (command === "/start") {
      await this.handleStart(message);
      return;
    }

    if (await this.handlePendingBirthdayText(message)) return;
    if (await this.handlePendingProfileText(message)) return;

    if (!text.startsWith("/")) return;

    if (command === "/id") {
      await this.telegram.sendMessage(
        message.chat.id,
        `chat_id: ${message.chat.id}\nuser_id: ${message.from.id}`
      );
      return;
    }

    if (command === "/help") {
      await this.telegram.sendMessage(message.chat.id, this.helpText());
      return;
    }

    if (command === "/event") {
      await this.handleEventCommand(message);
      return;
    }

    if (command === "/birthdays") {
      await this.handleBirthdaysCommand(message);
    }
  }

  async handleStart(message) {
    const privateChatId = message.chat.type === "private" ? String(message.chat.id) : "";

    if (this.store.enabled) {
      await this.store.ensureUserFromTelegram(message.from, privateChatId);
    }

    if (message.chat.type !== "private") {
      await this.telegram.sendMessage(
        message.chat.id,
        "Анкета заполняется в личном чате с ботом. Откройте бота в ЛС и нажмите /start."
      );
      return;
    }

    this.startProfileForm(message.from.id);
    await this.telegram.sendMessage(
      message.chat.id,
      [
        "Готово. Я привязал ваш Telegram к карточке.",
        "",
        "Теперь заполните короткую анкету, чтобы администраторы видели корректные данные в таблице."
      ].join("\n")
    );
    await this.sendCurrentProfilePrompt(message.chat.id, message.from.id);
  }

  async handleEventCommand(message) {
    if (!this.isAdmin(message.from.id)) {
      await this.telegram.sendMessage(message.chat.id, "Эта команда доступна только администраторам.");
      return;
    }

    if (!this.store.enabled) {
      await this.telegram.sendMessage(message.chat.id, "Excel не настроен. Заполните .env и перезапустите бота.");
      return;
    }

    const parsed = parseEventCommand(message.text, this.config.defaultOptions);
    if (!parsed) {
      await this.telegram.sendMessage(
        message.chat.id,
        [
          "Формат:",
          "/event Название | даты | описание | Еду,Не еду,Пока не знаю",
          "",
          "Пример:",
          "/event Летний лагерь | 15-20 июля | Кто едет с нами? | Еду,Не еду,Думаю"
        ].join("\n")
      );
      return;
    }

    const targetChatId = message.chat.type === "private"
      ? this.config.groupChatId
      : String(message.chat.id);

    if (!targetChatId) {
      await this.telegram.sendMessage(message.chat.id, "Не указан GROUP_CHAT_ID, а команда запущена в личном чате.");
      return;
    }

    const eventId = `ev_${Date.now().toString(36)}`;
    const inlineKeyboard = parsed.options.map((option, index) => [{
      text: option,
      callback_data: callbackData(eventId, index)
    }]);

    const sent = await this.telegram.sendMessage(targetChatId, eventText(parsed), {
      reply_markup: { inline_keyboard: inlineKeyboard }
    });

    await this.store.createEvent({
      eventId,
      ...parsed,
      groupChatId: targetChatId,
      messageId: sent.message_id
    });

    if (String(message.chat.id) !== String(targetChatId)) {
      await this.telegram.sendMessage(message.chat.id, `Мероприятие опубликовано. event_id: ${eventId}`);
    }
  }

  async handleBirthdaysCommand(message) {
    if (!this.isAdmin(message.from.id)) {
      await this.telegram.sendMessage(message.chat.id, "Эта команда доступна только администраторам.");
      return;
    }

    const result = await runBirthdaySweep({
      config: this.config,
      store: this.store,
      telegram: this.telegram,
      force: true
    });

    await this.telegram.sendMessage(
      message.chat.id,
      [
        `Проверка дней рождения выполнена. Отправлено на подтверждение: ${result.queued || result.sent}.`,
        `Личных уведомлений админам: ${result.adminNotifications || 0}.`
      ].join("\n")
    );
  }

  async handleCallback(callbackQuery) {
    const data = callbackQuery.data || "";
    const [kind] = data.split(":");
    if (kind === "bday") {
      await this.handleBirthdayCallback(callbackQuery);
      return;
    }

    if (kind === "preview") {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Это только предпросмотр.");
      return;
    }

    if (kind === "profile") {
      await this.handleProfileCallback(callbackQuery);
      return;
    }

    if (kind !== "vote") return;

    const [, eventId, optionIndexRaw] = data.split(":");
    await this.telegram.answerCallbackQuery(callbackQuery.id, "✅ Спасибо! Ваш голос принят.");

    try {
      const event = await this.store.getEvent(eventId);
      if (!event) {
        await this.sendCallbackFollowUp(callbackQuery, "Мероприятие не найдено или закрыто.");
        return;
      }

      const options = String(event.options || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      const optionIndex = Number(optionIndexRaw);
      const answer = options[optionIndex];

      if (!answer) {
        await this.sendCallbackFollowUp(callbackQuery, "Такой вариант ответа не найден.");
        return;
      }

      await this.store.upsertRegistration({
        event,
        telegramUser: callbackQuery.from,
        answer,
        sourceMessageId: callbackQuery.message?.message_id || ""
      });

    } catch (error) {
      this.logger.error("[callback]", error);
      await this.sendCallbackFollowUp(callbackQuery, "Не удалось записать ответ. Администратор уже увидит ошибку в логах.");
    }
  }

  async sendCallbackFollowUp(callbackQuery, text) {
    try {
      await this.telegram.sendMessage(callbackQuery.from.id, text);
    } catch (error) {
      this.logger.warn(`[callback_followup] ${error.message}`);
    }
  }

  clearCallbackKeyboard(callbackQuery) {
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;
    if (!chatId || !messageId) return;

    this.telegram.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] })
      .catch((error) => this.logger.warn(`[callback_keyboard_clear] ${error.message}`));
  }

  startProfileForm(userId) {
    this.pendingUserProfiles.set(String(userId), {
      step: 0,
      data: {},
      status: "collecting"
    });
  }

  async sendCurrentProfilePrompt(chatId, userId) {
    const state = this.pendingUserProfiles.get(String(userId));
    if (!state) return;

    const field = PROFILE_FIELDS[state.step];
    await this.telegram.sendMessage(chatId, [
      `${state.step + 1}/${PROFILE_FIELDS.length}. ${field.label}`,
      "",
      field.prompt,
      "",
      "Чтобы отменить заполнение, отправьте /cancel."
    ].join("\n"));
  }

  async handlePendingProfileText(message) {
    const userId = String(message.from?.id || "");
    const state = this.pendingUserProfiles.get(userId);
    if (!state || message.chat.type !== "private") return false;

    const text = String(message.text || "").trim();
    if (!text) return false;

    if (text === "/cancel") {
      this.pendingUserProfiles.delete(userId);
      await this.telegram.sendMessage(message.chat.id, "Ок, заполнение анкеты отменено. Вернуться можно командой /start.");
      return true;
    }

    if (text.startsWith("/")) return false;

    if (state.status === "confirm") {
      await this.telegram.sendMessage(message.chat.id, "Анкета уже заполнена. Нажмите «Отправить» или «Заполнить заново» под сводкой.");
      return true;
    }

    const field = PROFILE_FIELDS[state.step];
    const value = normalizeProfileValue(field, text);
    if (field.key === "birth_date" && !value) {
      await this.telegram.sendMessage(message.chat.id, "Не получилось распознать дату. Отправьте дату в формате ДД.ММ.ГГГГ, например 22.03.1996.");
      return true;
    }

    if (field.key !== "middle_name" && !value) {
      await this.telegram.sendMessage(message.chat.id, "Это поле нужно заполнить. Отправьте, пожалуйста, значение одним сообщением.");
      return true;
    }

    state.data[field.key] = value;
    state.step += 1;

    if (state.step < PROFILE_FIELDS.length) {
      await this.sendCurrentProfilePrompt(message.chat.id, userId);
      return true;
    }

    state.status = "confirm";
    await this.telegram.sendMessage(message.chat.id, profileSummary(state.data), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Отправить", callback_data: "profile:submit" }],
          [{ text: "Заполнить заново", callback_data: "profile:restart" }]
        ]
      }
    });
    return true;
  }

  async handleProfileCallback(callbackQuery) {
    const [, action] = String(callbackQuery.data || "").split(":");
    const userId = String(callbackQuery.from?.id || "");
    const state = this.pendingUserProfiles.get(userId);

    if (action === "restart") {
      this.startProfileForm(userId);
      this.clearCallbackKeyboard(callbackQuery);
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Заполняем заново.");
      await this.sendCurrentProfilePrompt(callbackQuery.message.chat.id, userId);
      return;
    }

    if (action !== "submit") {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Неизвестное действие.");
      return;
    }

    if (!state || state.status !== "confirm") {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Анкета не найдена. Нажмите /start и заполните заново.");
      return;
    }

    const missing = PROFILE_FIELDS
      .filter((field) => field.key !== "middle_name")
      .filter((field) => !state.data[field.key]);
    if (missing.length) {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "В анкете не хватает данных. Заполните заново.");
      return;
    }

    await this.telegram.answerCallbackQuery(callbackQuery.id, "Сохраняю анкету.");
    this.clearCallbackKeyboard(callbackQuery);

    try {
      await this.store.updateUserProfile({
        telegramUser: callbackQuery.from,
        privateChatId: String(callbackQuery.message.chat.id),
        profile: state.data
      });
      this.pendingUserProfiles.delete(userId);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "✅ Спасибо! Анкета сохранена в вашей карточке.");
    } catch (error) {
      this.logger.error("[profile_submit]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось сохранить анкету. Администратор уже увидит ошибку в логах.");
    }
  }

  async handleBirthdayCallback(callbackQuery) {
    const [, action, dateKey, telegramUserId] = String(callbackQuery.data || "").split(":");

    if (!this.isBirthdayApprover(callbackQuery.from.id)) {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Подтверждать поздравления может только суперадмин.");
      return;
    }

    try {
      if (action === "approve") {
        await this.telegram.answerCallbackQuery(callbackQuery.id, "✅ Принято. Отправляю поздравление.");
        this.clearCallbackKeyboard(callbackQuery);
        this.finishBirthdayApproval({ callbackQuery, dateKey, telegramUserId });
        return;
      }

      if (action === "reject") {
        await rejectBirthdayGreeting({
          store: this.store,
          dateKey,
          telegramUserId,
          rejectedBy: callbackQuery.from.id
        });
        this.clearCallbackKeyboard(callbackQuery);
        await this.telegram.answerCallbackQuery(callbackQuery.id, "Поздравление отклонено.");
        return;
      }

      if (action === "edit") {
        const log = await this.store.getBirthdayLog(dateKey, telegramUserId);
        if (String(log?.approval_status || "") === "sent") {
          await this.telegram.answerCallbackQuery(callbackQuery.id, "Поздравление уже отправлено.");
          return;
        }

        this.pendingBirthdayEdits.set(String(callbackQuery.from.id), { dateKey, telegramUserId });
        this.clearCallbackKeyboard(callbackQuery);
        await this.telegram.answerCallbackQuery(callbackQuery.id, "Жду отредактированный текст в личном сообщении.");
        await this.telegram.sendMessage(
          this.config.birthdayApproverChatId || callbackQuery.from.id,
          [
            "Отредактируйте предложенное поздравление и пришлите готовый текст одним сообщением.",
            "",
            "Текущий текст:",
            "",
            String(log?.birthday_message || "").trim(),
            "",
            "После этого я сохраню правку только для этого именинника и снова покажу кнопки подтверждения.",
            "",
            "Чтобы отменить ввод, отправьте /cancel."
          ].join("\n")
        );
        return;
      }

      await this.telegram.answerCallbackQuery(callbackQuery.id, "Неизвестное действие.");
    } catch (error) {
      this.logger.error("[birthday_callback]", error);
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Не удалось обработать поздравление. Ошибка уже в логах.");
    }
  }

  async finishBirthdayApproval({ callbackQuery, dateKey, telegramUserId }) {
    try {
      const result = await approveBirthdayGreeting({
        config: this.config,
        store: this.store,
        telegram: this.telegram,
        dateKey,
        telegramUserId,
        approvedBy: callbackQuery.from.id
      });

      const text = result.ok
        ? "✅ Поздравление отправлено."
        : `Не удалось отправить поздравление: ${result.reason}`;
      await this.telegram.sendMessage(callbackQuery.from.id, text);
    } catch (error) {
      this.logger.error("[birthday_approval_finish]", error);
      await this.sendCallbackFollowUp(
        callbackQuery,
        "Не удалось отправить поздравление. Ошибка уже в логах."
      );
    }
  }

  async handlePendingBirthdayText(message) {
    const pending = this.pendingBirthdayEdits.get(String(message.from?.id || ""));
    if (!pending || message.chat.type !== "private") return false;

    const text = String(message.text || "").trim();
    if (!text) return false;

    if (text === "/cancel") {
      this.pendingBirthdayEdits.delete(String(message.from.id));
      await this.telegram.sendMessage(message.chat.id, "Ок, ввод своего поздравления отменен.");
      return true;
    }

    if (text.startsWith("/")) return false;

    if (!this.isBirthdayApprover(message.from.id)) {
      this.pendingBirthdayEdits.delete(String(message.from.id));
      await this.telegram.sendMessage(message.chat.id, "Этот черновик может редактировать только суперадмин.");
      return true;
    }

    const { dateKey, telegramUserId } = pending;
    const log = await this.store.getBirthdayLog(dateKey, telegramUserId);
    if (String(log?.approval_status || "") === "sent") {
      this.pendingBirthdayEdits.delete(String(message.from.id));
      await this.telegram.sendMessage(message.chat.id, "Поздравление уже отправлено, заменить текст нельзя.");
      return true;
    }

    const user = await this.store.getUserByTelegramId(telegramUserId);
    if (!user) {
      this.pendingBirthdayEdits.delete(String(message.from.id));
      await this.telegram.sendMessage(message.chat.id, "Карточка пользователя не найдена в Excel.");
      return true;
    }

    await this.store.updateBirthdayLog({
      dateKey,
      telegramUserId,
      patch: {
        birthday_message: text,
        approval_status: "pending",
        private_sent: "no",
        group_sent: "no",
        approved_by: "",
        approved_at: "",
        sent_at: "",
        notes: `Edited by approver ${message.from.id}; not saved to templates`
      }
    });

    this.pendingBirthdayEdits.delete(String(message.from.id));
    await this.telegram.sendMessage(message.chat.id, "Сохранил правку для этого поздравления.");
    await sendBirthdayApprovalRequest({
      config: this.config,
      telegram: this.telegram,
      user,
      dateKey,
      message: text
    });

    return true;
  }

  helpText() {
    return [
      "Команды:",
      "/start - привязать Telegram и заполнить анкету",
      "/id - показать chat_id и user_id",
      "/event Название | даты | описание | Еду,Не еду,Пока не знаю - создать регистрацию",
      "/birthdays - создать черновики поздравлений и отправить суперадмину на подтверждение"
    ].join("\n");
  }
}
