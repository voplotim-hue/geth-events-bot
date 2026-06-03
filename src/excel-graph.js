import { isoNow, parseBirthday } from "./time.js";
import { normalizeBlessingTemplates } from "./blessings.js";
import { isGuestRole, resolveProfileRole } from "./roles.js";

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
  "updated_at",
  "role"
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
  "answered_at",
  "role"
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

const TABLE_COLUMNS = {
  Users: USER_COLUMNS,
  Events: EVENT_COLUMNS,
  Registrations: REGISTRATION_COLUMNS,
  EventRoster: EVENT_ROSTER_COLUMNS,
  BirthdayLog: BIRTHDAY_LOG_COLUMNS,
  BirthdayTemplates: BIRTHDAY_TEMPLATE_COLUMNS
};

function colName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}

function encodeWorkbookPath(path) {
  return String(path)
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

function normalizeUserId(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\.0$/, "").trim();
}

export function fullName(row) {
  return [row.last_name, row.first_name, row.middle_name]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ");
}

export class ExcelStore {
  constructor(config) {
    this.config = config;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  get enabled() {
    return Boolean(this.config.enabled);
  }

  workbookRoot() {
    const drive = encodeURIComponent(this.config.driveId);
    if (this.config.itemId) {
      return `/drives/${drive}/items/${encodeURIComponent(this.config.itemId)}/workbook`;
    }

    return `/drives/${drive}/root:/${encodeWorkbookPath(this.config.workbookPath)}:/workbook`;
  }

  async getToken() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 60_000) {
      return this.token;
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default"
    });

    const response = await fetch(
      `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params
      }
    );

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Microsoft token request failed: ${data?.error_description || response.statusText}`);
    }

    this.token = data.access_token;
    this.tokenExpiresAt = now + Number(data.expires_in || 3600) * 1000;
    return this.token;
  }

  async graph(path, { method = "GET", body, headers = {} } = {}) {
    const token = await this.getToken();
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data?.error?.message || response.statusText;
      throw new Error(`Microsoft Graph ${method} ${path} failed: ${message}`);
    }

    return data;
  }

  async readTable(tableName) {
    const range = await this.graph(
      `${this.workbookRoot()}/tables/${encodeURIComponent(tableName)}/range`
    );
    const values = range.values || [];
    const headers = (values[0] || []).map((header) => String(header || "").trim());
    const rows = values.slice(1)
      .map((raw, index) => {
        const row = { _rowNumber: index + 2 };
        headers.forEach((header, columnIndex) => {
          row[header] = raw[columnIndex] ?? "";
        });
        return row;
      })
      .filter((row) => headers.some((header) => row[header] !== ""));

    return { headers, rows };
  }

  async appendRow(tableName, values) {
    return this.graph(
      `${this.workbookRoot()}/tables/${encodeURIComponent(tableName)}/rows/add`,
      {
        method: "POST",
        body: { values: [values] }
      }
    );
  }

  async updateSheetRow(sheetName, rowNumber, values) {
    const lastColumn = colName(values.length - 1);
    return this.graph(
      `${this.workbookRoot()}/worksheets/${encodeURIComponent(sheetName)}/range(address='A${rowNumber}:${lastColumn}${rowNumber}')`,
      {
        method: "PATCH",
        body: { values: [values] }
      }
    );
  }

  valuesFor(columns, row) {
    return columns.map((column) => row[column] ?? "");
  }

  async ensureUserFromTelegram(user, privateChatId = "") {
    const tableName = this.config.tables.users;
    const { rows } = await this.readTable(tableName);
    const telegramUserId = normalizeUserId(user.id);
    const existing = rows.find((row) => normalizeUserId(row.telegram_user_id) === telegramUserId);

    if (existing) {
      const next = {
        ...existing,
        telegram_user_id: telegramUserId,
        username: user.username || existing.username || "",
        private_chat_id: privateChatId || existing.private_chat_id || "",
        is_active: existing.is_active || "yes",
        role: existing.role || "Участник",
        updated_at: isoNow()
      };
      await this.updateSheetRow(tableName, existing._rowNumber, this.valuesFor(USER_COLUMNS, next));
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
      updated_at: isoNow(),
      role: "Участник"
    };
    await this.appendRow(tableName, this.valuesFor(USER_COLUMNS, row));
    return row;
  }

  async getUserByTelegramId(telegramUserId) {
    const tableName = this.config.tables.users;
    const { rows } = await this.readTable(tableName);
    return rows.find((row) => normalizeUserId(row.telegram_user_id) === normalizeUserId(telegramUserId));
  }

  async updateUserProfile({ telegramUser, privateChatId = "", profile }) {
    const tableName = this.config.tables.users;
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
      updated_at: isoNow(),
      role: resolveProfileRole(user, profile)
    };

    await this.updateSheetRow(tableName, user._rowNumber, this.valuesFor(USER_COLUMNS, next));
    return next;
  }

  async createEvent(event) {
    const tableName = this.config.tables.events;
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
    await this.appendRow(tableName, this.valuesFor(EVENT_COLUMNS, row));
    return row;
  }

  async getEvent(eventId) {
    const tableName = this.config.tables.events;
    const { rows } = await this.readTable(tableName);
    return rows.find((row) => String(row.event_id) === String(eventId) && String(row.status || "active") !== "closed");
  }

  async upsertRegistration({ event, telegramUser, answer, sourceMessageId }) {
    const user = await this.ensureUserFromTelegram(telegramUser);
    const tableName = this.config.tables.registrations;
    const { rows } = await this.readTable(tableName);
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
      await this.updateSheetRow(tableName, existing._rowNumber, this.valuesFor(REGISTRATION_COLUMNS, row));
    } else {
      await this.appendRow(tableName, this.valuesFor(REGISTRATION_COLUMNS, row));
    }

    await this.upsertEventRoster({ event, user, registration: row, decisionChanged });

    return row;
  }

  async upsertEventRoster({ event, user, registration, decisionChanged = false }) {
    const tableName = this.config.tables.eventRoster;
    const { rows } = await this.readTable(tableName);
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
      answered_at: registration.answered_at,
      role: user.role || ""
    };

    if (existing) {
      await this.updateSheetRow(tableName, existing._rowNumber, this.valuesFor(EVENT_ROSTER_COLUMNS, rosterRow));
    } else {
      await this.appendRow(tableName, this.valuesFor(EVENT_ROSTER_COLUMNS, rosterRow));
    }
  }

  async birthdaysFor(month, day) {
    const tableName = this.config.tables.users;
    const { rows } = await this.readTable(tableName);
    return rows.filter((row) => {
      const active = String(row.is_active || "yes").toLowerCase();
      if (["no", "false", "0", "нет"].includes(active)) return false;
      if (isGuestRole(row.role)) return false;
      const birthday = parseBirthday(row.birth_date);
      return birthday?.month === month && birthday?.day === day;
    });
  }

  async wasBirthdayLogged(dateKey, telegramUserId) {
    return Boolean(await this.getBirthdayLog(dateKey, telegramUserId));
  }

  async getBirthdayLog(dateKey, telegramUserId) {
    const tableName = this.config.tables.birthdayLog;
    const { rows } = await this.readTable(tableName);
    return rows.find((row) => {
      return String(row.date) === dateKey
        && normalizeUserId(row.telegram_user_id) === normalizeUserId(telegramUserId);
    });
  }

  async upsertBirthdayDraft({ dateKey, user, message, notes }) {
    const tableName = this.config.tables.birthdayLog;
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
      await this.updateSheetRow(tableName, existing._rowNumber, this.valuesFor(BIRTHDAY_LOG_COLUMNS, next));
      return next;
    }

    await this.appendRow(tableName, this.valuesFor(BIRTHDAY_LOG_COLUMNS, row));
    return row;
  }

  async updateBirthdayLog({ dateKey, telegramUserId, patch }) {
    const tableName = this.config.tables.birthdayLog;
    const existing = await this.getBirthdayLog(dateKey, telegramUserId);
    if (!existing) {
      throw new Error(`Birthday log not found for ${dateKey}/${telegramUserId}`);
    }

    const next = { ...existing, ...patch };
    await this.updateSheetRow(tableName, existing._rowNumber, this.valuesFor(BIRTHDAY_LOG_COLUMNS, next));
    return next;
  }

  async birthdayTemplates() {
    const tableName = this.config.tables.birthdayTemplates;
    const { rows } = await this.readTable(tableName);
    return normalizeBlessingTemplates(rows);
  }
}
