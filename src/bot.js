import {
  approveBirthdayGreeting,
  rejectBirthdayGreeting,
  runBirthdaySweep,
  sendBirthdayApprovalRequest
} from "./birthdays.js";
import { isoNow, localNowParts } from "./time.js";
import {
  PASTORAL_NOTE_COLUMNS,
  isPresent,
  saturdayDateKey,
  serviceControlCallbackData,
  weightedAssignments
} from "./weekly-service.js";

function stripCommand(text) {
  return text.replace(/^\/[a-zA-Z0-9_]+(?:@[a-zA-Z0-9_]+)?\s*/, "").trim();
}

function parseStartEventId(text) {
  const payload = stripCommand(text);
  const match = /^event_([a-zA-Z0-9_-]+)$/.exec(payload);
  return match ? match[1] : "";
}

function callbackData(eventId, optionIndex) {
  return `vote:${eventId}:${optionIndex}`;
}

function programSelectionMask(indexes) {
  return [...new Set(Array.from(indexes || [])
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0))]
    .reduce((mask, index) => mask | (1n << BigInt(index)), 0n)
    .toString(36);
}

function parseBase36BigInt(value) {
  const digits = "0123456789abcdefghijklmnopqrstuvwxyz";
  let result = 0n;
  for (const char of String(value || "").toLowerCase()) {
    const digit = digits.indexOf(char);
    if (digit < 0) return null;
    result = result * 36n + BigInt(digit);
  }
  return result;
}

function programSelectionIndexesFromMask(maskValue, options) {
  const text = String(maskValue || "").trim();
  if (!text) return [];

  const mask = parseBase36BigInt(text);
  if (mask === null) return [];

  const result = [];
  for (let index = 0; index < options.length; index += 1) {
    if ((mask & (1n << BigInt(index))) !== 0n) {
      result.push(index);
    }
  }
  return result;
}

function programVoteCallbackData(programId, optionIndex, selectedIndexes = []) {
  return `program_vote:${programId}:toggle:${optionIndex}:${programSelectionMask(selectedIndexes)}`;
}

function programVoteDoneCallbackData(programId, selectedIndexes = []) {
  return `program_vote:${programId}:done:${programSelectionMask(selectedIndexes)}`;
}

function programVoteClearCallbackData(programId) {
  return `program_vote:${programId}:clear`;
}

function programVoteToggleMatch(callbackData, programId) {
  const escapedProgramId = String(programId || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = String(callbackData || "");
  return new RegExp(`^program_vote:${escapedProgramId}:toggle:(\\d+)(?::([0-9a-z]+))?$`).exec(text)
    || new RegExp(`^program_vote:${escapedProgramId}:(\\d+)$`).exec(text);
}

function programVoteButtonSelected(text) {
  return String(text || "").trim().startsWith("✓");
}

function programVoteButtonText(text, selected) {
  const raw = String(text || "").trim();
  const symbol = selected ? "✓" : "□";
  if (/^[✓□]\s*/.test(raw)) return raw.replace(/^[✓□]/, symbol);
  return `${symbol} ${raw}`;
}

const ADMIN_CREATE_EVENT_BUTTON = "Создать мероприятие";
const ACTIVE_EVENTS_BUTTON = "Актуальные мероприятия";
const WEEKLY_SERVICE_BUTTON = "Субботнее служение";
const EVENT_AUDIENCE_ALL = "all";
const EVENT_AUDIENCE_LEADERS = "leaders";
const LEADER_ROLES = new Set(["Админ", "Помощник"]);

function adminReplyKeyboard({ showWeeklyService = false } = {}) {
  const keyboard = [[{ text: ADMIN_CREATE_EVENT_BUTTON }]];
  if (showWeeklyService) keyboard.push([{ text: WEEKLY_SERVICE_BUTTON }]);
  keyboard.push([{ text: ACTIVE_EVENTS_BUTTON }]);
  return {
    keyboard,
    resize_keyboard: true,
    is_persistent: true
  };
}

function userReplyKeyboard() {
  return {
    keyboard: [[{ text: ACTIVE_EVENTS_BUTTON }]],
    resize_keyboard: true,
    is_persistent: true
  };
}

function eventText({ title, dates, description }) {
  const lines = [title];
  if (dates) lines.push(`Даты: ${formatEventDatesForMessage(dates)}`);
  if (description) lines.push("", description);
  lines.push("", "Выберите вариант:");
  return lines.join("\n");
}

function formatEventDatesForMessage(value) {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(raw);
  if (!match) return raw;

  return [
    match[3],
    match[2],
    match[1]
  ].join(".");
}

function eventOptions(event) {
  return String(event.options || "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function eventInlineKeyboard(event) {
  return eventOptions(event).map((option, index) => [{
    text: option,
    callback_data: callbackData(event.event_id, index)
  }]);
}

function eventPhotoFileId(event) {
  return String(event.photo_file_id || event.photoFileId || "").trim();
}

function eventAudience(event) {
  const value = String(event.audience || EVENT_AUDIENCE_ALL).trim();
  return value === EVENT_AUDIENCE_LEADERS ? EVENT_AUDIENCE_LEADERS : EVENT_AUDIENCE_ALL;
}

function eventAudienceLabel(event) {
  return eventAudience(event) === EVENT_AUDIENCE_LEADERS ? "для лидеров" : "для всех";
}

function eventIsForLeaders(event) {
  return eventAudience(event) === EVENT_AUDIENCE_LEADERS;
}

function eventShareLink(botUsername, eventId) {
  return `https://t.me/${botUsername}?start=event_${encodeURIComponent(eventId)}`;
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
    label: "Описание для участников",
    prompt: "Введите текст, который увидят участники в сообщении мероприятия. Если описание не нужно, отправьте -."
  },
  {
    key: "photo_file_id",
    label: "Фото",
    prompt: "Отправьте фото для верхней части голосовалки. Если фото не нужно, отправьте -."
  },
  {
    key: "options",
    label: "Варианты ответа",
    prompt: "Введите варианты ответа через запятую, например: Еду, Не еду, Думаю. Чтобы использовать стандартные варианты, отправьте -."
  }
];

const PROGRAM_POLL_FIELDS = [
  {
    key: "title",
    label: "Заголовок опроса",
    prompt: "Введите заголовок опроса, например: Выберите семинар."
  },
  {
    key: "message",
    label: "Текст для участников",
    prompt: "Введите текст, который участники увидят перед вариантами ответа."
  },
  {
    key: "options",
    label: "Варианты ответа",
    prompt: [
      "Введите варианты ответа, каждый с новой строки. Участник сможет выбрать несколько вариантов.",
      "Если нужно описание, используйте формат: Название | Описание.",
      "",
      "Пример:",
      "Семинар про молитву | Практический разговор о личной молитве.",
      "Командное служение | Как быть полезным в общей команде."
    ].join("\n")
  },
  {
    key: "photo_file_id",
    label: "Фото",
    prompt: "Отправьте фото для сообщения с программой. Если фото не нужно, отправьте -."
  }
];

const EVENT_COMMENT_FIELDS = [
  {
    key: "message",
    label: "Комментарий для участников",
    prompt: "Введите комментарий, который нужно отправить участникам в личные сообщения."
  },
  {
    key: "photo_file_id",
    label: "Фото",
    prompt: "Отправьте фото для комментария. Если фото не нужно, отправьте -."
  }
];

const PROFILE_FIELDS = [
  {
    key: "birth_date",
    label: "Дата рождения",
    prompt: "Укажите дату рождения в формате ДД.ММ.ГГГГ, например: 22.03.1996"
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

  const dotMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})\.?$/);
  if (dotMatch) {
    [, day, month, year] = dotMatch;
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\.?$/);
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

function isProfileComplete(user) {
  return ["birth_date", "last_name", "first_name", "church"]
    .every((key) => String(user?.[key] || "").trim());
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

function parseProgramOptions(value) {
  return String(value || "")
    .split(/\n|;/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [text, ...descriptionParts] = item.split("|").map((part) => part.trim());
      return {
        text,
        description: descriptionParts.join(" | ").trim()
      };
    })
    .filter((option) => option.text);
}

function serializeProgramOptions(options) {
  return JSON.stringify(options.map((option) => ({
    text: option.text,
    description: option.description || ""
  })));
}

function programOptions(program) {
  const raw = String(program.options || "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((option) => ({
          text: String(option?.text || "").trim(),
          description: String(option?.description || "").trim()
        }))
        .filter((option) => option.text);
    }
  } catch {
    // Older rows may use a simple pipe-separated list.
  }

  return raw
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((text) => ({ text, description: "" }));
}

function programOptionsSummary(options) {
  return options
    .map((option, index) => {
      const description = option.description ? ` — ${option.description}` : "";
      return `${index + 1}. ${option.text}${description}`;
    })
    .join("\n");
}

function programVoteSelectionKey(programId, userId) {
  return `${programId}:${userId}`;
}

function parseSelectedProgramOptions(value) {
  return String(value || "")
    .split(/[;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function programSelectionIndexesFromText(options, value) {
  const selectedTexts = new Set(parseSelectedProgramOptions(value).map((item) => item.toLowerCase()));
  if (!selectedTexts.size) return [];

  return options
    .map((option, index) => selectedTexts.has(String(option.text || "").trim().toLowerCase()) ? index : -1)
    .filter((index) => index >= 0);
}

function normalizeProgramSelectionIndexes(indexes, options) {
  const maxIndex = options.length - 1;
  return [...new Set(Array.from(indexes || [])
    .map((index) => Number(index))
    .filter((index) => Number.isInteger(index) && index >= 0 && index <= maxIndex))]
    .sort((a, b) => a - b);
}

function selectedProgramOptionTexts(options, indexes) {
  return normalizeProgramSelectionIndexes(indexes, options)
    .map((index) => options[index]?.text)
    .filter(Boolean);
}

function serializeProgramSelection(options, indexes) {
  return selectedProgramOptionTexts(options, indexes).join("; ");
}

function eventDraftSummary(draft) {
  return [
    "Проверьте мероприятие:",
    "",
    `Название: ${draft.title}`,
    `Даты: ${draft.dates || "-"}`,
    `Описание для участников: ${draft.description || "-"}`,
    `Фото: ${eventPhotoFileId(draft) ? "добавлено" : "-"}`,
    `Аудитория: ${eventAudienceLabel(draft)}`,
    `Варианты: ${draft.options.join(", ")}`,
    "",
    "Если всё верно, выберите способ запуска."
  ].join("\n");
}

function programPollDraftSummary({ event, draft, targetCount }) {
  return [
    "Проверьте программу с опросом:",
    "",
    `Мероприятие: ${event.title}`,
    `Заголовок: ${draft.title}`,
    `Текст: ${draft.message}`,
    `Фото: ${eventPhotoFileId(draft) ? "добавлено" : "-"}`,
    "Тип ответа: можно выбрать несколько вариантов",
    "",
    "Варианты:",
    programOptionsSummary(draft.options),
    "",
    `Получателей после согласования: ${targetCount}`,
    "",
    "Если всё верно, отправьте на согласование Роману.",
    "Для этого же мероприятия можно будет добавить ещё одну программу отдельным опросом."
  ].join("\n");
}

function eventCommentDraftSummary({ event, draft, targetCount }) {
  return [
    "Проверьте комментарий участникам:",
    "",
    `Мероприятие: ${event.title}`,
    `Фото: ${eventPhotoFileId(draft) ? "добавлено" : "-"}`,
    "",
    draft.message,
    "",
    `Получателей после согласования: ${targetCount}`,
    "",
    "Если всё верно, отправьте на согласование Роману."
  ].join("\n");
}

function eventIsPublishedToGroup(event) {
  return Boolean(String(event.group_chat_id || "").trim() && String(event.message_id || "").trim());
}

function adminEventActionKeyboard(event) {
  const keyboard = [];
  if (!eventIsPublishedToGroup(event)) {
    keyboard.push([{ text: "Добавить фото", callback_data: `event:add_photo:${event.event_id}` }]);
    keyboard.push([{ text: "Редактировать описание", callback_data: `event:edit_description:${event.event_id}` }]);
    keyboard.push([{ text: "Отправить на согласование Роману", callback_data: `event:publish_group:${event.event_id}` }]);
  }
  keyboard.push([{ text: "Добавить программу с опросом", callback_data: `event:add_program:${event.event_id}` }]);
  keyboard.push([{ text: "Добавить комментарий участникам", callback_data: `event:add_comment:${event.event_id}` }]);
  keyboard.push([{ text: "Закрыть регистрацию", callback_data: `event:close:${event.event_id}` }]);
  return keyboard;
}

function requesterLabel(requestedBy) {
  return requestedBy?.username
    ? `@${requestedBy.username}`
    : [requestedBy?.first_name, requestedBy?.last_name].filter(Boolean).join(" ") || requestedBy?.id || "админ";
}

function eventApprovalText(event, requestedBy) {
  const requester = requestedBy?.username
    ? `@${requestedBy.username}`
    : [requestedBy?.first_name, requestedBy?.last_name].filter(Boolean).join(" ") || requestedBy?.id || "админ";
  return [
    "ПУБЛИКАЦИЯ МЕРОПРИЯТИЯ НА СОГЛАСОВАНИЕ",
    "",
    `Запросил: ${requester}`,
    `Аудитория: ${eventAudienceLabel(event)}`,
    "",
    eventText({
      title: event.title,
      dates: event.dates,
      description: event.description
    }),
    "",
    `Ссылка: ${eventShareLink("GethEvents_bot", event.event_id || event.eventId)}`
  ].join("\n");
}

function programPollMessageText(program, { includeOptionsText = false } = {}) {
  const options = programOptions(program);
  const lines = [
    program.title,
    "",
    program.message
  ];

  if (includeOptionsText && options.length) {
    lines.push("", "Варианты:");
    lines.push(programOptionsSummary(options));
  }

  lines.push("", "Выберите один или несколько вариантов, затем нажмите «Готово»:");
  return lines.join("\n");
}

function telegramButtonText(value, maxBytes = 60) {
  const text = String(value || "").trim();
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text;

  let result = "";
  for (const char of text) {
    if (Buffer.byteLength(`${result}${char}...`, "utf8") > maxBytes) break;
    result += char;
  }
  return `${result}...`;
}

function programUsesNumberedButtons(program) {
  return programOptions(program).some((option) => {
    return Buffer.byteLength(`□ ${option.text}`, "utf8") > 60;
  });
}

function programOptionButtonText(option, index, selected, compact) {
  if (compact) return `${selected ? "✓" : "□"} ${index + 1}`;
  return telegramButtonText(`${selected ? "✓" : "□"} ${option.text}`);
}

function programPollInlineKeyboard(program, selectedIndexes = [], { compactButtons = programUsesNumberedButtons(program) } = {}) {
  const options = programOptions(program);
  const normalizedSelectedIndexes = normalizeProgramSelectionIndexes(selectedIndexes, options);
  const selected = new Set(normalizedSelectedIndexes);
  const keyboard = options.map((option, index) => [{
    text: programOptionButtonText(option, index, selected.has(index), compactButtons),
    callback_data: programVoteCallbackData(program.program_id, index, normalizedSelectedIndexes)
  }]);

  keyboard.push([{
    text: selected.size ? `Готово (${selected.size})` : "Готово",
    callback_data: programVoteDoneCallbackData(program.program_id, normalizedSelectedIndexes)
  }]);

  if (selected.size) {
    keyboard.push([{ text: "Сбросить выбор", callback_data: programVoteClearCallbackData(program.program_id) }]);
  }

  return keyboard;
}

function programPollApprovalText(program, requestedBy) {
  return [
    "ПРОГРАММА МЕРОПРИЯТИЯ НА СОГЛАСОВАНИЕ",
    "",
    `Запросил: ${requesterLabel(requestedBy)}`,
    `Мероприятие: ${program.event_title}`,
    "Тип ответа: можно выбрать несколько вариантов",
    `Получателей: ${program.target_count || 0}`,
    `Фото: ${eventPhotoFileId(program) ? "добавлено" : "-"}`,
    "",
    programPollMessageText(program, { includeOptionsText: true })
  ].join("\n");
}

function eventCommentApprovalText(broadcast, requestedBy) {
  return [
    "КОММЕНТАРИЙ УЧАСТНИКАМ НА СОГЛАСОВАНИЕ",
    "",
    `Запросил: ${requesterLabel(requestedBy)}`,
    `Мероприятие: ${broadcast.event_title}`,
    `Получателей: ${broadcast.target_count || 0}`,
    `Фото: ${eventPhotoFileId(broadcast) ? "добавлено" : "-"}`,
    "",
    broadcast.message
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
    this.pendingEventPhotos = new Map();
    this.pendingEventDescriptions = new Map();
    this.pendingLinkedEvents = new Map();
    this.pendingVoteRegistrations = new Map();
    this.pendingProgramPollDrafts = new Map();
    this.pendingEventCommentDrafts = new Map();
    this.pendingProgramVotes = new Map();
    this.queuedProgramVotes = new Map();
    this.pendingProgramVoteSelections = new Map();
    this.queuedVoteRegistrations = new Map();
    this.backgroundVoteRetries = new Map();
    this.backgroundServiceVoteRetries = new Map();
    this.pendingPastoralNotes = new Map();
  }

  isAdmin(userId) {
    if (!this.config.adminUserIds.size) return false;
    return this.config.adminUserIds.has(String(userId));
  }

  canCreateLeadersEvent(userId) {
    return this.config.leaderEventCreatorIds?.has(String(userId));
  }

  isLeaderUser(user) {
    return LEADER_ROLES.has(String(user?.role || "").trim());
  }

  canViewEvent(event, user) {
    if (!eventIsForLeaders(event)) return true;
    return this.isLeaderUser(user);
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

  isWeeklyServiceCoordinator(userId) {
    return this.config.weeklyService?.coordinatorIds?.has(String(userId));
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

    if (text === ACTIVE_EVENTS_BUTTON) {
      await this.handleActiveEventsCommand(message);
      return;
    }

    if (text === WEEKLY_SERVICE_BUTTON) {
      await this.handleWeeklyServiceCommand(message);
      return;
    }

    if (await this.handlePendingEventPhoto(message)) return;
    if (await this.handlePendingEventDescription(message)) return;
    if (await this.handlePendingProgramPollMessage(message)) return;
    if (await this.handlePendingEventCommentMessage(message)) return;
    if (await this.handlePendingEventMessage(message)) return;
    if (await this.handlePendingBirthdayText(message)) return;
    if (await this.handlePendingPastoralNoteText(message)) return;
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

    if (command === "/events") {
      await this.handleActiveEventsCommand(message);
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
      return;
    }

    if (command === "/service") {
      await this.handleWeeklyServiceCommand(message);
    }
  }

  async handleStart(message) {
    const privateChatId = message.chat.type === "private" ? String(message.chat.id) : "";
    const linkedEventId = parseStartEventId(message.text || "");

    const user = this.store.enabled
      ? await this.store.getUserByTelegramId(message.from.id)
      : null;

    if (message.chat.type !== "private") {
      await this.telegram.sendMessage(
        message.chat.id,
        "Анкета заполняется в личном чате с ботом. Откройте бота в ЛС и нажмите /start."
      );
      return;
    }

    if (linkedEventId) {
      this.pendingLinkedEvents.set(String(message.from.id), linkedEventId);
    }

    if (linkedEventId && isProfileComplete(user)) {
      await this.telegram.sendMessage(
        message.chat.id,
        "Открываю регистрацию на мероприятие.",
        this.canManageEvents(message.from.id)
          ? { reply_markup: adminReplyKeyboard({ showWeeklyService: this.isWeeklyServiceCoordinator(message.from.id) }) }
          : { reply_markup: userReplyKeyboard() }
      );
      this.pendingLinkedEvents.delete(String(message.from.id));
      await this.sendEventRegistrationToPrivateChat(message.chat.id, linkedEventId, { user });
      return;
    }

    if (isProfileComplete(user)) {
      await this.telegram.sendMessage(
        message.chat.id,
        "Рад снова видеть! Выберите нужное действие.",
        this.canManageEvents(message.from.id)
          ? { reply_markup: adminReplyKeyboard({ showWeeklyService: this.isWeeklyServiceCoordinator(message.from.id) }) }
          : { reply_markup: userReplyKeyboard() }
      );
      if (this.canManageEvents(message.from.id)) {
        await this.sendAdminPanel(message.chat.id, message.from.id);
      }
      return;
    }

    this.startProfileForm(message.from.id, { linkedEventId });
    await this.telegram.sendMessage(
      message.chat.id,
      linkedEventId
        ? "Привет! Чтобы зарегистрироваться на мероприятие, заполни короткую анкету. После сохранения данных я сразу покажу голосование."
        : "Привет, теперь ты официально присоединился к группе GethTeens и наше взаимодействие станет намного удобнее! Заполни короткую анкету, чтоб администраторы видели необходимые данные для дальнейшей регистрации на всех запланированных мероприятиях.",
      this.canManageEvents(message.from.id)
        ? { reply_markup: adminReplyKeyboard({ showWeeklyService: this.isWeeklyServiceCoordinator(message.from.id) }) }
        : { reply_markup: userReplyKeyboard() }
    );
    await this.sendCurrentProfilePrompt(message.chat.id, message.from.id);
    if (this.canManageEvents(message.from.id)) {
      await this.sendAdminPanel(message.chat.id, message.from.id);
    }
  }

  async handleActiveEventsCommand(message) {
    if (message.chat.type !== "private") {
      await this.telegram.sendMessage(
        message.chat.id,
        "Актуальные регистрации удобнее смотреть в личном чате с ботом. Откройте бота в ЛС и нажмите «Актуальные мероприятия»."
      );
      return;
    }

    if (!this.store.enabled) {
      await this.telegram.sendMessage(message.chat.id, "Таблица не настроена. Администратор должен проверить .env.");
      return;
    }

    const user = await this.store.getUserByTelegramId(message.from.id);
    if (!isProfileComplete(user)) {
      this.startProfileForm(message.from.id);
      await this.telegram.sendMessage(
        message.chat.id,
        "Сначала заполни короткую анкету, чтобы регистрация попала в таблицу корректно.",
        { reply_markup: this.canManageEvents(message.from.id)
          ? adminReplyKeyboard({ showWeeklyService: this.isWeeklyServiceCoordinator(message.from.id) })
          : userReplyKeyboard() }
      );
      await this.sendCurrentProfilePrompt(message.chat.id, message.from.id);
      return;
    }

    const events = (await this.store.listActiveEvents())
      .filter((event) => this.canViewEvent(event, user));
    if (!events.length) {
      await this.telegram.sendMessage(message.chat.id, "Сейчас нет активных регистраций.");
      return;
    }

    await this.telegram.sendMessage(message.chat.id, "Актуальные регистрации:");
    for (const event of events) {
      const options = eventOptions(event);
      if (options.length < 2) continue;
      await this.sendEventMessage(message.chat.id, event);
      if (this.canManageEvents(message.from.id)) {
        await this.telegram.sendMessage(
          message.chat.id,
          [
            "Админ-действия для этого мероприятия:",
            eventShareLink(this.config.botUsername, event.event_id)
          ].join("\n"),
          {
            reply_markup: {
              inline_keyboard: adminEventActionKeyboard(event)
            }
          }
        );
      }
    }
  }

  async sendEventRegistrationToPrivateChat(chatId, eventId, context = {}) {
    const event = await this.store.getEvent(eventId);
    if (!event) {
      await this.telegram.sendMessage(chatId, "Регистрация не найдена или уже закрыта.");
      return false;
    }

    if (!this.canViewEvent(event, context.user)) {
      await this.telegram.sendMessage(chatId, "Это мероприятие доступно только лидерам.");
      return false;
    }

    const options = eventOptions(event);
    if (options.length < 2) {
      await this.telegram.sendMessage(chatId, "У этой регистрации пока нет вариантов ответа.");
      return false;
    }

    await this.sendEventMessage(chatId, event);
    return true;
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

    const eventId = `ev_${Date.now().toString(36)}`;

    await this.store.createEvent({
      eventId,
      ...parsed,
      audience: EVENT_AUDIENCE_ALL,
      groupChatId: "",
      messageId: ""
    });

    await this.requestEventPublicationApproval(eventId, message.from);
    await this.telegram.sendMessage(
      message.chat.id,
      [
        `✅ Мероприятие создано и отправлено Роману на согласование. event_id: ${eventId}`,
        "",
        "Ссылка для регистрации через ЛС:",
        eventShareLink(this.config.botUsername, eventId)
      ].join("\n")
    );
  }

  async sendEventMessage(chatId, event, options = {}) {
    const eventId = options.eventId || event.event_id;
    const inlineKeyboard = options.inlineKeyboard || eventInlineKeyboard(event);
    const text = eventText({
      title: event.title,
      dates: event.dates,
      description: event.description
    });
    const replyMarkup = {
      reply_markup: { inline_keyboard: inlineKeyboard }
    };
    const photoFileId = eventPhotoFileId(event);

    if (photoFileId) {
      return this.telegram.sendPhoto(chatId, photoFileId, {
        caption: text,
        ...replyMarkup
      });
    }

    return this.telegram.sendMessage(chatId, text, replyMarkup);
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

  async sendAdminPanel(chatId, userId = "") {
    await this.telegram.sendMessage(chatId, "Кнопка администратора закреплена внизу чата.", {
      reply_markup: adminReplyKeyboard({ showWeeklyService: this.isWeeklyServiceCoordinator(userId) })
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

  async handleWeeklyServiceCommand(message) {
    if (!this.isWeeklyServiceCoordinator(message.from?.id)) {
      await this.telegram.sendMessage(message.chat.id, "Управление субботним служением доступно только Роману.");
      return;
    }
    if (message.chat.type !== "private") {
      await this.telegram.sendMessage(message.chat.id, "Откройте управление служением в личном чате с ботом.");
      return;
    }

    await this.store.ensureWeeklyServiceSheets();
    const dateKey = saturdayDateKey(localNowParts(this.config.timeZone));
    const service = await this.store.getWeeklyServiceByDate(dateKey);
    const status = service?.status || "ещё не создан";
    await this.telegram.sendMessage(
      message.chat.id,
      [
        `Субботнее служение: ${dateKey.split("-").reverse().join(".")}`,
        `Статус: ${status}`,
        "",
        "Фактическое присутствие и нагрузку лидеров можно отметить в листе «Посещаемость служений»."
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Отменить опрос на эту субботу", callback_data: serviceControlCallbackData("cancel", service?.service_id || dateKey) }],
            [{ text: "Настроить нагрузку лидеров", callback_data: serviceControlCallbackData("weights", service?.service_id || dateKey) }],
            [{ text: "Сформировать группы", callback_data: serviceControlCallbackData("assign", service?.service_id || dateKey) }]
          ]
        }
      }
    );
  }

  async resolveWeeklyService(serviceIdOrDate) {
    const raw = String(serviceIdOrDate || "");
    let service = raw.startsWith("service_")
      ? await this.store.getWeeklyService(raw)
      : await this.store.getWeeklyServiceByDate(raw);
    if (service) return service;

    const dateKey = raw.startsWith("service_")
      ? saturdayDateKey(localNowParts(this.config.timeZone))
      : raw;
    return this.store.createWeeklyService({
      serviceId: raw.startsWith("service_") ? raw : `service_${dateKey.replace(/-/g, "")}`,
      dateKey,
      status: "cancelled"
    });
  }

  async handleWeeklyServiceVote(callbackQuery) {
    const [, serviceId, group, answer] = String(callbackQuery.data || "").split(":");
    if (!["leaders", "teenagers"].includes(group) || !["yes", "no", "maybe"].includes(answer)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Неизвестный вариант ответа.");
      return;
    }

    await this.answerCallbackQuerySafely(callbackQuery.id, "✅ Голос принят");
    this.scheduleWeeklyServiceVote({ serviceId, group, answer, telegramUser: callbackQuery.from });
  }

  async saveWeeklyServiceVote({ serviceId, group, answer, telegramUser }) {
    const service = await this.store.getWeeklyService(serviceId);
    if (!service || String(service.status) === "cancelled" || String(service.status) !== "polls_sent") {
      this.logger.warn(`[weekly_service_vote] skipped service=${serviceId} status=${service?.status || "missing"}`);
      return;
    }

    const user = await this.store.ensureUserFromTelegram(telegramUser);
    if ((group === "leaders") !== this.isLeaderUser(user)) {
      this.logger.warn(`[weekly_service_vote] skipped user=${telegramUser?.id || ""} group=${group} role=${user?.role || ""}`);
      return;
    }

    await this.store.upsertWeeklyAttendance({ service, user, group, answer });
    this.logger.log(`[weekly_service_vote] saved service=${serviceId} user=${telegramUser?.id || ""} answer=${answer}`);
  }

  scheduleWeeklyServiceVote({ serviceId, group, answer, telegramUser }) {
    if (!serviceId || !telegramUser?.id) return;

    const key = `${serviceId}:${telegramUser.id}`;
    const existing = this.backgroundServiceVoteRetries.get(key);
    this.backgroundServiceVoteRetries.set(key, {
      serviceId,
      group,
      answer,
      telegramUser,
      attempt: existing?.attempt || 0,
      scheduled: existing?.scheduled || false
    });
    if (!existing?.scheduled) this.runWeeklyServiceVoteRetry(key);
  }

  runWeeklyServiceVoteRetry(key) {
    const pending = this.backgroundServiceVoteRetries.get(key);
    if (!pending) return;

    pending.scheduled = true;
    const delayMs = pending.attempt === 0 ? 0 : Math.min(10 * 60_000, 5_000 * (3 ** pending.attempt));
    setTimeout(async () => {
      const current = this.backgroundServiceVoteRetries.get(key);
      if (!current) return;

      try {
        await this.saveWeeklyServiceVote(current);
        this.backgroundServiceVoteRetries.delete(key);
      } catch (error) {
        current.attempt += 1;
        current.scheduled = false;
        this.logger.warn(
          `[weekly_service_vote_retry] service=${current.serviceId} user=${current.telegramUser.id} attempt=${current.attempt}: ${error.message}`
        );
        this.runWeeklyServiceVoteRetry(key);
      }
    }, delayMs).unref?.();
  }

  async handleWeeklyServiceCallback(callbackQuery) {
    const [, action, serviceIdOrDate, userId, value] = String(callbackQuery.data || "").split(":");
    const leaderActions = new Set(["my_group", "note"]);
    if (!leaderActions.has(action) && !this.isWeeklyServiceCoordinator(callbackQuery.from?.id)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Это действие доступно только Роману.", { show_alert: true });
      return;
    }

    const service = action === "cancel"
      ? await this.resolveWeeklyService(serviceIdOrDate)
      : await this.store.getWeeklyService(serviceIdOrDate);
    if (!service) {
      await this.answerCallbackQuerySafely(
        callbackQuery.id,
        "Опрос ещё не опубликован. Настройка нагрузки и распределение станут доступны после субботнего голосования.",
        { show_alert: true }
      );
      return;
    }
    if (action === "cancel") {
      await this.store.updateWeeklyService(service.service_id, { status: "cancelled", cancelled_at: isoNow() });
      const messages = [
        [this.config.leadersGroupChatId, service.leader_message_id],
        [this.config.groupChatId, service.teenager_message_id]
      ];
      for (const [chatId, messageId] of messages) {
        if (chatId && messageId) {
          await this.telegram.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] })
            .catch((error) => this.logger.warn(`[weekly_service_cancel] ${error.message}`));
        }
      }
      this.clearCallbackKeyboard(callbackQuery);
      await this.answerCallbackQuerySafely(callbackQuery.id, "Опрос на эту субботу отменён.");
      await this.telegram.sendMessage(callbackQuery.from.id, "Опросы лидеров и подростков отменены. Новые ответы больше не принимаются.");
      return;
    }

    if (String(service.status) === "cancelled") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Опрос на эту субботу отменён.", { show_alert: true });
      return;
    }

    if (action === "weights") {
      const leaders = (await this.store.listWeeklyAttendance(service.service_id))
        .filter((row) => row.group === "leaders" && isPresent(row.actual_present));
      if (!leaders.length) {
        await this.answerCallbackQuerySafely(callbackQuery.id, "Сначала отметьте присутствующих лидеров в таблице.", { show_alert: true });
        return;
      }
      await this.answerCallbackQuerySafely(callbackQuery.id, "Выберите нагрузку.");
      for (const leader of leaders) {
        const current = Math.max(1, Math.min(4, Number(leader.leader_weight || 2)));
        await this.telegram.sendMessage(callbackQuery.from.id, `Нагрузка: ${leader.full_name || leader.username || leader.telegram_user_id} — ${current}`, {
          reply_markup: {
            inline_keyboard: [[1, 2, 3, 4].map((weight) => ({
              text: weight === current ? `✓ ${weight}` : String(weight),
              callback_data: `service:weight:${service.service_id}:${leader.telegram_user_id}:${weight}`
            }))]
          }
        });
      }
      return;
    }

    if (action === "weight") {
      const weight = Math.max(1, Math.min(4, Number(value || 2)));
      await this.store.updateWeeklyAttendance(service.service_id, userId, { leader_weight: String(weight) });
      await this.answerCallbackQuerySafely(callbackQuery.id, `Нагрузка ${weight} сохранена.`);
      return;
    }

    if (action === "assign") {
      const attendance = await this.store.listWeeklyAttendance(service.service_id);
      const leaders = attendance.filter((row) => row.group === "leaders" && isPresent(row.actual_present));
      const teenagers = attendance.filter((row) => row.group === "teenagers" && isPresent(row.actual_present));
      if (!leaders.length || !teenagers.length) {
        await this.answerCallbackQuerySafely(callbackQuery.id, "В таблице должны быть отмечены присутствующие лидеры и подростки.", { show_alert: true });
        return;
      }
      const assignments = weightedAssignments(leaders, teenagers);
      for (const assignment of assignments) {
        await this.store.updateWeeklyAttendance(service.service_id, assignment.teenager.telegram_user_id, {
          assigned_leader_id: assignment.leader.telegram_user_id,
          assigned_leader_name: assignment.leader.full_name || assignment.leader.username || ""
        });
      }
      await this.store.updateWeeklyService(service.service_id, { status: "assigned", assigned_at: isoNow() });
      const sentTo = new Set();
      for (const leader of leaders) {
        if (sentTo.has(String(leader.telegram_user_id))) continue;
        sentTo.add(String(leader.telegram_user_id));
        await this.telegram.sendMessage(leader.telegram_user_id, "Распределение на сегодня готово.", {
          reply_markup: { inline_keyboard: [[{
            text: "Моя группа",
            callback_data: `service:my_group:${service.service_id}`
          }]] }
        }).catch((error) => this.logger.warn(`[weekly_service_assignment_send] ${leader.telegram_user_id}: ${error.message}`));
      }
      await this.answerCallbackQuerySafely(callbackQuery.id, "✅ Группы сформированы и отправлены лидерам.", { show_alert: true });
      return;
    }

    if (action === "my_group") {
      const attendance = await this.store.listWeeklyAttendance(service.service_id);
      const teenagers = attendance.filter((row) => String(row.assigned_leader_id) === String(callbackQuery.from?.id || ""));
      if (!teenagers.length) {
        await this.answerCallbackQuerySafely(callbackQuery.id, "На сегодня подростки не назначены.");
        return;
      }
      await this.answerCallbackQuerySafely(callbackQuery.id, "Открываю список.");
      await this.telegram.sendMessage(callbackQuery.from.id, "Твоя группа на сегодня:");
      for (const teenager of teenagers) {
        await this.telegram.sendMessage(callbackQuery.from.id, teenager.full_name || teenager.username || "Подросток", {
          reply_markup: { inline_keyboard: [[{
            text: "Оставить заметку после беседы",
            callback_data: `service:note:${service.service_id}:${teenager.telegram_user_id}`
          }]] }
        });
      }
      return;
    }

    if (action === "note") {
      const attendance = await this.store.listWeeklyAttendance(service.service_id);
      const teenager = attendance.find((row) => String(row.telegram_user_id) === String(userId));
      if (!teenager || String(teenager.assigned_leader_id) !== String(callbackQuery.from?.id || "")) {
        await this.answerCallbackQuerySafely(callbackQuery.id, "Эта карточка недоступна.", { show_alert: true });
        return;
      }
      await this.answerCallbackQuerySafely(callbackQuery.id, "Выберите итог беседы.");
      await this.telegram.sendMessage(callbackQuery.from.id, `Заметка: ${teenager.full_name || teenager.username}`, {
        reply_markup: { inline_keyboard: [
          [{ text: "Побеседовали, всё хорошо", callback_data: `service_note:ok:${service.service_id}:${userId}` }],
          [{ text: "Нужна поддержка", callback_data: `service_note:support:${service.service_id}:${userId}` }],
          [{ text: "Нужен повторный контакт", callback_data: `service_note:followup:${service.service_id}:${userId}` }],
          [{ text: "Рекомендовать беседу с другим лидером", callback_data: `service_note:refer:${service.service_id}:${userId}` }]
        ] }
      });
    }
  }

  async handlePastoralNoteStatusCallback(callbackQuery) {
    const [, status, serviceId, teenagerId] = String(callbackQuery.data || "").split(":");
    const service = await this.store.getWeeklyService(serviceId);
    const attendance = service ? await this.store.listWeeklyAttendance(serviceId) : [];
    const teenager = attendance.find((row) => String(row.telegram_user_id) === String(teenagerId));
    if (!teenager || String(teenager.assigned_leader_id) !== String(callbackQuery.from?.id || "")) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Эта карточка недоступна.", { show_alert: true });
      return;
    }
    this.pendingPastoralNotes.set(String(callbackQuery.from.id), { service, teenager, status });
    this.clearCallbackKeyboard(callbackQuery);
    await this.answerCallbackQuerySafely(callbackQuery.id, "Статус выбран.");
    await this.telegram.sendMessage(callbackQuery.from.id, "Напишите короткий комментарий для Романа и Александра. Чтобы сохранить без комментария, отправьте -");
  }

  async handlePendingPastoralNoteText(message) {
    const pending = this.pendingPastoralNotes.get(String(message.from?.id || ""));
    if (!pending || message.chat.type !== "private") return false;
    const text = String(message.text || "").trim();
    if (!text || text.startsWith("/")) return false;
    const labels = {
      ok: "Побеседовали, всё хорошо",
      support: "Нужна поддержка",
      followup: "Нужен повторный контакт",
      refer: "Рекомендуется беседа с другим лидером"
    };
    const leader = await this.store.getUserByTelegramId(message.from.id);
    const values = [
      pending.service.service_date,
      pending.service.service_id,
      pending.teenager.full_name || pending.teenager.username || "",
      pending.teenager.username || "",
      [leader?.last_name, leader?.first_name, leader?.middle_name].filter(Boolean).join(" ") || leader?.username || String(message.from.id),
      labels[pending.status] || pending.status,
      text === "-" ? "" : text,
      isoNow()
    ];
    await this.store.appendPastoralNote(values);
    this.pendingPastoralNotes.delete(String(message.from.id));
    await this.telegram.sendMessage(message.chat.id, "✅ Закрытая заметка сохранена. Её увидят только Роман и Александр.");
    return true;
  }

  async handleCallback(callbackQuery) {
    const data = callbackQuery.data || "";
    const [kind] = data.split(":");
    if (kind === "bday") {
      await this.handleBirthdayCallback(callbackQuery);
      return;
    }

    if (kind === "preview") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Это только предпросмотр.");
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

    if (kind === "program") {
      await this.handleProgramPollCallback(callbackQuery);
      return;
    }

    if (kind === "comment") {
      await this.handleEventCommentCallback(callbackQuery);
      return;
    }

    if (kind === "service_vote") {
      await this.handleWeeklyServiceVote(callbackQuery);
      return;
    }

    if (kind === "service") {
      await this.handleWeeklyServiceCallback(callbackQuery);
      return;
    }

    if (kind === "service_note") {
      await this.handlePastoralNoteStatusCallback(callbackQuery);
      return;
    }

    if (kind === "program_vote") {
      try {
        await this.handleProgramVoteCallback(callbackQuery);
      } catch (error) {
        this.logger.error(
          `[program_vote_callback] user=${callbackQuery.from?.id || ""} username=${callbackQuery.from?.username || ""} data=${callbackQuery.data || ""}`,
          error
        );
        await this.sendCallbackFollowUp(callbackQuery, "Не удалось обработать ответ по программе. Администратор уже увидит ошибку в логах.");
      }
      return;
    }

    if (kind !== "vote") return;

    const [, eventId, optionIndexRaw] = data.split(":");
    const user = this.store.enabled
      ? await this.store.getUserByTelegramId(callbackQuery.from?.id)
      : null;
    if (!isProfileComplete(user)) {
      this.logger.log(
        `[event_vote] profile_required user=${callbackQuery.from?.id || ""} username=${callbackQuery.from?.username || ""} event=${eventId}`
      );
      await this.answerCallbackQuerySafely(
        callbackQuery.id,
        "Сначала запусти @GethEvents_bot и заполни короткую анкету. После этого вернись к голосованию.",
        { show_alert: true }
      );
      return;
    }

    const event = await this.store.getEvent(eventId);
    if (!event) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено или закрыто.", { show_alert: true });
      return;
    }

    if (!this.canViewEvent(event, user)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Это мероприятие доступно только лидерам.", { show_alert: true });
      return;
    }

    await this.answerCallbackQuerySafely(
      callbackQuery.id,
      "✅ Спасибо! Ваш голос принят.\n\nПовторно нажимать не нужно.",
      { show_alert: true }
    );
    this.finishVoteRegistrationOnce({ callbackQuery, eventId, optionIndexRaw, event });
  }

  async handleProgramVoteCallback(callbackQuery) {
    const parts = String(callbackQuery.data || "").split(":");
    const programId = parts[1];
    const legacyOptionCallback = parts.length === 3 && /^\d+$/.test(parts[2] || "");
    const action = legacyOptionCallback ? "toggle" : parts[2];
    const optionIndexRaw = legacyOptionCallback ? parts[2] : parts[3];
    this.answerProgramVoteCallbackFast(callbackQuery, action)
      .catch((error) => this.logger.warn(`[program_vote_ack] ${error.message}`));

    if ((action === "toggle" || action === "clear") && await this.tryFastProgramVoteKeyboardUpdate(callbackQuery, programId, action, optionIndexRaw)) {
      return;
    }

    const user = this.store.enabled
      ? await this.store.getUserByTelegramId(callbackQuery.from?.id)
      : null;

    if (!isProfileComplete(user)) {
      await this.sendCallbackFollowUp(
        callbackQuery,
        "Сначала запусти @GethEvents_bot и заполни короткую анкету. После этого вернись к голосованию."
      );
      return;
    }

    const program = await this.store.getProgramPoll(programId);
    if (!program || String(program.status || "") !== "sent") {
      await this.sendCallbackFollowUp(callbackQuery, "Опрос программы не найден или еще не отправлен.");
      return;
    }

    const options = programOptions(program);
    const recipients = await this.store.listProgramRecipients(program.event_id);
    const recipient = recipients.find((item) => {
      return String(item.telegram_user_id) === String(callbackQuery.from?.id || "");
    });
    if (!recipient) {
      await this.sendCallbackFollowUp(
        callbackQuery,
        "Этот опрос доступен только участникам, которые записались или пока думают."
      );
      return;
    }

    const selectionKey = programVoteSelectionKey(program.program_id, callbackQuery.from?.id || "");
    const callbackMaskValue = action === "toggle" ? parts[4] : action === "done" ? parts[3] : "";
    const hasCallbackSelection = typeof callbackMaskValue === "string" && callbackMaskValue.trim() !== "";
    const callbackSelectedIndexes = hasCallbackSelection
      ? programSelectionIndexesFromMask(callbackMaskValue, options)
      : [];
    const selectedIndexes = hasCallbackSelection
      ? new Set(callbackSelectedIndexes)
      : await this.currentProgramVoteSelection({ program, userId: callbackQuery.from?.id });

    if (action === "toggle") {
      const optionIndex = Number(optionIndexRaw);
      if (!options[optionIndex]) {
        await this.sendCallbackFollowUp(callbackQuery, "Такой вариант ответа не найден.");
        return;
      }

      const nextSelection = new Set(selectedIndexes);
      if (nextSelection.has(optionIndex)) {
        nextSelection.delete(optionIndex);
      } else {
        nextSelection.add(optionIndex);
      }

      this.pendingProgramVoteSelections.set(selectionKey, nextSelection);
      await this.refreshProgramVoteKeyboard(callbackQuery, program, nextSelection);
      return;
    }

    if (action === "clear") {
      this.pendingProgramVoteSelections.set(selectionKey, new Set());
      await this.refreshProgramVoteKeyboard(callbackQuery, program, []);
      return;
    }

    if (action !== "done") {
      await this.sendCallbackFollowUp(callbackQuery, "Неизвестное действие.");
      return;
    }

    const selectedOption = serializeProgramSelection(options, selectedIndexes);
    if (!selectedOption) {
      await this.sendCallbackFollowUp(callbackQuery, "Выберите хотя бы один вариант и нажмите «Готово».");
      return;
    }

    this.finishProgramVoteOnce({ callbackQuery, program, selectedOption, recipient });
  }

  async tryFastProgramVoteKeyboardUpdate(callbackQuery, programId, action, optionIndexRaw) {
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;
    const keyboard = callbackQuery.message?.reply_markup?.inline_keyboard;
    if (!chatId || !messageId || !Array.isArray(keyboard)) return false;

    const optionButtons = [];
    for (const row of keyboard) {
      const button = Array.isArray(row) ? row[0] : null;
      const match = button ? programVoteToggleMatch(button.callback_data, programId) : null;
      if (match) {
        optionButtons.push({
          index: Number(match[1]),
          text: button.text,
          selected: programVoteButtonSelected(button.text)
        });
      }
    }
    if (!optionButtons.length) return false;

    const selectedIndexes = new Set(optionButtons
      .filter((button) => button.selected)
      .map((button) => button.index));

    if (action === "clear") {
      selectedIndexes.clear();
    } else {
      const optionIndex = Number(optionIndexRaw);
      if (!optionButtons.some((button) => button.index === optionIndex)) return false;

      if (selectedIndexes.has(optionIndex)) {
        selectedIndexes.delete(optionIndex);
      } else {
        selectedIndexes.add(optionIndex);
      }
    }

    const nextSelectedIndexes = [...selectedIndexes].sort((a, b) => a - b);
    const nextKeyboard = optionButtons
      .sort((a, b) => a.index - b.index)
      .map((button) => [{
        text: programVoteButtonText(button.text, selectedIndexes.has(button.index)),
        callback_data: programVoteCallbackData(programId, button.index, nextSelectedIndexes)
      }]);

    nextKeyboard.push([{
      text: selectedIndexes.size ? `Готово (${selectedIndexes.size})` : "Готово",
      callback_data: programVoteDoneCallbackData(programId, nextSelectedIndexes)
    }]);

    if (selectedIndexes.size) {
      nextKeyboard.push([{ text: "Сбросить выбор", callback_data: programVoteClearCallbackData(programId) }]);
    }

    this.pendingProgramVoteSelections.set(programVoteSelectionKey(programId, callbackQuery.from?.id || ""), new Set(nextSelectedIndexes));
    await this.telegram.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: nextKeyboard })
      .catch((error) => {
        if (!/message is not modified/i.test(error.message || "")) {
          this.logger.warn(`[program_vote_fast_keyboard] ${error.message}`);
        }
      });
    return true;
  }

  answerProgramVoteCallbackFast(callbackQuery, action) {
    const text = action === "done"
      ? "Сохраняю ответ..."
      : action === "clear"
        ? "Очищаю выбор..."
        : "Обновляю выбор...";
    return this.answerCallbackQuerySafely(callbackQuery.id, text);
  }

  async currentProgramVoteSelection({ program, userId }) {
    const key = programVoteSelectionKey(program.program_id, userId || "");
    if (this.pendingProgramVoteSelections.has(key)) {
      return new Set(this.pendingProgramVoteSelections.get(key));
    }

    const existingVote = typeof this.store.getProgramVote === "function"
      ? await this.store.getProgramVote(program.program_id, userId)
      : null;
    const selectedIndexes = programSelectionIndexesFromText(
      programOptions(program),
      existingVote?.selected_option
    );
    const selection = new Set(selectedIndexes);
    this.pendingProgramVoteSelections.set(key, selection);
    return new Set(selection);
  }

  async refreshProgramVoteKeyboard(callbackQuery, program, selectedIndexes) {
    const chatId = callbackQuery.message?.chat?.id;
    const messageId = callbackQuery.message?.message_id;
    if (!chatId || !messageId) return;

    await this.telegram.editMessageReplyMarkup(chatId, messageId, {
      inline_keyboard: programPollInlineKeyboard(program, selectedIndexes)
    }).catch((error) => {
      if (!/message is not modified/i.test(error.message || "")) {
        this.logger.warn(`[program_vote_keyboard] ${error.message}`);
      }
    });
  }

  finishProgramVoteOnce({ callbackQuery, program, selectedOption, recipient }) {
    const key = `${program.program_id}:${callbackQuery.from?.id || ""}`;
    const pending = this.pendingProgramVotes.get(key);
    if (pending) {
      this.queuedProgramVotes.set(key, { callbackQuery, program, selectedOption, recipient });
      return pending;
    }

    const promise = this.finishProgramVote({ callbackQuery, program, selectedOption, recipient })
      .finally(() => {
        this.pendingProgramVotes.delete(key);
        const queued = this.queuedProgramVotes.get(key);
        if (queued) {
          this.queuedProgramVotes.delete(key);
          this.finishProgramVoteOnce(queued);
        }
      });
    this.pendingProgramVotes.set(key, promise);
    return promise;
  }

  async finishProgramVote({ callbackQuery, program, selectedOption, recipient }) {
    try {
      await this.store.upsertProgramVote({
        program,
        user: {
          ...recipient.user,
          telegram_user_id: recipient.telegram_user_id,
          username: recipient.user?.username || callbackQuery.from?.username || ""
        },
        registration: recipient.registration,
        selectedOption
      });
      const selectionKey = programVoteSelectionKey(program.program_id, callbackQuery.from?.id || "");
      const currentSelection = this.pendingProgramVoteSelections.get(selectionKey);
      if (!currentSelection || serializeProgramSelection(programOptions(program), currentSelection) === selectedOption) {
        this.pendingProgramVoteSelections.delete(selectionKey);
      }
      await this.sendCallbackFollowUp(callbackQuery, "✅ Ответ по программе сохранён.");
    } catch (error) {
      this.logger.error(
        `[program_vote] user=${callbackQuery.from?.id || ""} username=${callbackQuery.from?.username || ""} program=${program.program_id || ""} selected="${selectedOption}"`,
        error
      );
      await this.sendCallbackFollowUp(callbackQuery, "Не удалось записать ответ по программе. Администратор уже увидит ошибку в логах.");
    }
  }

  finishVoteRegistrationOnce({ callbackQuery, eventId, optionIndexRaw, event }) {
    const key = `${eventId}:${callbackQuery.from?.id || ""}`;
    const pending = this.pendingVoteRegistrations.get(key);
    if (pending) {
      this.queuedVoteRegistrations.set(key, { callbackQuery, eventId, optionIndexRaw, event });
      return pending;
    }

    const promise = this.finishVoteRegistration({ callbackQuery, eventId, optionIndexRaw, event })
      .finally(() => {
        this.pendingVoteRegistrations.delete(key);
        const queued = this.queuedVoteRegistrations.get(key);
        if (queued) {
          this.queuedVoteRegistrations.delete(key);
          this.finishVoteRegistrationOnce(queued);
        }
      });
    this.pendingVoteRegistrations.set(key, promise);
    return promise;
  }

  async finishVoteRegistration({ callbackQuery, eventId, optionIndexRaw, event: providedEvent }) {
    let answer = "";
    try {
      const event = providedEvent || await this.store.getEvent(eventId);
      if (!event) {
        await this.sendCallbackFollowUp(callbackQuery, "Мероприятие не найдено или закрыто.");
        return;
      }

      const options = String(event.options || "")
        .split("|")
        .map((item) => item.trim())
        .filter(Boolean);
      const optionIndex = Number(optionIndexRaw);
      answer = options[optionIndex];

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
      this.backgroundVoteRetries.delete(`${event.event_id}:${callbackQuery.from?.id || ""}`);
      this.logger.log(
        `[event_vote] saved user=${callbackQuery.from?.id || ""} username=${callbackQuery.from?.username || ""} event=${event.event_id || eventId} answer="${answer}"`
      );

    } catch (error) {
      this.logger.error(
        `[event_vote] failed user=${callbackQuery.from?.id || ""} username=${callbackQuery.from?.username || ""} event=${eventId} option=${optionIndexRaw}`,
        error
      );
      this.scheduleBackgroundVoteRetry({
        event: providedEvent,
        telegramUser: callbackQuery.from,
        answer,
        sourceMessageId: callbackQuery.message?.message_id || ""
      });
    }
  }

  scheduleBackgroundVoteRetry({ event, telegramUser, answer, sourceMessageId }) {
    if (!event?.event_id || !telegramUser?.id || !answer) return;

    const key = `${event.event_id}:${telegramUser.id}`;
    const existing = this.backgroundVoteRetries.get(key);
    this.backgroundVoteRetries.set(key, {
      event,
      telegramUser,
      answer,
      sourceMessageId,
      attempt: existing?.attempt || 0,
      scheduled: existing?.scheduled || false
    });
    if (!existing?.scheduled) this.runBackgroundVoteRetry(key);
  }

  runBackgroundVoteRetry(key) {
    const pending = this.backgroundVoteRetries.get(key);
    if (!pending) return;

    pending.scheduled = true;
    const delayMs = Math.min(10 * 60_000, 5_000 * (3 ** pending.attempt));
    setTimeout(async () => {
      const current = this.backgroundVoteRetries.get(key);
      if (!current) return;

      try {
        await this.store.upsertRegistration(current);
        this.backgroundVoteRetries.delete(key);
        this.logger.log(`[event_vote_retry] saved event=${current.event.event_id} user=${current.telegramUser.id}`);
      } catch (error) {
        current.attempt += 1;
        current.scheduled = false;
        this.logger.warn(
          `[event_vote_retry] event=${current.event.event_id} user=${current.telegramUser.id} attempt=${current.attempt}: ${error.message}`
        );
        this.runBackgroundVoteRetry(key);
      }
    }, delayMs).unref?.();
  }

  async sendCallbackFollowUp(callbackQuery, text) {
    try {
      await this.telegram.sendMessage(callbackQuery.from.id, text);
    } catch (error) {
      this.logger.warn(`[callback_followup] ${error.message}`);
    }
  }

  async answerCallbackQuerySafely(callbackQueryId, text, extra = {}) {
    try {
      await this.telegram.answerCallbackQuery(callbackQueryId, text, extra);
    } catch (error) {
      const message = String(error.message || "");
      if (/query is too old|response timeout expired|query ID is invalid/i.test(message)) {
        this.logger.warn(`[callback_ack_late] ${message}`);
        return;
      }
      throw error;
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
    this.clearEventDraftStates(String(userId));
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

  async handlePendingEventMessage(message) {
    const userId = String(message.from?.id || "");
    const state = this.pendingEventDrafts.get(userId);
    if (!state || message.chat.type !== "private") return false;

    const text = String(message.text || "").trim();
    const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
    if (!text && !hasPhoto) return false;

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
    if (hasPhoto && field.key !== "photo_file_id") {
      await this.telegram.sendMessage(message.chat.id, "На этом шаге нужен текст. Фото можно будет отправить на отдельном шаге «Фото».");
      return true;
    }

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

    if (field.key === "photo_file_id") {
      if (hasPhoto) {
        const bestPhoto = [...message.photo].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
        state.data.photo_file_id = bestPhoto.file_id;
      } else if (text === "-") {
        state.data.photo_file_id = "";
      } else {
        await this.telegram.sendMessage(message.chat.id, "На этом шаге отправьте фото или - чтобы пропустить.");
        return true;
      }
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

    if (this.canCreateLeadersEvent(userId)) {
      state.status = "audience";
      await this.telegram.sendMessage(message.chat.id, "Подготовить мероприятие для всех или для лидеров?", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Для всех", callback_data: "event:audience_all" }],
            [{ text: "Для лидеров", callback_data: "event:audience_leaders" }]
          ]
        }
      });
      return true;
    }

    state.data.audience = EVENT_AUDIENCE_ALL;
    state.status = "confirm";
    await this.telegram.sendMessage(message.chat.id, eventDraftSummary(state.data), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Отправить Роману на публикацию", callback_data: "event:publish" }],
          [{ text: "Сгенерировать ссылку", callback_data: "event:link" }],
          [{ text: "Заполнить заново", callback_data: "event:restart" }],
          [{ text: "Отменить", callback_data: "event:cancel" }]
        ]
      }
    });
    return true;
  }

  async handleEventWizardCallback(callbackQuery) {
    const [, action, eventIdFromCallback] = String(callbackQuery.data || "").split(":");
    const userId = String(callbackQuery.from?.id || "");

    if (!this.canManageEvents(userId)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Создавать мероприятия могут только администраторы.");
      return;
    }

    if (action === "approve_publish" || action === "reject_publish") {
      await this.handleEventPublicationApprovalCallback(callbackQuery, action, eventIdFromCallback);
      return;
    }

    if (action === "new" || action === "restart") {
      this.clearCallbackKeyboard(callbackQuery);
      await this.answerCallbackQuerySafely(callbackQuery.id, action === "new" ? "Начинаем создание." : "Заполняем заново.");
      await this.startEventWizard(callbackQuery.message.chat.id, callbackQuery.from.id);
      return;
    }

    if (action === "cancel") {
      this.pendingEventDrafts.delete(userId);
      this.pendingEventPhotos.delete(userId);
      this.pendingEventDescriptions.delete(userId);
      this.pendingProgramPollDrafts.delete(userId);
      this.pendingEventCommentDrafts.delete(userId);
      this.clearCallbackKeyboard(callbackQuery);
      await this.answerCallbackQuerySafely(callbackQuery.id, "Создание отменено.");
      await this.sendAdminPanel(callbackQuery.message.chat.id);
      return;
    }

    if (action === "audience_all" || action === "audience_leaders") {
      const state = this.pendingEventDrafts.get(userId);
      if (!state || state.status !== "audience") {
        await this.answerCallbackQuerySafely(callbackQuery.id, "Черновик не найден. Создайте мероприятие заново.");
        return;
      }

      if (action === "audience_leaders" && !this.canCreateLeadersEvent(userId)) {
        await this.answerCallbackQuerySafely(callbackQuery.id, "Создавать мероприятия для лидеров могут только Роман и Александр.");
        return;
      }

      state.data.audience = action === "audience_leaders" ? EVENT_AUDIENCE_LEADERS : EVENT_AUDIENCE_ALL;
      state.status = "confirm";
      this.clearCallbackKeyboard(callbackQuery);
      await this.answerCallbackQuerySafely(callbackQuery.id, "Аудитория выбрана.");
      await this.telegram.sendMessage(callbackQuery.message.chat.id, eventDraftSummary(state.data), {
        reply_markup: {
          inline_keyboard: [
            [{ text: "Отправить Роману на публикацию", callback_data: "event:publish" }],
            [{ text: "Сгенерировать ссылку", callback_data: "event:link" }],
            [{ text: "Заполнить заново", callback_data: "event:restart" }],
            [{ text: "Отменить", callback_data: "event:cancel" }]
          ]
        }
      });
      return;
    }

    if (action === "add_photo") {
      await this.startExistingEventPhotoFlow(callbackQuery, eventIdFromCallback);
      return;
    }

    if (action === "edit_description") {
      await this.startExistingEventDescriptionFlow(callbackQuery, eventIdFromCallback);
      return;
    }

    if (action === "add_program") {
      await this.startProgramPollFlow(callbackQuery, eventIdFromCallback);
      return;
    }

    if (action === "add_comment") {
      await this.startEventCommentFlow(callbackQuery, eventIdFromCallback);
      return;
    }

    if (action === "publish_group") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Отправляю Роману на согласование.");
      this.clearCallbackKeyboard(callbackQuery);

      try {
        const result = await this.requestEventPublicationApproval(eventIdFromCallback, callbackQuery.from);
        await this.telegram.sendMessage(
          callbackQuery.message.chat.id,
          result.alreadyPublished
            ? "Это мероприятие уже было опубликовано."
            : `✅ Запрос на публикацию отправлен Роману. event_id: ${result.eventId}`
        );
        await this.sendAdminPanel(callbackQuery.message.chat.id);
      } catch (error) {
        this.logger.error("[event_publish_group]", error);
        await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось опубликовать мероприятие. Ошибка уже в логах.");
      }
      return;
    }

    if (action === "close") {
      await this.handleCloseEventCallback(callbackQuery, eventIdFromCallback);
      return;
    }

    if (action !== "publish" && action !== "link") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Неизвестное действие.");
      return;
    }

    const state = this.pendingEventDrafts.get(userId);
    if (!state || state.status !== "confirm") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Черновик не найден. Создайте мероприятие заново.");
      return;
    }

    await this.answerCallbackQuerySafely(
      callbackQuery.id,
      action === "publish" ? "Отправляю на согласование." : "Создаю ссылку."
    );
    this.clearCallbackKeyboard(callbackQuery);

    try {
      const result = await this.createEventLinkDraft(state.data);
      if (action === "publish") {
        await this.requestEventPublicationApproval(result.eventId, callbackQuery.from);
      }
      this.pendingEventDrafts.delete(userId);
      if (action === "publish") {
        await this.telegram.sendMessage(
          callbackQuery.message.chat.id,
          [
            `✅ Мероприятие создано и отправлено Роману на согласование. event_id: ${result.eventId}`,
            "",
            "Ссылка для регистрации через ЛС:",
            result.shareLink
          ].join("\n")
        );
      } else {
        await this.telegram.sendMessage(
          callbackQuery.message.chat.id,
          [
            `✅ Ссылка создана. event_id: ${result.eventId}`,
            "",
            "Её можно отправить в другую группу или лично человеку:",
            result.shareLink,
            "",
            "Когда понадобится, это же мероприятие можно отправить Роману на публикацию кнопкой ниже."
          ].join("\n"),
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "Отправить Роману на публикацию", callback_data: `event:publish_group:${result.eventId}` }]
              ]
            }
          }
        );
      }
      await this.sendAdminPanel(callbackQuery.message.chat.id);
    } catch (error) {
      this.logger.error("[event_publish]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось запустить регистрацию. Ошибка уже в логах.");
    }
  }

  async handleProgramPollCallback(callbackQuery) {
    const [, action, programId] = String(callbackQuery.data || "").split(":");
    const userId = String(callbackQuery.from?.id || "");

    if (action === "approve" || action === "reject") {
      await this.handleProgramPollApprovalCallback(callbackQuery, action, programId);
      return;
    }

    if (!this.canManageEvents(userId)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Создавать программу могут только администраторы.");
      return;
    }

    const state = this.pendingProgramPollDrafts.get(userId);

    if (action === "restart") {
      if (!state?.eventId) {
        await this.answerCallbackQuerySafely(callbackQuery.id, "Черновик не найден.");
        return;
      }

      this.pendingProgramPollDrafts.set(userId, {
        eventId: state.eventId,
        step: 0,
        data: {},
        status: "collecting"
      });
      this.clearCallbackKeyboard(callbackQuery);
      await this.answerCallbackQuerySafely(callbackQuery.id, "Заполняем заново.");
      await this.sendCurrentProgramPollPrompt(callbackQuery.message.chat.id, userId);
      return;
    }

    if (action === "cancel") {
      this.pendingProgramPollDrafts.delete(userId);
      this.clearCallbackKeyboard(callbackQuery);
      await this.answerCallbackQuerySafely(callbackQuery.id, "Создание отменено.");
      await this.sendAdminPanel(callbackQuery.message.chat.id);
      return;
    }

    if (action !== "submit") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Неизвестное действие.");
      return;
    }

    if (!state || state.status !== "confirm") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Черновик не найден. Создайте программу заново.");
      return;
    }

    await this.answerCallbackQuerySafely(callbackQuery.id, "Отправляю Роману на согласование.");
    this.clearCallbackKeyboard(callbackQuery);

    try {
      const event = await this.store.getEvent(state.eventId);
      if (!event) {
        throw new Error(`Event not found or closed: ${state.eventId}`);
      }

      const recipients = await this.store.listProgramRecipients(state.eventId);
      if (!recipients.length) {
        await this.telegram.sendMessage(
          callbackQuery.message.chat.id,
          "Пока нет получателей: нужны участники с ответом «Записываюсь» или «Пока не знаю»."
        );
        return;
      }

      const programIdNext = `pg_${Date.now().toString(36)}`;
      const program = await this.store.createProgramPoll({
        programId: programIdNext,
        event,
        title: state.data.title,
        message: state.data.message,
        options: serializeProgramOptions(state.data.options),
        photoFileId: state.data.photo_file_id,
        createdBy: callbackQuery.from.id,
        targetCount: recipients.length
      });

      await this.requestProgramPollApproval(program.program_id, callbackQuery.from);
      this.pendingProgramPollDrafts.delete(userId);
      await this.telegram.sendMessage(
        callbackQuery.message.chat.id,
        `✅ Программа с опросом отправлена Роману на согласование. program_id: ${program.program_id}`
      );
      await this.sendAdminPanel(callbackQuery.message.chat.id);
    } catch (error) {
      this.logger.error("[program_submit]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось отправить программу на согласование. Ошибка уже в логах.");
    }
  }

  async handleEventCommentCallback(callbackQuery) {
    const [, action, broadcastId] = String(callbackQuery.data || "").split(":");
    const userId = String(callbackQuery.from?.id || "");

    if (action === "approve" || action === "reject") {
      await this.handleEventCommentApprovalCallback(callbackQuery, action, broadcastId);
      return;
    }

    if (!this.canManageEvents(userId)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Отправлять комментарии могут только администраторы.");
      return;
    }

    const state = this.pendingEventCommentDrafts.get(userId);

    if (action === "restart") {
      if (!state?.eventId) {
        await this.answerCallbackQuerySafely(callbackQuery.id, "Черновик не найден.");
        return;
      }

      this.pendingEventCommentDrafts.set(userId, {
        eventId: state.eventId,
        step: 0,
        data: {},
        status: "collecting"
      });
      this.clearCallbackKeyboard(callbackQuery);
      await this.answerCallbackQuerySafely(callbackQuery.id, "Заполняем заново.");
      await this.sendCurrentEventCommentPrompt(callbackQuery.message.chat.id, userId);
      return;
    }

    if (action === "cancel") {
      this.pendingEventCommentDrafts.delete(userId);
      this.clearCallbackKeyboard(callbackQuery);
      await this.answerCallbackQuerySafely(callbackQuery.id, "Комментарий отменен.");
      await this.sendAdminPanel(callbackQuery.message.chat.id);
      return;
    }

    if (action !== "submit") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Неизвестное действие.");
      return;
    }

    if (!state || state.status !== "confirm") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Черновик не найден. Создайте комментарий заново.");
      return;
    }

    await this.answerCallbackQuerySafely(callbackQuery.id, "Отправляю Роману на согласование.");
    this.clearCallbackKeyboard(callbackQuery);

    try {
      const event = await this.store.getEvent(state.eventId);
      if (!event) {
        throw new Error(`Event not found or closed: ${state.eventId}`);
      }

      const recipients = await this.store.listProgramRecipients(state.eventId);
      if (!recipients.length) {
        await this.telegram.sendMessage(
          callbackQuery.message.chat.id,
          "Пока нет получателей: нужны участники с ответом «Записываюсь» или «Пока не знаю»."
        );
        return;
      }

      const broadcastIdNext = `bc_${Date.now().toString(36)}`;
      const broadcast = await this.store.createEventBroadcast({
        broadcastId: broadcastIdNext,
        event,
        type: "comment",
        message: state.data.message,
        photoFileId: state.data.photo_file_id,
        createdBy: callbackQuery.from.id,
        targetCount: recipients.length
      });

      await this.requestEventCommentApproval(broadcast.broadcast_id, callbackQuery.from);
      this.pendingEventCommentDrafts.delete(userId);
      await this.telegram.sendMessage(
        callbackQuery.message.chat.id,
        `✅ Комментарий отправлен Роману на согласование. broadcast_id: ${broadcast.broadcast_id}`
      );
      await this.sendAdminPanel(callbackQuery.message.chat.id);
    } catch (error) {
      this.logger.error("[comment_submit]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось отправить комментарий на согласование. Ошибка уже в логах.");
    }
  }

  async requestProgramPollApproval(programId, requestedBy) {
    const program = await this.store.getProgramPoll(programId);
    if (!program) {
      throw new Error(`Program poll not found: ${programId}`);
    }

    const approverChatId = this.config.birthdayApproverChatId;
    if (!approverChatId) {
      throw new Error("BIRTHDAY_APPROVER_CHAT_ID or SUPERADMIN_USER_ID is not configured");
    }

    await this.telegram.sendMessage(approverChatId, programPollApprovalText(program, requestedBy), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Утвердить и отправить", callback_data: `program:approve:${programId}` }],
          [{ text: "Отклонить", callback_data: `program:reject:${programId}` }]
        ]
      }
    });
  }

  async requestEventCommentApproval(broadcastId, requestedBy) {
    const broadcast = await this.store.getEventBroadcast(broadcastId);
    if (!broadcast) {
      throw new Error(`Event broadcast not found: ${broadcastId}`);
    }

    const approverChatId = this.config.birthdayApproverChatId;
    if (!approverChatId) {
      throw new Error("BIRTHDAY_APPROVER_CHAT_ID or SUPERADMIN_USER_ID is not configured");
    }

    await this.telegram.sendMessage(approverChatId, eventCommentApprovalText(broadcast, requestedBy), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Утвердить и отправить", callback_data: `comment:approve:${broadcastId}` }],
          [{ text: "Отклонить", callback_data: `comment:reject:${broadcastId}` }]
        ]
      }
    });
  }

  async handleProgramPollApprovalCallback(callbackQuery, action, programId) {
    if (!this.isBirthdayApprover(callbackQuery.from?.id)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Подтверждать отправку может только Роман.");
      return;
    }

    this.clearCallbackKeyboard(callbackQuery);

    if (action === "reject") {
      await this.store.updateProgramPoll(programId, {
        status: "rejected",
        approved_by: String(callbackQuery.from?.id || ""),
        approved_at: isoNow(),
        notes: "Rejected by approver"
      });
      await this.answerCallbackQuerySafely(callbackQuery.id, "Программа отклонена.");
      await this.telegram.sendMessage(callbackQuery.message.chat.id, `Ок, программа ${programId} отклонена.`);
      return;
    }

    await this.answerCallbackQuerySafely(callbackQuery.id, "Отправляю участникам.");
    try {
      const result = await this.deliverProgramPoll(programId, callbackQuery.from.id);
      await this.telegram.sendMessage(
        callbackQuery.message.chat.id,
        [
          `✅ Программа отправлена: ${result.sent}.`,
          `Не удалось отправить: ${result.failed}.`,
          result.skipped ? `Без личного чата с ботом: ${result.skipped}.` : ""
        ].filter(Boolean).join("\n")
      );
    } catch (error) {
      this.logger.error("[program_approval]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось отправить программу. Ошибка уже в логах.");
    }
  }

  async handleEventCommentApprovalCallback(callbackQuery, action, broadcastId) {
    if (!this.isBirthdayApprover(callbackQuery.from?.id)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Подтверждать отправку может только Роман.");
      return;
    }

    this.clearCallbackKeyboard(callbackQuery);

    if (action === "reject") {
      await this.store.updateEventBroadcast(broadcastId, {
        status: "rejected",
        approved_by: String(callbackQuery.from?.id || ""),
        approved_at: isoNow(),
        notes: "Rejected by approver"
      });
      await this.answerCallbackQuerySafely(callbackQuery.id, "Комментарий отклонен.");
      await this.telegram.sendMessage(callbackQuery.message.chat.id, `Ок, комментарий ${broadcastId} отклонен.`);
      return;
    }

    await this.answerCallbackQuerySafely(callbackQuery.id, "Отправляю участникам.");
    try {
      const result = await this.deliverEventComment(broadcastId, callbackQuery.from.id);
      await this.telegram.sendMessage(
        callbackQuery.message.chat.id,
        [
          `✅ Комментарий отправлен: ${result.sent}.`,
          `Не удалось отправить: ${result.failed}.`,
          result.skipped ? `Без личного чата с ботом: ${result.skipped}.` : ""
        ].filter(Boolean).join("\n")
      );
    } catch (error) {
      this.logger.error("[comment_approval]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось отправить комментарий. Ошибка уже в логах.");
    }
  }

  async sendProgramPollMessage(chatId, program) {
    const compactButtons = programUsesNumberedButtons(program);
    const text = programPollMessageText(program, { includeOptionsText: compactButtons });
    const replyMarkup = {
      reply_markup: { inline_keyboard: programPollInlineKeyboard(program, [], { compactButtons }) }
    };
    const photoFileId = eventPhotoFileId(program);

    if (photoFileId) {
      return this.telegram.sendPhoto(chatId, photoFileId, {
        caption: text,
        ...replyMarkup
      });
    }

    return this.telegram.sendMessage(chatId, text, replyMarkup);
  }

  async sendEventCommentMessage(chatId, broadcast) {
    const text = String(broadcast.message || "").trim();
    const photoFileId = eventPhotoFileId(broadcast);

    if (photoFileId) {
      return this.telegram.sendPhoto(chatId, photoFileId, { caption: text });
    }

    return this.telegram.sendMessage(chatId, text);
  }

  async deliverProgramPoll(programId, approvedBy) {
    const program = await this.store.getProgramPoll(programId);
    if (!program) {
      throw new Error(`Program poll not found: ${programId}`);
    }

    if (String(program.status || "") === "sent") {
      return {
        sent: Number(program.sent_count || 0),
        failed: Number(program.failed_count || 0),
        skipped: 0,
        alreadySent: true
      };
    }

    const recipients = await this.store.listProgramRecipients(program.event_id);
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const failures = [];

    for (const recipient of recipients) {
      const chatId = String(recipient.private_chat_id || recipient.telegram_user_id || "").trim();
      if (!chatId) {
        skipped += 1;
        failures.push(`${recipient.telegram_user_id || "unknown"}: no private chat id`);
        continue;
      }

      try {
        await this.sendProgramPollMessage(chatId, program);
        sent += 1;
      } catch (error) {
        failed += 1;
        failures.push(`${recipient.telegram_user_id}: ${error.message}`);
        this.logger.warn(`[program_send] ${recipient.telegram_user_id}: ${error.message}`);
      }
    }

    await this.store.updateProgramPoll(programId, {
      status: "sent",
      approved_by: String(approvedBy || ""),
      approved_at: isoNow(),
      target_count: recipients.length,
      sent_count: sent,
      failed_count: failed + skipped,
      notes: failures.slice(0, 10).join(" | ")
    });

    return { sent, failed, skipped, alreadySent: false };
  }

  async deliverEventComment(broadcastId, approvedBy) {
    const broadcast = await this.store.getEventBroadcast(broadcastId);
    if (!broadcast) {
      throw new Error(`Event broadcast not found: ${broadcastId}`);
    }

    if (String(broadcast.status || "") === "sent") {
      return {
        sent: Number(broadcast.sent_count || 0),
        failed: Number(broadcast.failed_count || 0),
        skipped: 0,
        alreadySent: true
      };
    }

    const recipients = await this.store.listProgramRecipients(broadcast.event_id);
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const failures = [];

    for (const recipient of recipients) {
      const chatId = String(recipient.private_chat_id || recipient.telegram_user_id || "").trim();
      if (!chatId) {
        skipped += 1;
        failures.push(`${recipient.telegram_user_id || "unknown"}: no private chat id`);
        continue;
      }

      try {
        await this.sendEventCommentMessage(chatId, broadcast);
        sent += 1;
      } catch (error) {
        failed += 1;
        failures.push(`${recipient.telegram_user_id}: ${error.message}`);
        this.logger.warn(`[comment_send] ${recipient.telegram_user_id}: ${error.message}`);
      }
    }

    await this.store.updateEventBroadcast(broadcastId, {
      status: "sent",
      approved_by: String(approvedBy || ""),
      approved_at: isoNow(),
      target_count: recipients.length,
      sent_count: sent,
      failed_count: failed + skipped,
      notes: failures.slice(0, 10).join(" | ")
    });

    return { sent, failed, skipped, alreadySent: false };
  }

  async handleCloseEventCallback(callbackQuery, eventId) {
    if (!eventId) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено.");
      return;
    }

    await this.answerCallbackQuerySafely(callbackQuery.id, "Закрываю регистрацию.");
    this.clearCallbackKeyboard(callbackQuery);

    try {
      const closed = await this.closeEvent(eventId);
      await this.telegram.sendMessage(
        callbackQuery.message.chat.id,
        [
          `✅ Регистрация закрыта: ${closed.title || eventId}`,
          "",
          "Новые голоса по этому мероприятию больше не принимаются."
        ].join("\n")
      );
      await this.sendAdminPanel(callbackQuery.message.chat.id);
    } catch (error) {
      this.logger.error("[event_close]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось закрыть мероприятие. Ошибка уже в логах.");
    }
  }

  async closeEvent(eventId) {
    const event = await this.store.updateEvent(eventId, { status: "closed" });
    if (eventIsPublishedToGroup(event)) {
      await this.telegram.editMessageReplyMarkup(event.group_chat_id, event.message_id, { inline_keyboard: [] })
        .catch((error) => this.logger.warn(`[event_close_keyboard] ${error.message}`));
    }
    return event;
  }

  async createEventLinkDraft(draft) {
    const eventId = `ev_${Date.now().toString(36)}`;
    await this.store.createEvent({
      eventId,
      ...draft,
      audience: draft.audience || EVENT_AUDIENCE_ALL,
      groupChatId: "",
      messageId: ""
    });

    return {
      eventId,
      shareLink: eventShareLink(this.config.botUsername, eventId)
    };
  }

  clearEventDraftStates(userId) {
    this.pendingEventDrafts.delete(userId);
    this.pendingEventPhotos.delete(userId);
    this.pendingEventDescriptions.delete(userId);
    this.pendingProgramPollDrafts.delete(userId);
    this.pendingEventCommentDrafts.delete(userId);
  }

  async startProgramPollFlow(callbackQuery, eventId) {
    const userId = String(callbackQuery.from?.id || "");
    if (!eventId) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено.");
      return;
    }

    const event = await this.store.getEvent(eventId);
    if (!event) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено или закрыто.");
      return;
    }

    this.clearEventDraftStates(userId);
    this.pendingProgramPollDrafts.set(userId, {
      eventId,
      step: 0,
      data: {},
      status: "collecting"
    });

    await this.answerCallbackQuerySafely(callbackQuery.id, "Создаем программу с опросом.");
    await this.telegram.sendMessage(
      callbackQuery.message.chat.id,
      [
        `Создаём программу с опросом для мероприятия «${event.title}».`,
        "",
        "Таких программ у одного мероприятия может быть несколько."
      ].join("\n")
    );
    await this.sendCurrentProgramPollPrompt(callbackQuery.message.chat.id, userId);
  }

  async sendCurrentProgramPollPrompt(chatId, userId) {
    const state = this.pendingProgramPollDrafts.get(String(userId));
    if (!state) return;

    const field = PROGRAM_POLL_FIELDS[state.step];
    await this.telegram.sendMessage(chatId, [
      `${state.step + 1}/${PROGRAM_POLL_FIELDS.length}. ${field.label}`,
      "",
      field.prompt,
      "",
      "Чтобы отменить создание, отправьте /cancel."
    ].join("\n"));
  }

  async handlePendingProgramPollMessage(message) {
    const userId = String(message.from?.id || "");
    const state = this.pendingProgramPollDrafts.get(userId);
    if (!state || message.chat.type !== "private") return false;

    const text = String(message.text || "").trim();
    const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
    if (!text && !hasPhoto) return false;

    if (text === "/cancel") {
      this.pendingProgramPollDrafts.delete(userId);
      await this.telegram.sendMessage(message.chat.id, "Ок, создание программы отменено.");
      await this.sendAdminPanel(message.chat.id);
      return true;
    }

    if (text.startsWith("/")) return false;

    if (state.status === "confirm") {
      await this.telegram.sendMessage(message.chat.id, "Черновик уже готов. Нажмите кнопку под предпросмотром.");
      return true;
    }

    const field = PROGRAM_POLL_FIELDS[state.step];
    if (hasPhoto && field.key !== "photo_file_id") {
      await this.telegram.sendMessage(message.chat.id, "На этом шаге нужен текст. Фото можно отправить на шаге «Фото».");
      return true;
    }

    if (field.key === "title") {
      const title = normalizeProfileText(text);
      if (!title) {
        await this.telegram.sendMessage(message.chat.id, "Заголовок нужно заполнить.");
        return true;
      }
      state.data.title = title;
    }

    if (field.key === "message") {
      const messageText = normalizeOptionalEventValue(text);
      if (!messageText) {
        await this.telegram.sendMessage(message.chat.id, "Текст для участников нужно заполнить.");
        return true;
      }
      state.data.message = messageText;
    }

    if (field.key === "options") {
      const options = parseProgramOptions(text);
      if (options.length < 2) {
        await this.telegram.sendMessage(message.chat.id, "Нужно минимум два варианта ответа, каждый с новой строки.");
        return true;
      }
      state.data.options = options;
    }

    if (field.key === "photo_file_id") {
      if (hasPhoto) {
        const bestPhoto = [...message.photo].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
        state.data.photo_file_id = bestPhoto.file_id;
      } else if (text === "-") {
        state.data.photo_file_id = "";
      } else {
        await this.telegram.sendMessage(message.chat.id, "На этом шаге отправьте фото или - чтобы пропустить.");
        return true;
      }
    }

    state.step += 1;
    if (state.step < PROGRAM_POLL_FIELDS.length) {
      await this.sendCurrentProgramPollPrompt(message.chat.id, userId);
      return true;
    }

    const event = await this.store.getEvent(state.eventId);
    if (!event) {
      this.pendingProgramPollDrafts.delete(userId);
      await this.telegram.sendMessage(message.chat.id, "Мероприятие уже закрыто или не найдено.");
      return true;
    }

    const targetCount = (await this.store.listProgramRecipients(state.eventId)).length;
    state.status = "confirm";
    await this.telegram.sendMessage(message.chat.id, programPollDraftSummary({
      event,
      draft: state.data,
      targetCount
    }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Отправить на согласование Роману", callback_data: "program:submit" }],
          [{ text: "Заполнить заново", callback_data: "program:restart" }],
          [{ text: "Отменить", callback_data: "program:cancel" }]
        ]
      }
    });
    return true;
  }

  async startEventCommentFlow(callbackQuery, eventId) {
    const userId = String(callbackQuery.from?.id || "");
    if (!eventId) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено.");
      return;
    }

    const event = await this.store.getEvent(eventId);
    if (!event) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено или закрыто.");
      return;
    }

    this.clearEventDraftStates(userId);
    this.pendingEventCommentDrafts.set(userId, {
      eventId,
      step: 0,
      data: {},
      status: "collecting"
    });

    await this.answerCallbackQuerySafely(callbackQuery.id, "Готовим комментарий.");
    await this.telegram.sendMessage(
      callbackQuery.message.chat.id,
      `Готовим комментарий участникам мероприятия «${event.title}».`
    );
    await this.sendCurrentEventCommentPrompt(callbackQuery.message.chat.id, userId);
  }

  async sendCurrentEventCommentPrompt(chatId, userId) {
    const state = this.pendingEventCommentDrafts.get(String(userId));
    if (!state) return;

    const field = EVENT_COMMENT_FIELDS[state.step];
    await this.telegram.sendMessage(chatId, [
      `${state.step + 1}/${EVENT_COMMENT_FIELDS.length}. ${field.label}`,
      "",
      field.prompt,
      "",
      "Чтобы отменить создание, отправьте /cancel."
    ].join("\n"));
  }

  async handlePendingEventCommentMessage(message) {
    const userId = String(message.from?.id || "");
    const state = this.pendingEventCommentDrafts.get(userId);
    if (!state || message.chat.type !== "private") return false;

    const text = String(message.text || "").trim();
    const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
    if (!text && !hasPhoto) return false;

    if (text === "/cancel") {
      this.pendingEventCommentDrafts.delete(userId);
      await this.telegram.sendMessage(message.chat.id, "Ок, комментарий отменен.");
      await this.sendAdminPanel(message.chat.id);
      return true;
    }

    if (text.startsWith("/")) return false;

    if (state.status === "confirm") {
      await this.telegram.sendMessage(message.chat.id, "Черновик уже готов. Нажмите кнопку под предпросмотром.");
      return true;
    }

    const field = EVENT_COMMENT_FIELDS[state.step];
    if (hasPhoto && field.key !== "photo_file_id") {
      await this.telegram.sendMessage(message.chat.id, "На этом шаге нужен текст. Фото можно отправить на шаге «Фото».");
      return true;
    }

    if (field.key === "message") {
      const messageText = normalizeOptionalEventValue(text);
      if (!messageText) {
        await this.telegram.sendMessage(message.chat.id, "Комментарий нужно заполнить.");
        return true;
      }
      state.data.message = messageText;
    }

    if (field.key === "photo_file_id") {
      if (hasPhoto) {
        const bestPhoto = [...message.photo].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
        state.data.photo_file_id = bestPhoto.file_id;
      } else if (text === "-") {
        state.data.photo_file_id = "";
      } else {
        await this.telegram.sendMessage(message.chat.id, "На этом шаге отправьте фото или - чтобы пропустить.");
        return true;
      }
    }

    state.step += 1;
    if (state.step < EVENT_COMMENT_FIELDS.length) {
      await this.sendCurrentEventCommentPrompt(message.chat.id, userId);
      return true;
    }

    const event = await this.store.getEvent(state.eventId);
    if (!event) {
      this.pendingEventCommentDrafts.delete(userId);
      await this.telegram.sendMessage(message.chat.id, "Мероприятие уже закрыто или не найдено.");
      return true;
    }

    const targetCount = (await this.store.listProgramRecipients(state.eventId)).length;
    state.status = "confirm";
    await this.telegram.sendMessage(message.chat.id, eventCommentDraftSummary({
      event,
      draft: state.data,
      targetCount
    }), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Отправить на согласование Роману", callback_data: "comment:submit" }],
          [{ text: "Заполнить заново", callback_data: "comment:restart" }],
          [{ text: "Отменить", callback_data: "comment:cancel" }]
        ]
      }
    });
    return true;
  }

  async startExistingEventPhotoFlow(callbackQuery, eventId) {
    const userId = String(callbackQuery.from?.id || "");
    if (!eventId) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено.");
      return;
    }

    const event = await this.store.getEvent(eventId);
    if (!event) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено или закрыто.");
      return;
    }

    this.clearEventDraftStates(userId);
    this.pendingEventPhotos.set(userId, { eventId });
    await this.answerCallbackQuerySafely(callbackQuery.id, "Жду фото.");
    await this.telegram.sendMessage(
      callbackQuery.message.chat.id,
      [
        `Отправьте фото для мероприятия «${event.title}».`,
        "",
        "Оно добавится к этой же ссылке и не сбросит уже собранные ответы.",
        "Чтобы отменить, отправьте /cancel."
      ].join("\n")
    );
  }

  async handlePendingEventPhoto(message) {
    const userId = String(message.from?.id || "");
    const state = this.pendingEventPhotos.get(userId);
    if (!state || message.chat.type !== "private") return false;

    const text = String(message.text || "").trim();
    if (text === "/cancel") {
      this.pendingEventPhotos.delete(userId);
      await this.telegram.sendMessage(message.chat.id, "Ок, добавление фото отменено.");
      await this.sendAdminPanel(message.chat.id);
      return true;
    }

    const hasPhoto = Array.isArray(message.photo) && message.photo.length > 0;
    if (!hasPhoto) {
      await this.telegram.sendMessage(message.chat.id, "Отправьте именно фото, не файл. Или /cancel для отмены.");
      return true;
    }

    const bestPhoto = [...message.photo].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))[0];
    await this.store.updateEvent(state.eventId, {
      photo_file_id: bestPhoto.file_id
    });
    this.pendingEventPhotos.delete(userId);

    await this.telegram.sendMessage(
      message.chat.id,
      [
        "✅ Фото добавлено к мероприятию.",
        "",
        "Ссылка осталась прежней:",
        eventShareLink(this.config.botUsername, state.eventId)
      ].join("\n")
    );
    await this.sendAdminPanel(message.chat.id);
    return true;
  }

  async startExistingEventDescriptionFlow(callbackQuery, eventId) {
    const userId = String(callbackQuery.from?.id || "");
    if (!eventId) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено.");
      return;
    }

    const event = await this.store.getEvent(eventId);
    if (!event) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Мероприятие не найдено или закрыто.");
      return;
    }

    this.clearEventDraftStates(userId);
    this.pendingEventDescriptions.set(userId, { eventId });
    await this.answerCallbackQuerySafely(callbackQuery.id, "Жду описание.");
    await this.telegram.sendMessage(
      callbackQuery.message.chat.id,
      [
        `Отправьте новое описание для мероприятия «${event.title}».`,
        "",
        "Если описание нужно убрать, отправьте -.",
        "Ссылка и уже собранные ответы сохранятся.",
        "Чтобы отменить, отправьте /cancel."
      ].join("\n")
    );
  }

  async handlePendingEventDescription(message) {
    const userId = String(message.from?.id || "");
    const state = this.pendingEventDescriptions.get(userId);
    if (!state || message.chat.type !== "private") return false;

    const text = String(message.text || "").trim();
    if (text === "/cancel") {
      this.pendingEventDescriptions.delete(userId);
      await this.telegram.sendMessage(message.chat.id, "Ок, изменение описания отменено.");
      await this.sendAdminPanel(message.chat.id);
      return true;
    }

    if (!text) {
      await this.telegram.sendMessage(message.chat.id, "Отправьте текст описания или - чтобы очистить описание.");
      return true;
    }

    await this.store.updateEvent(state.eventId, {
      description: normalizeOptionalEventValue(text)
    });
    this.pendingEventDescriptions.delete(userId);

    await this.telegram.sendMessage(
      message.chat.id,
      [
        "✅ Описание обновлено.",
        "",
        "Ссылка осталась прежней:",
        eventShareLink(this.config.botUsername, state.eventId)
      ].join("\n")
    );
    await this.sendAdminPanel(message.chat.id);
    return true;
  }

  async requestEventPublicationApproval(eventId, requestedBy) {
    const event = await this.store.getEvent(eventId);
    if (!event) {
      throw new Error(`Event not found or closed: ${eventId}`);
    }

    if (eventIsPublishedToGroup(event)) {
      return {
        eventId,
        alreadyPublished: true
      };
    }

    const approverChatId = this.config.birthdayApproverChatId;
    if (!approverChatId) {
      throw new Error("BIRTHDAY_APPROVER_CHAT_ID or SUPERADMIN_USER_ID is not configured");
    }

    await this.telegram.sendMessage(approverChatId, eventApprovalText(event, requestedBy), {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Утвердить и опубликовать", callback_data: `event:approve_publish:${eventId}` }],
          [{ text: "Отклонить", callback_data: `event:reject_publish:${eventId}` }]
        ]
      }
    });

    return {
      eventId,
      alreadyPublished: false
    };
  }

  async handleEventPublicationApprovalCallback(callbackQuery, action, eventId) {
    if (!this.isBirthdayApprover(callbackQuery.from?.id)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Подтверждать публикацию может только Роман.");
      return;
    }

    this.clearCallbackKeyboard(callbackQuery);

    if (action === "reject_publish") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Публикация отклонена.");
      await this.telegram.sendMessage(callbackQuery.message.chat.id, `Ок, публикация мероприятия ${eventId} отклонена.`);
      return;
    }

    await this.answerCallbackQuerySafely(callbackQuery.id, "Публикую мероприятие.");
    try {
      const result = await this.publishExistingEventToGroup(eventId);
      await this.telegram.sendMessage(
        callbackQuery.message.chat.id,
        result.alreadyPublished
          ? "Это мероприятие уже было опубликовано."
          : `✅ Мероприятие опубликовано. event_id: ${result.eventId}`
      );
    } catch (error) {
      this.logger.error("[event_publish_approval]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось опубликовать мероприятие. Ошибка уже в логах.");
    }
  }

  async publishExistingEventToGroup(eventId) {
    const event = await this.store.getEvent(eventId);
    if (!event) {
      throw new Error(`Event not found or closed: ${eventId}`);
    }

    if (eventIsPublishedToGroup(event)) {
      return {
        eventId,
        messageId: event.message_id,
        alreadyPublished: true
      };
    }

    const targetChatId = eventIsForLeaders(event)
      ? this.config.leadersGroupChatId
      : this.config.groupChatId;
    if (!targetChatId) {
      throw new Error(eventIsForLeaders(event)
        ? "LEADERS_GROUP_CHAT_ID is not configured"
        : "GROUP_CHAT_ID is not configured");
    }

    const sent = await this.sendEventMessage(targetChatId, event);
    await this.store.updateEvent(eventId, {
      group_chat_id: targetChatId,
      message_id: sent.message_id
    });

    return {
      eventId,
      messageId: sent.message_id,
      alreadyPublished: false
    };
  }

  startProfileForm(userId, options = {}) {
    this.pendingUserProfiles.set(String(userId), {
      step: 0,
      data: {},
      status: "collecting",
      linkedEventId: options.linkedEventId || ""
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
      await this.telegram.sendMessage(message.chat.id, "Не получилось распознать дату. Отправьте дату в формате ДД.ММ.ГГГГ, например: 22.03.1996");
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
      this.startProfileForm(userId, { linkedEventId: state?.linkedEventId || this.pendingLinkedEvents.get(userId) || "" });
      this.clearCallbackKeyboard(callbackQuery);
      await this.answerCallbackQuerySafely(callbackQuery.id, "Заполняем заново.");
      await this.sendCurrentProfilePrompt(callbackQuery.message.chat.id, userId);
      return;
    }

    if (action !== "submit") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Неизвестное действие.");
      return;
    }

    if (!state || state.status !== "confirm") {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Анкета не найдена. Нажмите /start и заполните заново.");
      return;
    }

    const missing = ["birth_date", "last_name", "first_name", "church"]
      .filter((key) => !state.data[key]);
    if (missing.length) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "В анкете не хватает данных. Заполните заново.");
      return;
    }

    await this.answerCallbackQuerySafely(callbackQuery.id, "Сохраняю анкету.");
    this.clearCallbackKeyboard(callbackQuery);

    try {
      const user = await this.store.updateUserProfile({
        telegramUser: callbackQuery.from,
        privateChatId: String(callbackQuery.message.chat.id),
        profile: state.data
      });
      if (typeof this.store.refreshRegistrationsForUser === "function") {
        await this.store.refreshRegistrationsForUser(user);
      }
      const linkedEventId = state.linkedEventId || this.pendingLinkedEvents.get(userId);
      this.pendingUserProfiles.delete(userId);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Спасибо! Твои данные сохранены");
      if (linkedEventId) {
        this.pendingLinkedEvents.delete(userId);
        await this.telegram.sendMessage(callbackQuery.message.chat.id, "Теперь выбери вариант регистрации:");
        await this.sendEventRegistrationToPrivateChat(callbackQuery.message.chat.id, linkedEventId, { user });
      } else {
        await this.telegram.sendMessage(
          callbackQuery.message.chat.id,
          "Чтобы посмотреть открытые регистрации, нажми «Актуальные мероприятия».",
          { reply_markup: this.canManageEvents(callbackQuery.from.id)
            ? adminReplyKeyboard({ showWeeklyService: this.isWeeklyServiceCoordinator(callbackQuery.from.id) })
            : userReplyKeyboard() }
        );
      }
    } catch (error) {
      this.logger.error("[profile_submit]", error);
      await this.telegram.sendMessage(callbackQuery.message.chat.id, "Не удалось сохранить анкету. Администратор уже увидит ошибку в логах.");
    }
  }

  async handleBirthdayCallback(callbackQuery) {
    const [, action, dateKey, telegramUserId] = String(callbackQuery.data || "").split(":");

    if (!this.isBirthdayApprover(callbackQuery.from.id)) {
      await this.answerCallbackQuerySafely(callbackQuery.id, "Подтверждать поздравления может только суперадмин.");
      return;
    }

    try {
      if (action === "approve") {
        await this.answerCallbackQuerySafely(callbackQuery.id, "✅ Принято. Отправляю поздравление.");
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
        await this.answerCallbackQuerySafely(callbackQuery.id, "Поздравление отклонено.");
        return;
      }

      if (action === "edit") {
        const log = await this.store.getBirthdayLog(dateKey, telegramUserId);
        if (String(log?.approval_status || "") === "sent") {
          await this.answerCallbackQuerySafely(callbackQuery.id, "Поздравление уже отправлено.");
          return;
        }

        this.pendingBirthdayEdits.set(String(callbackQuery.from.id), { dateKey, telegramUserId });
        this.clearCallbackKeyboard(callbackQuery);
        await this.answerCallbackQuerySafely(callbackQuery.id, "Жду отредактированный текст в личном сообщении.");
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

      await this.answerCallbackQuerySafely(callbackQuery.id, "Неизвестное действие.");
    } catch (error) {
      this.logger.error("[birthday_callback]", error);
      await this.answerCallbackQuerySafely(callbackQuery.id, "Не удалось обработать поздравление. Ошибка уже в логах.");
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
