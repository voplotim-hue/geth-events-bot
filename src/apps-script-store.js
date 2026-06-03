import { isoNow, parseBirthday } from "./time.js";
import { normalizeBlessingTemplates } from "./blessings.js";

const USER_COLUMNS = [
  "telegram_user_id",
  "username",
  "last_name",
  "first_name",
  "middle_name",
  "birth_date",
  "church",
  "gender",
  "parent_consent",
  "medical_certificate",
  "private_chat_id",
  "is_active",
  "notes",
  "updated_at"
];

const EVENT_COLUMNS = [
  "event_id",
  "title",
  "dates",
  "description",
  "options",
  "status",
  "group_chat_id",
  "message_id",
  "created_at",
  "updated_at"
];

const REGISTRATION_COLUMNS = [
  "event_id",
  "event_title",
  "telegram_user_id",
  "username",
  "full_name",
  "answer",
  "previous_answer",
  "change_note",
  "answered_at",
  "source_message_id",
  "updated_at"
];

const EVENT_ROSTER_COLUMNS = [
  "event_id",
  "ФИ",
  "Сдал",
  "Церковь",
  "Дата рождения",
  "примечание",
  "Пол",
  "Согласие родителей",
  "Справка",
  "Ответ",
  "Статус решения",
  "username",
  "telegram_user_id",
  "answered_at"
];

const BIRTHDAY_LOG_COLUMNS = [
  "date",
  "telegram_user_id",
  "username",
  "full_name",
  "birthday_message",
  "approval_status",
  "private_sent",
  "group_sent",
  "approved_by",
  "approved_at",
  "sent_at",
  "notes"
];

const BIRTHDAY_TEMPLATE_COLUMNS = [
  "reference",
  "verse",
  "wish",
  "is_active"
];

export const APPS_SCRIPT_DISPLAY_HEADERS = {
  users: [
    "Telegram ID",
    "Username",
    "Фамилия",
    "Имя",
    "Отчество",
    "Дата рождения",
    "Церковь",
    "Пол",
    "Согласие родителей",
    "Справка",
    "ID личного чата",
    "Активен",
    "Заметки",
    "Обновлено"
  ],
  events: [
    "ID мероприятия",
    "Название",
    "Даты",
    "Описание",
    "Варианты ответа",
    "Статус",
    "ID группы",
    "ID сообщения",
    "Создано",
    "Обновлено"
  ],
  registrations: [
    "ID мероприятия",
    "Мероприятие",
    "Telegram ID",
    "Username",
    "ФИО",
    "Ответ",
    "Предыдущий ответ",
    "Пометка изменения",
    "Время ответа",
    "ID сообщения",
    "Обновлено"
  ],
  eventRoster: [
    "ID мероприятия",
    "ФИ",
    "Сдал",
    "Церковь",
    "Дата рождения",
    "Примечание",
    "Пол",
    "Согласие родителей",
    "Справка",
    "Ответ",
    "Статус решения",
    "Username",
    "Telegram ID",
    "Время ответа"
  ],
  birthdayLog: [
    "Дата",
    "Telegram ID",
    "Username",
    "ФИО",
    "Текст поздравления",
    "Статус согласования",
    "Отправлено в ЛС",
    "Отправлено в группу",
    "Согласовал",
    "Время согласования",
    "Время отправки",
    "Заметки"
  ],
  birthdayTemplates: [
    "Место Писания",
    "Стих",
    "Пожелание",
    "Активен"
  ]
};

const COLUMN_ALIASES = {
  users: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.users.map((header, index) => [header, USER_COLUMNS[index]])),
  events: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.events.map((header, index) => [header, EVENT_COLUMNS[index]])),
  registrations: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.registrations.map((header, index) => [header, REGISTRATION_COLUMNS[index]])),
  eventRoster: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.eventRoster.map((header, index) => [header, EVENT_ROSTER_COLUMNS[index]])),
  birthdayLog: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.birthdayLog.map((header, index) => [header, BIRTHDAY_LOG_COLUMNS[index]])),
  birthdayTemplates: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.birthdayTemplates.map((header, index) => [header, BIRTHDAY_TEMPLATE_COLUMNS[index]]))
};

function normalizeUserId(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\.0$/, "").trim();
}

function sheetKey(config, sheetName) {
  return Object.entries(config.sheets || {}).find(([, configuredName]) => configuredName === sheetName)?.[0] || "";
}

function normalizeTableHeaders(config, sheetName, table) {
  const key = sheetKey(config, sheetName);
  const aliases = COLUMN_ALIASES[key];
  if (!aliases) return table;

  const rows = (table.rows || []).map((row) => {
    const next = { _rowNumber: row._rowNumber };
    for (const [header, value] of Object.entries(row)) {
      if (header === "_rowNumber") continue;
      next[aliases[header] || header] = value;
    }
    return next;
  });

  const headers = (table.headers || []).map((header) => aliases[header] || header);
  return { ...table, headers, rows };
}

export function fullName(row) {
  return [row.last_name, row.first_name, row.middle_name]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ");
}

export class AppsScriptStore {
  constructor(config) {
    this.config = config;
  }

  get enabled() {
    return Boolean(this.config.enabled);
  }

  async request(action, payload = {}) {
    const response = await fetch(this.config.url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: this.config.secret,
        action,
        ...payload
      })
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok || data?.ok === false) {
      throw new Error(`Apps Script ${action} failed: ${data?.error || response.statusText}`);
    }

    return data?.result;
  }

  async readTable(sheetName) {
    const table = await this.request("readTable", { sheetName });
    return normalizeTableHeaders(this.config, sheetName, table);
  }

  appendRow(sheetName, values) {
    return this.request("appendRow", { sheetName, values });
  }

  updateSheetRow(sheetName, rowNumber, values) {
    return this.request("updateRow", { sheetName, rowNumber, values });
  }

  valuesFor(columns, row) {
    return columns.map((column) => row[column] ?? "");
  }

  async ensureUserFromTelegram(user, privateChatId = "") {
    const sheetName = this.config.sheets.users;
    const { rows } = await this.readTable(sheetName);
    const telegramUserId = normalizeUserId(user.id);
    const existing = rows.find((row) => normalizeUserId(row.telegram_user_id) === telegramUserId);

    if (existing) {
      const next = {
        ...existing,
        telegram_user_id: telegramUserId,
        username: user.username || existing.username || "",
        private_chat_id: privateChatId || existing.private_chat_id || "",
        is_active: existing.is_active || "yes",
        updated_at: isoNow()
      };
      await this.updateSheetRow(sheetName, existing._rowNumber, this.valuesFor(USER_COLUMNS, next));
      return next;
    }

    const row = {
      telegram_user_id: telegramUserId,
      username: user.username || "",
      last_name: user.last_name || "",
      first_name: user.first_name || "",
      middle_name: "",
      birth_date: "",
      church: "",
      gender: "",
      parent_consent: "",
      medical_certificate: "",
      private_chat_id: privateChatId,
      is_active: "yes",
      notes: "created by bot",
      updated_at: isoNow()
    };
    await this.appendRow(sheetName, this.valuesFor(USER_COLUMNS, row));
    return row;
  }

  async getUserByTelegramId(telegramUserId) {
    const sheetName = this.config.sheets.users;
    const { rows } = await this.readTable(sheetName);
    return rows.find((row) => normalizeUserId(row.telegram_user_id) === normalizeUserId(telegramUserId));
  }

  async updateUserProfile({ telegramUser, privateChatId = "", profile }) {
    const sheetName = this.config.sheets.users;
    const user = await this.ensureUserFromTelegram(telegramUser, privateChatId);
    const next = {
      ...user,
      telegram_user_id: normalizeUserId(telegramUser.id || user.telegram_user_id),
      username: telegramUser.username || user.username || "",
      last_name: profile.last_name,
      first_name: profile.first_name,
      middle_name: profile.middle_name,
      birth_date: profile.birth_date,
      church: profile.church,
      private_chat_id: privateChatId || user.private_chat_id || "",
      is_active: user.is_active || "yes",
      notes: user.notes || "updated by profile form",
      updated_at: isoNow()
    };

    await this.updateSheetRow(sheetName, user._rowNumber, this.valuesFor(USER_COLUMNS, next));
    return next;
  }

  async createEvent(event) {
    const sheetName = this.config.sheets.events;
    const row = {
      event_id: event.eventId,
      title: event.title,
      dates: event.dates,
      description: event.description,
      options: event.options.join("|"),
      status: "active",
      group_chat_id: event.groupChatId,
      message_id: event.messageId,
      created_at: isoNow(),
      updated_at: isoNow()
    };
    await this.appendRow(sheetName, this.valuesFor(EVENT_COLUMNS, row));
    return row;
  }

  async getEvent(eventId) {
    const sheetName = this.config.sheets.events;
    const { rows } = await this.readTable(sheetName);
    return rows.find((row) => String(row.event_id) === String(eventId) && String(row.status || "active") !== "closed");
  }

  async upsertRegistration({ event, telegramUser, answer, sourceMessageId }) {
    const user = await this.ensureUserFromTelegram(telegramUser);
    const sheetName = this.config.sheets.registrations;
    const { rows } = await this.readTable(sheetName);
    const telegramUserId = normalizeUserId(telegramUser.id);
    const existing = rows.find((row) => {
      return String(row.event_id) === String(event.event_id)
        && normalizeUserId(row.telegram_user_id) === telegramUserId;
    });
    const previousAnswer = String(existing?.answer || "").trim();
    const decisionChanged = Boolean(previousAnswer && previousAnswer !== String(answer).trim());
    const changeNote = decisionChanged ? "изменил решение" : "";

    const row = {
      event_id: event.event_id,
      event_title: event.title,
      telegram_user_id: telegramUserId,
      username: telegramUser.username || user.username || "",
      full_name: fullName(user),
      answer,
      previous_answer: decisionChanged ? previousAnswer : "",
      change_note: changeNote,
      answered_at: isoNow(),
      source_message_id: sourceMessageId,
      updated_at: isoNow()
    };

    if (existing) {
      await this.updateSheetRow(sheetName, existing._rowNumber, this.valuesFor(REGISTRATION_COLUMNS, row));
    } else {
      await this.appendRow(sheetName, this.valuesFor(REGISTRATION_COLUMNS, row));
    }

    await this.upsertEventRoster({ event, user, registration: row, decisionChanged });
    return row;
  }

  async upsertEventRoster({ event, user, registration, decisionChanged = false }) {
    const sheetName = this.config.sheets.eventRoster;
    const { rows } = await this.readTable(sheetName);
    const telegramUserId = normalizeUserId(registration.telegram_user_id);
    const existing = rows.find((row) => {
      return String(row.event_id) === String(event.event_id)
        && normalizeUserId(row.telegram_user_id) === telegramUserId;
    });

    const rosterRow = {
      event_id: event.event_id,
      "ФИ": registration.full_name || fullName(user) || registration.username,
      "Сдал": "",
      "Церковь": user.church || "",
      "Дата рождения": user.birth_date || "",
      "примечание": user.notes || "",
      "Пол": user.gender || "",
      "Согласие родителей": user.parent_consent || "",
      "Справка": user.medical_certificate || "",
      "Ответ": registration.answer,
      "Статус решения": decisionChanged ? "изменил решение" : "",
      username: registration.username,
      telegram_user_id: telegramUserId,
      answered_at: registration.answered_at
    };

    if (existing) {
      await this.updateSheetRow(sheetName, existing._rowNumber, this.valuesFor(EVENT_ROSTER_COLUMNS, rosterRow));
    } else {
      await this.appendRow(sheetName, this.valuesFor(EVENT_ROSTER_COLUMNS, rosterRow));
    }
  }

  async birthdaysFor(month, day) {
    const sheetName = this.config.sheets.users;
    const { rows } = await this.readTable(sheetName);
    return rows.filter((row) => {
      const active = String(row.is_active || "yes").toLowerCase();
      if (["no", "false", "0", "нет"].includes(active)) return false;
      const birthday = parseBirthday(row.birth_date);
      return birthday?.month === month && birthday?.day === day;
    });
  }

  async wasBirthdayLogged(dateKey, telegramUserId) {
    return Boolean(await this.getBirthdayLog(dateKey, telegramUserId));
  }

  async getBirthdayLog(dateKey, telegramUserId) {
    const sheetName = this.config.sheets.birthdayLog;
    const { rows } = await this.readTable(sheetName);
    return rows.find((row) => {
      return String(row.date) === dateKey
        && normalizeUserId(row.telegram_user_id) === normalizeUserId(telegramUserId);
    });
  }

  async upsertBirthdayDraft({ dateKey, user, message, notes }) {
    const sheetName = this.config.sheets.birthdayLog;
    const existing = await this.getBirthdayLog(dateKey, user.telegram_user_id);
    const row = {
      date: dateKey,
      telegram_user_id: normalizeUserId(user.telegram_user_id),
      username: user.username || "",
      full_name: fullName(user),
      birthday_message: message,
      approval_status: "pending",
      private_sent: "no",
      group_sent: "no",
      approved_by: "",
      approved_at: "",
      sent_at: "",
      notes: notes || ""
    };

    if (existing) {
      const next = { ...existing, ...row };
      await this.updateSheetRow(sheetName, existing._rowNumber, this.valuesFor(BIRTHDAY_LOG_COLUMNS, next));
      return next;
    }

    await this.appendRow(sheetName, this.valuesFor(BIRTHDAY_LOG_COLUMNS, row));
    return row;
  }

  async updateBirthdayLog({ dateKey, telegramUserId, patch }) {
    const sheetName = this.config.sheets.birthdayLog;
    const existing = await this.getBirthdayLog(dateKey, telegramUserId);
    if (!existing) {
      throw new Error(`Birthday log not found for ${dateKey}/${telegramUserId}`);
    }

    const next = { ...existing, ...patch };
    await this.updateSheetRow(sheetName, existing._rowNumber, this.valuesFor(BIRTHDAY_LOG_COLUMNS, next));
    return next;
  }

  async birthdayTemplates() {
    const sheetName = this.config.sheets.birthdayTemplates;
    const { rows } = await this.readTable(sheetName);
    return normalizeBlessingTemplates(rows);
  }
}
