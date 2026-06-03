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

const ADMIN_CREATE_EVENT_BUTTON = "Создать мероприятие";

function adminReplyKeyboard() {
  return {
    keyboard: [[{ text: ADMIN_CREATE_EVENT_BUTTON }]],
    resize_keyboard: true,
    is_persistent: true
  };
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

const EVENT_FIELDS = [
  {
    key: "title",
    label: "Название мероприятия",
    prompt: "Введите название мероприятия, например: Летний лагерь."
  },
  {
    key: "dates",
    label: "Даты",
    prompt: "Введите даты или сроки мероприятия, например: 15-20 июля. Если даты пока не нужны, отправьте -."
  },
  {
    key: "description",
    label: "Комментарий",
    prompt: "Введите комментарий для участников. Если комментарий не нужен, отправьте -."
  },
  {
    key: "options",
    label: "Варианты ответа",
    prompt: "Введите варианты ответа через запятую, например: Еду, Не еду, Думаю. Чтобы использовать стандартные варианты, отправьте -."
  }
];

const PROFILE_FIELDS = [
  {
    key: "birth_date",
    label: "Дата рождения",
    prompt: "Укажите дату рождения в формате ДД.ММ.ГГГГ, например 22.03.1996."
  },
  {
    key: "full_name",
    label: "Фамилия Имя Отчество",
    prompt: "Укажите фамилию, имя и отчество одной строкой, например: Иванов Иван Иванович."
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

  return normalizeProfileText(text);
}

function parseFullName(value) {
  const parts = normalizeProfileText(value).split(" ").filter(Boolean);
  if (parts.length < 2) return null;

  return {
    last_name: parts[0],
    first_name: parts[1],
    middle_name: parts.slice(2).join(" ")
  };
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

function normalizeOptionalEventValue(value) {
  const text = normalizeProfileText(value);
  return text === "-" ? "" : text;
}

function parseEventOptions(value, defaultOptions) {
  const text = normalizeProfileText(value);
  if (text === "-") return defaultOptions;

  return text
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function eventDraftSummary(draft) {
  return [
    "Проверьте мероприятие:",
    "",
    `Название: ${draft.title}`,
    `Даты: ${draft.dates || "-"}`,
    `Комментарий: ${draft.description || "-"}`,
    `Варианты: ${draft.options.join(", ")}`,
    "",
    "Если всё верно, нажмите «Опубликовать регистрацию»."
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
    this.pendingEventDrafts = new Map();
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

  canManageEvents(userId) {
    return this.isAdmin(userId) || String(this.config.birthdayApproverChatId || "") === String(userId);
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

    if (text === ADMIN_CREATE_EVENT_BUTTON) {
      await this.handleNewEventCommand(message);
      return;
    }

    if (await this.handlePendingEventText(message)) return;
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

    if (command === "/new_event" || command === "/registration") {
      await this.handleNewEventCommand(message);
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
      "Привет, теперь ты официально присоединился к группе GethTeens и наше взаимодействие станет намного удобнее! Заполни короткую анкету, чтоб администраторы видели необходимые данные для дальнейшей регистрации на всех запланированных мероприятиях.",
      this.canManageEvents(message.from.id)
        ? { reply_markup: adminReplyKeyboard() }
        : {}
    );
    await this.sendCurrentProfilePrompt(message.chat.id, message.from.id);
    if (this.canManageEvents(message.from.id)) {
      await this.sendAdminPanel(message.chat.id);
    }
  }

  async handleEventCommand(message) {
    if (!this.canManageEvents(message.from.id)) {
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

  async handleNewEventCommand(message) {
    if (!this.canManageEvents(message.from.id)) {
      await this.telegram.sendMessage(message.chat.id, "Создавать мероприятия могут только администраторы.");
      return;
    }

    if (message.chat.type !== "private") {
      await this.telegram.sendMessage(message.chat.id, "Создание мероприятия удобнее пройти в личном чате с ботом. Откройте бота в ЛС и нажмите /new_event.");
      return;
    }

    await this.startEventWizard(message.chat.id, message.from.id);
  }

  async sendAdminPanel(chatId) {
    await this.telegram.sendMessage(chatId, "Кнопка администратора закреплена внизу чата.", {
      reply_markup: adminReplyKeyboard()
    });
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

    if (kind === "event") {
      await this.handleEventWizardCallback(callbackQuery);
      return;
    }

    if (kind !== "vote") return;

    const [, eventId, optionIndexRaw] = data.split(":");
    await this.telegram.answerCallbackQuery(callbackQuery.id, "✅ Спасибо! Ваш голос принят.");
    this.finishVoteRegistration({ callbackQuery, eventId, optionIndexRaw });
  }

  async finishVoteRegistration({ callbackQuery, eventId, optionIndexRaw }) {
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

  async startEventWizard(chatId, userId) {
    if (!this.store.enabled) {
      await this.telegram.sendMessage(chatId, "Таблица не настроена. Администратор должен проверить .env.");
      return;
    }

    if (!this.config.groupChatId) {
      await this.telegram.sendMessage(chatId, "Не указан GROUP_CHAT_ID. Без него бот не знает, куда публиковать регистрацию.");
      return;
    }

    this.pendingUserProfiles.delete(String(userId));
    this.pendingEventDrafts.set(String(userId), {
      step: 0,
      data: {},
      status: "collecting"
    });

    await this.telegram.sendMessage(chatId, "Создаём новую регистрацию на мероприятие.");
    await this.sendCurrentEventPrompt(chatId, userId);
  }

  async sendCurrentEventPrompt(chatId, userId) {
    const state = this.pendingEventDrafts.get(String(userId));
    if (!state) return;

    const field = EVENT_FIELDS[state.step];
    await this.telegram.sendMessage(chatId, [
      `${state.step + 1}/${EVENT_FIELDS.length}. ${field.label}`,
      "",
      field.prompt,
      "",
      "Чтобы отменить создание, отправьте /cancel."
    ].join("\n"));
  }

  async handlePendingEventText(message) {
    const userId = String(message.from?.id || "");
    const state = this.pendingEventDrafts.get(userId);
    if (!state || message.chat.type !== "private") return false;

    const text = String(message.text || "").trim();
    if (!text) return false;

    if (text === "/cancel") {
      this.pendingEventDrafts.delete(userId);
      await this.telegram.sendMessage(message.chat.id, "Ок, создание мероприятия отменено.");
      await this.sendAdminPanel(message.chat.id);
      return true;
    }

    if (text.startsWith("/")) return false;

    if (state.status === "confirm") {
      await this.telegram.sendMessage(message.chat.id, "Черновик уже готов. Нажмите «Опубликовать регистрацию», «Заполнить заново» или «Отменить» под предпросмотром.");
      return true;
    }

    const field = EVENT_FIELDS[state.step];
    if (field.key === "title") {
      const title = normalizeProfileText(text);
      if (!title) {
        await this.telegram.sendMessage(message.chat.id, "Название нужно заполнить.");
        return true;
      }
      state.data.title = title;
    }

    if (field.key === "dates") {
      state.data.dates = normalizeOptionalEventValue(text);
    }

    if (field.key === "description") {
      state.data.description = normalizeOptionalEventValue(text);
    }

    if (field.key === "options") {
      const options = parseEventOptions(text, this.config.defaultOptions);
      if (options.length < 2) {
        await this.telegram.sendMessage(message.chat.id, "Нужно минимум два варианта ответа. Например: Еду, Не еду.");
        return true;
      }
      state.data.options = options;
    }

    state.step += 1;
    if (state.step < EVENT_FIELDS.length) {
      await this.sendCurrentEventPrompt(message.chat.id, userId);
      return true;
    }

    state.status = "confirm";
    await this.telegram.sendMessage(message.chat.id, eventDraftSummary(state.data), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Опубликовать регистрацию", callback_data: "event:publish" }],
          [{ text: "Заполнить заново", callback_data: "event:restart" }],
          [{ text: "Отменить", callback_data: "event:cancel" }]
        ]
      }
    });
    return true;
  }

  async handleEventWizardCallback(callbackQuery) {
    const [, action] = String(callbackQuery.data || "").split(":");
    const userId = String(callbackQuery.from?.id || "");

    if (!this.canManageEvents(userId)) {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Создавать мероприятия могут только администраторы.");
      return;
    }

    if (action === "new" || action === "restart") {
      this.clearCallbackKeyboard(callbackQuery);
      await this.telegram.answerCallbackQuery(callbackQuery.id, action === "new" ? "Начинаем создание." : "Заполняем заново.");
      await this.startEventWizard(callbackQuery.message.chat.id, callbackQuery.from.id);
      return;
    }

    if (action === "cancel") {
      this.pendingEventDrafts.delete(userId);
      this.clearCallbackKeyboard(callbackQuery);
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Создание отменено.");
      await this.sendAdminPanel(callbackQuery.message.chat.id);
      return;
    }

    if (action !== "publish") {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Неизвестное действие.");
      return;
    }

    const state = this.pendingEventDrafts.get(userId);
    if (!state || state.status !== "confirm") {
      await this.telegram.answerCallbackQuery(callbackQuery.id, "Черновик не найден. Создайте мероприятие заново.");
      return;
    }

    await this.telegram.answerCallbackQuery(callbackQuery.id, "Публикую регистрацию.");
    this.clearCallbackKeyboard(callbackQuery);

    try {
      const result = await this.publishEventDraft(state.data);
      this.pendingEventDrafts.delete(userId);
      await this.telegram.sendMessage(
        callbackQuery.message.chat.id,
        `✅ Регистрация опубликована. event_id: ${result.eventId}`
      );
      await this.sendAdminPanel(callbackQuery.message.chat.id);
    } catch (error) {
      this.logger.error("[event_publish]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось опубликовать регистрацию. Ошибка уже в логах.");
    }
  }

  async publishEventDraft(draft) {
    const eventId = `ev_${Date.now().toString(36)}`;
    const inlineKeyboard = draft.options.map((option, index) => [{
      text: option,
      callback_data: callbackData(eventId, index)
    }]);

    const sent = await this.telegram.sendMessage(this.config.groupChatId, eventText(draft), {
      reply_markup: { inline_keyboard: inlineKeyboard }
    });

    await this.store.createEvent({
      eventId,
      ...draft,
      groupChatId: this.config.groupChatId,
      messageId: sent.message_id
    });

    return { eventId, messageId: sent.message_id };
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

    if (!value) {
      await this.telegram.sendMessage(message.chat.id, "Это поле нужно заполнить. Отправьте, пожалуйста, значение одним сообщением.");
      return true;
    }

    if (field.key === "full_name") {
      const parsed = parseFullName(value);
      if (!parsed) {
        await this.telegram.sendMessage(message.chat.id, "Не получилось распознать ФИО. Отправьте минимум фамилию и имя, например: Иванов Иван Иванович.");
        return true;
      }

      Object.assign(state.data, parsed);
    } else {
      state.data[field.key] = value;
    }
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

    const missing = ["birth_date", "last_name", "first_name", "church"]
      .filter((key) => !state.data[key]);
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
      "/new_event - создать регистрацию на мероприятие через мастер",
      `"${ADMIN_CREATE_EVENT_BUTTON}" - постоянная кнопка администратора для создания мероприятия`,
      "/event Название | даты | описание | Еду,Не еду,Пока не знаю - создать регистрацию",
      "/birthdays - создать черновики поздравлений и отправить суперадмину на подтверждение"
    ].join("\n");
  }
}
