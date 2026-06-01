import crypto from "node:crypto";
import fs from "node:fs";
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

function base64Url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function normalizeUserId(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\.0$/, "").trim();
}

function serviceAccountFromConfig(config) {
  if (config.keyFile) {
    const data = JSON.parse(fs.readFileSync(config.keyFile, "utf8"));
    return {
      email: data.client_email,
      privateKey: data.private_key
    };
  }

  return {
    email: config.serviceAccountEmail,
    privateKey: String(config.privateKey || "").replace(/\\n/g, "\n")
  };
}

export function fullName(row) {
  return [row.last_name, row.first_name, row.middle_name]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ");
}

export class GoogleSheetsStore {
  constructor(config) {
    this.config = config;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  get enabled() {
    return Boolean(this.config.enabled);
  }

  async getToken() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiresAt - 60_000) {
      return this.token;
    }

    const account = serviceAccountFromConfig(this.config);
    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;
    const header = { alg: "RS256", typ: "JWT" };
    const claim = {
      iss: account.email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      exp,
      iat
    };
    const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(unsigned)
      .sign(account.privateKey);
    const assertion = `${unsigned}.${base64Url(signature)}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(`Google token request failed: ${data?.error_description || data?.error || response.statusText}`);
    }

    this.token = data.access_token;
    this.tokenExpiresAt = now + Number(data.expires_in || 3600) * 1000;
    return this.token;
  }

  async sheets(path, { method = "GET", body } = {}) {
    const token = await this.getToken();
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message = data?.error?.message || response.statusText;
      throw new Error(`Google Sheets ${method} ${path} failed: ${message}`);
    }

    return data;
  }

  async readTable(sheetName) {
    const range = encodeURIComponent(`${sheetName}!A:Z`);
    const data = await this.sheets(`/values/${range}?majorDimension=ROWS`);
    const values = data.values || [];
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

  async appendRow(sheetName, values) {
    const lastColumn = colName(values.length - 1);
    const range = encodeURIComponent(`${sheetName}!A:${lastColumn}`);
    return this.sheets(`/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: { values: [values] }
    });
  }

  async updateSheetRow(sheetName, rowNumber, values) {
    const lastColumn = colName(values.length - 1);
    const range = encodeURIComponent(`${sheetName}!A${rowNumber}:${lastColumn}${rowNumber}`);
    return this.sheets(`/values/${range}?valueInputOption=RAW`, {
      method: "PUT",
      body: { values: [values] }
    });
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
