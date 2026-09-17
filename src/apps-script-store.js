import { formatBirthDate, isoNow, normalizeDateKey, parseBirthday } from "./time.js";
import { normalizeBlessingTemplates } from "./blessings.js";
import { isGuestRole, resolveProfileRole } from "./roles.js";
import {
  PASTORAL_NOTE_COLUMNS,
  WEEKLY_ATTENDANCE_COLUMNS,
  WEEKLY_ATTENDANCE_SHEET,
  WEEKLY_SERVICE_COLUMNS,
  WEEKLY_SERVICE_SHEET,
  weeklyAttendanceRow
} from "./weekly-service.js";

const USER_COLUMNS = [
  "telegram_user_id",
  "username",
  "last_name",
  "first_name",
  "middle_name",
  "role",
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
  "photo_file_id",
  "audience",
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
  "Оплата",
  "Комментарий",
  "Церковь",
  "Дата рождения",
  "примечание",
  "Пол",
  "Согласие родителей",
  "Ответ",
  "Статус решения",
  "username",
  "telegram_user_id",
  "answered_at",
  "role"
];

const PROGRAM_POLLS_SHEET_NAME = "ProgramPolls";
const PROGRAM_VOTES_SHEET_NAME = "Программа мероприятия";
const EVENT_BROADCASTS_SHEET_NAME = "EventBroadcasts";
const EVENT_ROSTER_SUMMARY_LABELS = new Set([
  "Сводка",
  "Всего людей",
  "Всего помощников",
  "Всего подростков",
  "Парней",
  "Девочек",
  "Лидеров мужчин",
  "Лидеров женщин",
  "Итоговая сумма"
]);
const APPS_SCRIPT_MAX_ATTEMPTS = 4;
const APPS_SCRIPT_RETRY_BASE_MS = 750;
const APPS_SCRIPT_TIMEOUT_MS = 20000;

const PROGRAM_POLL_COLUMNS = [
  "program_id",
  "event_id",
  "event_title",
  "title",
  "message",
  "options",
  "photo_file_id",
  "status",
  "created_by",
  "created_at",
  "approved_by",
  "approved_at",
  "target_count",
  "sent_count",
  "failed_count",
  "notes"
];

const PROGRAM_VOTE_COLUMNS = [
  "full_name",
  "event_title",
  "program_title",
  "registration_answer",
  "selected_option",
  "previous_option",
  "change_note",
  "answered_at",
  "church",
  "program_id",
  "event_id",
  "telegram_user_id",
  "username",
  "role"
];

const EVENT_BROADCAST_COLUMNS = [
  "broadcast_id",
  "event_id",
  "event_title",
  "type",
  "message",
  "photo_file_id",
  "status",
  "created_by",
  "created_at",
  "approved_by",
  "approved_at",
  "target_count",
  "sent_count",
  "failed_count",
  "notes"
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

const WEEKLY_SERVICE_COLUMN_ALIASES = Object.fromEntries([
  ["ID служения", "service_id"],
  ["Дата", "service_date"],
  ["Статус", "status"],
  ["ID сообщения лидеров", "leader_message_id"],
  ["ID сообщения подростков", "teenager_message_id"],
  ["Создано", "created_at"],
  ["Отменено", "cancelled_at"],
  ["Распределено", "assigned_at"]
]);

const WEEKLY_ATTENDANCE_COLUMN_ALIASES = Object.fromEntries([
  ["ID служения", "service_id"],
  ["Дата", "service_date"],
  ["Telegram ID", "telegram_user_id"],
  ["ФИО", "full_name"],
  ["Username", "username"],
  ["Роль", "role"],
  ["Группа", "group"],
  ["Ответ на опрос", "poll_answer"],
  ["Фактически присутствует", "actual_present"],
  ["Источник отметки", "attendance_source"],
  ["Нагрузка лидера", "leader_weight"],
  ["Назначенный лидер ID", "assigned_leader_id"],
  ["Назначенный лидер", "assigned_leader_name"],
  ["Время ответа", "answered_at"],
  ["Обновлено", "updated_at"]
]);

export const APPS_SCRIPT_DISPLAY_HEADERS = {
  users: [
    "Telegram ID",
    "Username",
    "Фамилия",
    "Имя",
    "Отчество",
    "Роль",
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
    "Фото Telegram file_id",
    "Аудитория",
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
    "Оплата",
    "Комментарий",
    "Церковь",
    "Дата рождения",
    "Примечание",
    "Пол",
    "Согласие родителей",
    "Ответ",
    "Статус решения",
    "Username",
    "Telegram ID",
    "Время ответа",
    "Роль"
  ],
  programPolls: [
    "ID программы",
    "ID мероприятия",
    "Мероприятие",
    "Заголовок",
    "Текст",
    "Варианты",
    "Фото Telegram file_id",
    "Статус",
    "Создал",
    "Создано",
    "Согласовал",
    "Время согласования",
    "Получателей",
    "Отправлено",
    "Ошибок",
    "Заметки"
  ],
  programVotes: [
    "ФИО",
    "Мероприятие",
    "Опрос",
    "Ответ регистрации",
    "Выбор программы",
    "Предыдущий выбор",
    "Статус решения",
    "Время ответа",
    "Церковь",
    "ID программы",
    "ID мероприятия",
    "Telegram ID",
    "Username",
    "Роль"
  ],
  eventBroadcasts: [
    "ID рассылки",
    "ID мероприятия",
    "Мероприятие",
    "Тип",
    "Текст",
    "Фото Telegram file_id",
    "Статус",
    "Создал",
    "Создано",
    "Согласовал",
    "Время согласования",
    "Получателей",
    "Отправлено",
    "Ошибок",
    "Заметки"
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
  programPolls: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.programPolls.map((header, index) => [header, PROGRAM_POLL_COLUMNS[index]])),
  programVotes: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.programVotes.map((header, index) => [header, PROGRAM_VOTE_COLUMNS[index]])),
  eventBroadcasts: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.eventBroadcasts.map((header, index) => [header, EVENT_BROADCAST_COLUMNS[index]])),
  birthdayLog: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.birthdayLog.map((header, index) => [header, BIRTHDAY_LOG_COLUMNS[index]])),
  birthdayTemplates: Object.fromEntries(APPS_SCRIPT_DISPLAY_HEADERS.birthdayTemplates.map((header, index) => [header, BIRTHDAY_TEMPLATE_COLUMNS[index]]))
};

function normalizeUserId(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\.0$/, "").trim();
}

function normalizeProfileNamePart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/ё/g, "е");
}

function isSameManualProfile(user, profile) {
  const lastNameMatches = normalizeProfileNamePart(user.last_name) === normalizeProfileNamePart(profile.last_name);
  const firstNameMatches = normalizeProfileNamePart(user.first_name) === normalizeProfileNamePart(profile.first_name);
  if (!lastNameMatches || !firstNameMatches) return false;

  const userMiddleName = normalizeProfileNamePart(user.middle_name);
  const profileMiddleName = normalizeProfileNamePart(profile.middle_name);
  return !userMiddleName || !profileMiddleName || userMiddleName === profileMiddleName;
}

function isIncompleteProfile(user) {
  return !user
    || !String(user.last_name || "").trim()
    || !String(user.first_name || "").trim()
    || !String(user.birth_date || "").trim()
    || !String(user.church || "").trim();
}

function profileNameFromRoster(row) {
  return String(row?.["ФИ"] || row?.full_name || "")
    .trim()
    .split(/\s+/)
    .map(normalizeProfileNamePart)
    .filter(Boolean);
}

function sameRosterName(left, right) {
  const leftParts = profileNameFromRoster(left);
  const rightParts = profileNameFromRoster(right);
  if (leftParts.length < 2 || rightParts.length < 2) return false;
  if (leftParts[0] !== rightParts[0] || leftParts[1] !== rightParts[1]) return false;
  return leftParts.length < 3 || rightParts.length < 3 || leftParts[2] === rightParts[2];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryableAppsScriptError(message, cause) {
  const error = new Error(message);
  error.retryable = true;
  if (cause) error.cause = cause;
  return error;
}

function eventRosterSheetName(event) {
  const title = String(event.title || event.event_title || "Мероприятие")
    .replace(/[\[\]\*?/\\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Мероприятие";
  const eventId = String(event.event_id || event.eventId || "").trim();
  const suffix = eventId ? ` ${eventId}` : "";
  const maxTitleLength = Math.max(1, 100 - "Мероприятие - ".length - suffix.length);
  return `Мероприятие - ${title.slice(0, maxTitleLength).trim()}${suffix}`;
}

function eventRosterHeaderRow() {
  return APPS_SCRIPT_DISPLAY_HEADERS.eventRoster;
}

function sheetKey(config, sheetName) {
  if (sheetName === PROGRAM_POLLS_SHEET_NAME) return "programPolls";
  if (sheetName === PROGRAM_VOTES_SHEET_NAME) return "programVotes";
  if (sheetName === EVENT_BROADCASTS_SHEET_NAME) return "eventBroadcasts";
  return Object.entries(config.sheets || {}).find(([, configuredName]) => configuredName === sheetName)?.[0] || "";
}

function normalizeTableHeaders(config, sheetName, table) {
  if (sheetName === WEEKLY_SERVICE_SHEET || sheetName === WEEKLY_ATTENDANCE_SHEET) {
    const aliases = sheetName === WEEKLY_SERVICE_SHEET
      ? WEEKLY_SERVICE_COLUMN_ALIASES
      : WEEKLY_ATTENDANCE_COLUMN_ALIASES;
    const rows = (table.rows || []).map((row) => {
      const next = { _rowNumber: row._rowNumber };
      for (const [header, value] of Object.entries(row)) {
        if (header !== "_rowNumber") next[aliases[header] || header] = value;
      }
      return next;
    });
    return { ...table, headers: (table.headers || []).map((header) => aliases[header] || header), rows };
  }
  const key = sheetKey(config, sheetName)
    || (String(sheetName || "").startsWith("Мероприятие - ") ? "eventRoster" : "");
  const aliases = COLUMN_ALIASES[key];
  if (!aliases) return table;

  const rows = (table.rows || []).map((row) => {
    const next = { _rowNumber: row._rowNumber };
    for (const [header, value] of Object.entries(row)) {
      if (header === "_rowNumber") continue;
      next[aliases[header] || header] = value;
    }
    return next;
  }).filter((row) => {
    if (key !== "eventRoster") return true;
    return !isEventRosterSummaryRow(row);
  });

  const headers = (table.headers || []).map((header) => aliases[header] || header);
  return { ...table, headers, rows };
}

function isEventRosterSheetName(sheetName, config) {
  return sheetName === config.sheets.eventRoster || String(sheetName || "").startsWith("Мероприятие - ");
}

function isEventRosterSummaryRow(row) {
  const marker = String(row.event_id || row["ID мероприятия"] || "").trim();
  const name = String(row["ФИ"] || row["ФИО"] || "").trim();
  return ["Бюджет", "Сводка"].includes(marker) || EVENT_ROSTER_SUMMARY_LABELS.has(name);
}

function normalizeAnswerText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[!.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isEligibleProgramAnswer(answer) {
  const text = normalizeAnswerText(answer);
  if (!text) return false;
  if (/(^|\s)(нет|no)($|\s)/.test(text)) return false;
  if (text.includes("не еду") || text.includes("не поед") || text.includes("не смогу")) return false;

  return text.includes("записыва")
    || text.includes("пока не знаю")
    || text.includes("думаю")
    || text.includes("не знаю")
    || text.includes("еду")
    || text.includes("поеду")
    || text.includes("буду");
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

  async request(action, payload = {}, options = {}) {
    let lastError;
    const maxAttempts = options.maxAttempts || APPS_SCRIPT_MAX_ATTEMPTS;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs || APPS_SCRIPT_TIMEOUT_MS);
      try {
        const response = await fetch(this.config.url, {
          method: "POST",
          headers: { "content-type": "text/plain;charset=utf-8" },
          signal: controller.signal,
          body: JSON.stringify({
            secret: this.config.secret,
            action,
            ...payload
          })
        });

        const text = await response.text();
        let data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (error) {
          const preview = String(text || "").replace(/\s+/g, " ").slice(0, 140);
          throw retryableAppsScriptError(`Apps Script ${action} returned non-JSON response: ${preview}`, error);
        }

        if (!response.ok || data?.ok === false) {
          const error = new Error(`Apps Script ${action} failed: ${data?.error || response.statusText}`);
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }

        if (!data || !Object.prototype.hasOwnProperty.call(data, "result")) {
          throw retryableAppsScriptError(`Apps Script ${action} returned no result`);
        }

        return data.result;
      } catch (error) {
        lastError = error;
        const retryable = error?.retryable || error instanceof TypeError || error?.name === "AbortError";
        if (!retryable || attempt === maxAttempts) break;

        const delayMs = APPS_SCRIPT_RETRY_BASE_MS * attempt;
        console.warn(`[apps_script] ${action} attempt ${attempt} failed: ${error.message}; retrying in ${delayMs}ms`);
        await sleep(delayMs);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError;
  }

  async readTable(sheetName) {
    const table = await this.request("readTable", { sheetName });
    return normalizeTableHeaders(this.config, sheetName, table);
  }

  async readRawTable(sheetName) {
    return this.request("readTable", { sheetName });
  }

  appendRow(sheetName, values, options = {}) {
    return this.request("appendRow", { sheetName, values }, { maxAttempts: 1, ...options });
  }

  updateSheetRow(sheetName, rowNumber, values) {
    return this.request("updateRow", { sheetName, rowNumber, values });
  }

  ensureEventRosterSheet({ sheetName, title, dates }) {
    return this.request("ensureEventRosterSheet", {
      sheetName,
      title,
      dates,
      headers: eventRosterHeaderRow()
    });
  }

  ensureProgramSheets() {
    return this.request("ensureProgramSheets", {
      sheets: {
        programPolls: PROGRAM_POLLS_SHEET_NAME,
        programVotes: PROGRAM_VOTES_SHEET_NAME,
        eventBroadcasts: EVENT_BROADCASTS_SHEET_NAME
      },
      headers: {
        programPolls: APPS_SCRIPT_DISPLAY_HEADERS.programPolls,
        programVotes: APPS_SCRIPT_DISPLAY_HEADERS.programVotes,
        eventBroadcasts: APPS_SCRIPT_DISPLAY_HEADERS.eventBroadcasts
      }
    });
  }

  ensureWeeklyServiceSheets() {
    return this.request("ensureWeeklyServiceSheets", {
      serviceSheet: WEEKLY_SERVICE_SHEET,
      attendanceSheet: WEEKLY_ATTENDANCE_SHEET,
      serviceHeaders: WEEKLY_SERVICE_COLUMNS,
      attendanceHeaders: WEEKLY_ATTENDANCE_COLUMNS
    });
  }

  async createWeeklyService({ serviceId, dateKey, status = "scheduled" }) {
    await this.ensureWeeklyServiceSheets();
    const existing = await this.getWeeklyServiceByDate(dateKey);
    if (existing) return existing;
    const row = {
      service_id: serviceId,
      service_date: dateKey,
      status,
      leader_message_id: "",
      teenager_message_id: "",
      created_at: isoNow(),
      cancelled_at: "",
      assigned_at: ""
    };
    await this.appendRow(WEEKLY_SERVICE_SHEET, WEEKLY_SERVICE_COLUMNS.map((header) => row[WEEKLY_SERVICE_COLUMN_ALIASES[header]] || ""));
    return row;
  }

  async getWeeklyServiceByDate(dateKey) {
    await this.ensureWeeklyServiceSheets();
    const { rows } = await this.readTable(WEEKLY_SERVICE_SHEET);
    return rows.find((row) => String(row.service_date) === String(dateKey));
  }

  async getWeeklyService(serviceId) {
    await this.ensureWeeklyServiceSheets();
    const { rows } = await this.readTable(WEEKLY_SERVICE_SHEET);
    return rows.find((row) => String(row.service_id) === String(serviceId));
  }

  async updateWeeklyService(serviceId, patch) {
    const service = await this.getWeeklyService(serviceId);
    if (!service?._rowNumber) throw new Error(`Weekly service not found: ${serviceId}`);
    const next = { ...service, ...patch };
    await this.updateSheetRow(
      WEEKLY_SERVICE_SHEET,
      service._rowNumber,
      WEEKLY_SERVICE_COLUMNS.map((header) => next[WEEKLY_SERVICE_COLUMN_ALIASES[header]] || "")
    );
    return next;
  }

  async upsertWeeklyAttendance({ service, user, group, answer }) {
    await this.ensureWeeklyServiceSheets();
    const { rows } = await this.readTable(WEEKLY_ATTENDANCE_SHEET);
    const telegramUserId = normalizeUserId(user.telegram_user_id || user.id);
    const existing = rows.find((row) => String(row.service_id) === String(service.service_id)
      && normalizeUserId(row.telegram_user_id) === telegramUserId);
    const row = weeklyAttendanceRow({ service, user, group, answer, existing });
    const values = WEEKLY_ATTENDANCE_COLUMNS.map((header) => row[WEEKLY_ATTENDANCE_COLUMN_ALIASES[header]] || "");
    if (existing?._rowNumber) {
      await this.updateSheetRow(WEEKLY_ATTENDANCE_SHEET, existing._rowNumber, values);
    } else {
      await this.appendRow(WEEKLY_ATTENDANCE_SHEET, values);
    }
    return row;
  }

  async listWeeklyAttendance(serviceId) {
    await this.ensureWeeklyServiceSheets();
    const { rows } = await this.readTable(WEEKLY_ATTENDANCE_SHEET);
    return rows.filter((row) => String(row.service_id) === String(serviceId));
  }

  async updateWeeklyAttendance(serviceId, telegramUserId, patch) {
    const rows = await this.listWeeklyAttendance(serviceId);
    const existing = rows.find((row) => normalizeUserId(row.telegram_user_id) === normalizeUserId(telegramUserId));
    if (!existing?._rowNumber) throw new Error(`Attendance not found: ${serviceId}/${telegramUserId}`);
    const next = { ...existing, ...patch, updated_at: isoNow() };
    await this.updateSheetRow(
      WEEKLY_ATTENDANCE_SHEET,
      existing._rowNumber,
      WEEKLY_ATTENDANCE_COLUMNS.map((header) => next[WEEKLY_ATTENDANCE_COLUMN_ALIASES[header]] || "")
    );
    return next;
  }

  createPastoralWorkbook(viewerEmails = []) {
    return this.request("createPastoralWorkbook", {
      headers: PASTORAL_NOTE_COLUMNS,
      viewerEmails
    }, { maxAttempts: 1 });
  }

  pastoralWorkbookInfo() {
    return this.request("pastoralWorkbookInfo", {}, { maxAttempts: 1 });
  }

  appendPastoralNote(values) {
    return this.request("appendPastoralNote", { values, headers: PASTORAL_NOTE_COLUMNS }, { maxAttempts: 1 });
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
        role: existing.role || "Участник",
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
      updated_at: isoNow(),
      role: "Участник"
    };
    const result = await this.appendRow(sheetName, this.valuesFor(USER_COLUMNS, row));
    return { ...row, _rowNumber: result?.rowNumber };
  }

  async getUserByTelegramId(telegramUserId) {
    const sheetName = this.config.sheets.users;
    const { rows } = await this.readTable(sheetName);
    return rows.find((row) => normalizeUserId(row.telegram_user_id) === normalizeUserId(telegramUserId));
  }

  async updateUserProfile({ telegramUser, privateChatId = "", profile }) {
    const sheetName = this.config.sheets.users;
    const { rows } = await this.readTable(sheetName);
    const telegramUserId = normalizeUserId(telegramUser.id);
    const currentUser = rows.find((row) => normalizeUserId(row.telegram_user_id) === telegramUserId);
    const manualCandidates = rows.filter((row) => {
      return !normalizeUserId(row.telegram_user_id) && isSameManualProfile(row, profile);
    });
    let user = currentUser;

    // A manually entered card has no Telegram ID until the person completes the bot profile.
    // Claim exactly one matching card instead of creating a duplicate and preserve its admin notes.
    if (manualCandidates.length === 1 && (!currentUser || isIncompleteProfile(currentUser))) {
      if (currentUser?._rowNumber && currentUser._rowNumber !== manualCandidates[0]._rowNumber) {
        await this.updateSheetRow(sheetName, currentUser._rowNumber, Array(USER_COLUMNS.length).fill(""));
        const refreshed = await this.readTable(sheetName);
        user = refreshed.rows.find((row) => {
          return !normalizeUserId(row.telegram_user_id) && isSameManualProfile(row, profile);
        });
      } else {
        user = manualCandidates[0];
      }
    }

    if (!user?._rowNumber) {
      const row = {
        telegram_user_id: telegramUserId,
        username: telegramUser.username || "",
        last_name: profile.last_name,
        first_name: profile.first_name,
        middle_name: profile.middle_name,
        birth_date: profile.birth_date,
        church: profile.church,
        gender: "",
        parent_consent: "",
        medical_certificate: "",
        private_chat_id: privateChatId,
        is_active: "yes",
        notes: "updated by profile form",
        updated_at: isoNow(),
        role: resolveProfileRole({}, profile)
      };
      await this.appendRow(sheetName, this.valuesFor(USER_COLUMNS, row));
      return row;
    }

    const next = {
      ...user,
      telegram_user_id: telegramUserId || user.telegram_user_id,
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

    await this.updateSheetRow(sheetName, user._rowNumber, this.valuesFor(USER_COLUMNS, next));
    return next;
  }

  async refreshRegistrationsForUser(user) {
    const telegramUserId = normalizeUserId(user.telegram_user_id || user.id);
    if (!telegramUserId) return 0;

    const registrationsSheet = this.config.sheets.registrations;
    const eventsSheet = this.config.sheets.events;
    const registrations = await this.readTable(registrationsSheet);
    const events = await this.readTable(eventsSheet);
    const eventsById = new Map((events.rows || []).map((event) => [String(event.event_id), event]));
    const userFullName = fullName(user);
    let refreshed = 0;

    for (const registration of registrations.rows || []) {
      if (normalizeUserId(registration.telegram_user_id) !== telegramUserId) continue;

      const event = eventsById.get(String(registration.event_id)) || {
        event_id: registration.event_id,
        title: registration.event_title,
        dates: "",
        options: ""
      };
      const nextRegistration = {
        ...registration,
        event_id: registration.event_id,
        event_title: event.title || registration.event_title,
        telegram_user_id: telegramUserId,
        username: user.username || registration.username || "",
        full_name: userFullName || registration.full_name || "",
        updated_at: isoNow()
      };

      await this.updateSheetRow(
        registrationsSheet,
        registration._rowNumber,
        this.valuesFor(REGISTRATION_COLUMNS, nextRegistration)
      );
      await this.upsertEventRoster({
        event,
        user,
        registration: nextRegistration,
        decisionChanged: String(registration.change_note || "").trim() === "изменил решение"
      });
      refreshed += 1;
    }

    return refreshed;
  }

  async createEvent(event) {
    const sheetName = this.config.sheets.events;
    const row = {
      event_id: event.eventId,
      title: event.title,
      dates: event.dates,
      description: event.description,
      options: event.options.join("|"),
      photo_file_id: event.photoFileId || event.photo_file_id || "",
      audience: event.audience || "all",
      status: "active",
      group_chat_id: event.groupChatId,
      message_id: event.messageId,
      created_at: isoNow(),
      updated_at: isoNow()
    };
    await this.appendRow(sheetName, this.valuesFor(EVENT_COLUMNS, row));
    return row;
  }

  async updateEvent(eventId, patch) {
    const sheetName = this.config.sheets.events;
    const { rows } = await this.readTable(sheetName);
    const existing = rows.find((row) => String(row.event_id) === String(eventId));
    if (!existing?._rowNumber) {
      throw new Error(`Event not found: ${eventId}`);
    }

    const next = {
      ...existing,
      ...patch,
      updated_at: isoNow()
    };
    await this.updateSheetRow(sheetName, existing._rowNumber, this.valuesFor(EVENT_COLUMNS, next));
    return next;
  }

  async getEvent(eventId) {
    const sheetName = this.config.sheets.events;
    const { rows } = await this.readTable(sheetName);
    return rows.find((row) => String(row.event_id) === String(eventId) && String(row.status || "active") !== "closed");
  }

  async listActiveEvents() {
    const sheetName = this.config.sheets.events;
    const { rows } = await this.readTable(sheetName);
    return rows.filter((row) => String(row.status || "active") !== "closed");
  }

  async reconcileActiveEventRosters() {
    const [events, registrations, users] = await Promise.all([
      this.listActiveEvents(),
      this.readTable(this.config.sheets.registrations),
      this.readTable(this.config.sheets.users)
    ]);
    const usersById = new Map((users.rows || []).map((user) => [
      normalizeUserId(user.telegram_user_id),
      user
    ]));
    let repaired = 0;
    let errors = 0;

    for (const event of events) {
      const eventId = String(event.event_id || "");
      if (!eventId) continue;

      const registrationsForEvent = (registrations.rows || []).filter((registration) => {
        return String(registration.event_id) === eventId && normalizeUserId(registration.telegram_user_id);
      });
      if (!registrationsForEvent.length) continue;

      const eventSheetName = eventRosterSheetName(event);
      let roster;
      try {
        roster = await this.readTable(eventSheetName);
      } catch (error) {
        try {
          await this.ensureEventRosterSheet({
            sheetName: eventSheetName,
            title: event.title,
            dates: event.dates
          });
          roster = await this.readTable(eventSheetName);
        } catch (sheetError) {
          errors += registrationsForEvent.length;
          console.warn(`[event_roster_reconcile] event=${eventId}: ${sheetError.message}`);
          continue;
        }
      }

      const rosterUserIds = new Set((roster.rows || []).map((row) => normalizeUserId(row.telegram_user_id)));
      for (const registration of registrationsForEvent) {
        const telegramUserId = normalizeUserId(registration.telegram_user_id);
        if (rosterUserIds.has(telegramUserId)) continue;

        const user = usersById.get(telegramUserId);
        if (!user) continue;

        try {
          await this.upsertEventRoster({
            event,
            user,
            registration,
            decisionChanged: String(registration.change_note || "").trim() === "изменил решение"
          });
          rosterUserIds.add(telegramUserId);
          repaired += 1;
        } catch (error) {
          errors += 1;
          console.warn(`[event_roster_reconcile] event=${eventId} user=${telegramUserId}: ${error.message}`);
        }
      }
    }

    return { repaired, errors };
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
    const eventSheetName = eventRosterSheetName(event);
    const telegramUserId = normalizeUserId(registration.telegram_user_id);

    const rosterRow = {
      event_id: event.event_id,
      "ФИ": registration.full_name || fullName(user) || registration.username,
      "Оплата": "",
      "Комментарий": "",
      "Церковь": user.church || "",
      "Дата рождения": formatBirthDate(user.birth_date),
      "примечание": user.notes || "",
      "Пол": user.gender || "",
      "Согласие родителей": user.parent_consent || "",
      "Ответ": registration.answer,
      "Статус решения": decisionChanged ? "изменил решение" : "",
      username: registration.username,
      telegram_user_id: telegramUserId,
      answered_at: registration.answered_at,
      role: user.role || ""
    };

    await this.upsertRosterRow(sheetName, rosterRow, (row) => {
      return String(row.event_id) === String(event.event_id)
        && normalizeUserId(row.telegram_user_id) === telegramUserId;
    });

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.ensureEventRosterSheet({
          sheetName: eventSheetName,
          title: event.title,
          dates: event.dates
        });
        await this.upsertRosterRow(eventSheetName, rosterRow, (row) => {
          return normalizeUserId(row.telegram_user_id) === telegramUserId;
        }, { matchManualRosterByName: true });
        return;
      } catch (error) {
        lastError = error;
        console.warn(
          `[event_roster_sheet] event=${event.event_id} user=${telegramUserId} attempt=${attempt}: ${error.message}`
        );
        if (attempt < 3) await sleep(APPS_SCRIPT_RETRY_BASE_MS * attempt);
      }
    }

    throw lastError;
  }

  async upsertRosterRow(sheetName, rosterRow, matchRow, { matchManualRosterByName = false } = {}) {
    await this.clearEventRosterSummaryRows(sheetName);
    const { rows } = await this.readTable(sheetName);
    const existingByTelegramId = rows.find(matchRow);
    const manualCandidates = matchManualRosterByName
      ? rows.filter((row) => !normalizeUserId(row.telegram_user_id) && sameRosterName(row, rosterRow))
      : [];
    const existing = existingByTelegramId || (manualCandidates.length === 1 ? manualCandidates[0] : null);
    const next = existing
      ? {
          ...rosterRow,
          "Оплата": existing["Оплата"] || existing["Сдал"] || rosterRow["Оплата"] || "",
          "Комментарий": existing["Комментарий"] || rosterRow["Комментарий"] || ""
        }
      : rosterRow;
    const values = this.valuesFor(EVENT_ROSTER_COLUMNS, next);

    if (existing) {
      await this.updateSheetRow(sheetName, existing._rowNumber, values);
      await this.writeEventRosterSummary(sheetName);
      return;
    }

    await this.appendRow(sheetName, values);
    await this.writeEventRosterSummary(sheetName);
  }

  async clearEventRosterSummaryRows(sheetName) {
    if (!isEventRosterSheetName(sheetName, this.config)) return;
    const table = await this.readRawTable(sheetName);
    const headers = table.headers || [];
    const width = Math.max(headers.length, 20);
    const blank = Array.from({ length: width }, () => "");
    for (const row of table.rows || []) {
      if (isEventRosterSummaryRow(row)) {
        await this.updateSheetRow(sheetName, row._rowNumber, blank);
      }
    }
  }

  async writeEventRosterSummary(sheetName) {
    if (!isEventRosterSheetName(sheetName, this.config)) return;
    // Apps Script redraws the styled dynamic summary after append/update.
  }

  async listProgramRecipients(eventId) {
    const registrations = await this.readTable(this.config.sheets.registrations);
    const users = await this.readTable(this.config.sheets.users);
    const usersById = new Map((users.rows || []).map((user) => [
      normalizeUserId(user.telegram_user_id),
      user
    ]));
    const latestByUser = new Map();

    for (const registration of registrations.rows || []) {
      if (String(registration.event_id) !== String(eventId)) continue;
      const telegramUserId = normalizeUserId(registration.telegram_user_id);
      if (!telegramUserId) continue;

      const current = latestByUser.get(telegramUserId);
      if (!current || Number(registration._rowNumber || 0) >= Number(current._rowNumber || 0)) {
        latestByUser.set(telegramUserId, registration);
      }
    }

    return [...latestByUser.values()]
      .filter((registration) => isEligibleProgramAnswer(registration.answer))
      .map((registration) => {
        const telegramUserId = normalizeUserId(registration.telegram_user_id);
        const user = usersById.get(telegramUserId) || {};
        return {
          registration,
          user,
          telegram_user_id: telegramUserId,
          private_chat_id: normalizeUserId(user.private_chat_id),
          full_name: fullName(user) || registration.full_name || registration.username || telegramUserId
        };
      });
  }

  async getRegistrationForUser(eventId, telegramUserId) {
    const registrations = await this.readTable(this.config.sheets.registrations);
    return (registrations.rows || [])
      .filter((registration) => {
        return String(registration.event_id) === String(eventId)
          && normalizeUserId(registration.telegram_user_id) === normalizeUserId(telegramUserId);
      })
      .sort((a, b) => Number(b._rowNumber || 0) - Number(a._rowNumber || 0))[0];
  }

  async createProgramPoll({ programId, event, title, message, options, photoFileId, createdBy, targetCount = 0 }) {
    await this.ensureProgramSheets();
    const row = {
      program_id: programId,
      event_id: event.event_id,
      event_title: event.title,
      title,
      message,
      options,
      photo_file_id: photoFileId || "",
      status: "pending",
      created_by: normalizeUserId(createdBy),
      created_at: isoNow(),
      approved_by: "",
      approved_at: "",
      target_count: targetCount,
      sent_count: "",
      failed_count: "",
      notes: ""
    };

    await this.appendRow(PROGRAM_POLLS_SHEET_NAME, this.valuesFor(PROGRAM_POLL_COLUMNS, row));
    return row;
  }

  async getProgramPoll(programId) {
    await this.ensureProgramSheets();
    const { rows } = await this.readTable(PROGRAM_POLLS_SHEET_NAME);
    return rows.find((row) => String(row.program_id) === String(programId));
  }

  async getProgramVote(programId, telegramUserId) {
    await this.ensureProgramSheets();
    const { rows } = await this.readTable(PROGRAM_VOTES_SHEET_NAME);
    const normalizedUserId = normalizeUserId(telegramUserId);
    return rows.find((row) => {
      return String(row.program_id) === String(programId)
        && normalizeUserId(row.telegram_user_id) === normalizedUserId;
    });
  }

  async updateProgramPoll(programId, patch) {
    await this.ensureProgramSheets();
    const { rows } = await this.readTable(PROGRAM_POLLS_SHEET_NAME);
    const existing = rows.find((row) => String(row.program_id) === String(programId));
    if (!existing?._rowNumber) {
      throw new Error(`Program poll not found: ${programId}`);
    }

    const next = { ...existing, ...patch };
    await this.updateSheetRow(PROGRAM_POLLS_SHEET_NAME, existing._rowNumber, this.valuesFor(PROGRAM_POLL_COLUMNS, next));
    return next;
  }

  async upsertProgramVote({ program, user, registration, selectedOption }) {
    await this.ensureProgramSheets();
    const telegramUserId = normalizeUserId(user.telegram_user_id || user.id || registration.telegram_user_id);
    const { rows } = await this.readTable(PROGRAM_VOTES_SHEET_NAME);
    const existing = rows.find((row) => {
      return String(row.program_id) === String(program.program_id)
        && normalizeUserId(row.telegram_user_id) === telegramUserId;
    });
    const previousOption = String(existing?.selected_option || "").trim();
    const changed = Boolean(previousOption && previousOption !== String(selectedOption).trim());
    const row = {
      full_name: fullName(user) || registration.full_name || user.username || registration.username || telegramUserId,
      event_title: program.event_title || registration.event_title || "",
      program_title: program.title || "",
      registration_answer: registration.answer || "",
      selected_option: selectedOption,
      previous_option: changed ? previousOption : "",
      change_note: changed ? "изменил решение" : "",
      answered_at: isoNow(),
      church: user.church || "",
      program_id: program.program_id,
      event_id: program.event_id,
      telegram_user_id: telegramUserId,
      username: user.username || registration.username || "",
      role: user.role || ""
    };

    const values = this.valuesFor(PROGRAM_VOTE_COLUMNS, row);
    if (typeof this.config?.url === "string") {
      try {
        await this.request("upsertProgramVote", { values });
        return row;
      } catch (error) {
        if (!/Unknown action: upsertProgramVote/i.test(error.message || "")) {
          throw error;
        }
      }
    }

    if (existing) {
      await this.updateSheetRow(PROGRAM_VOTES_SHEET_NAME, existing._rowNumber, values);
      return row;
    }

    await this.appendRow(PROGRAM_VOTES_SHEET_NAME, values, { maxAttempts: 1 });
    return row;
  }

  async createEventBroadcast({ broadcastId, event, type, message, photoFileId, createdBy, targetCount = 0 }) {
    await this.ensureProgramSheets();
    const row = {
      broadcast_id: broadcastId,
      event_id: event.event_id,
      event_title: event.title,
      type,
      message,
      photo_file_id: photoFileId || "",
      status: "pending",
      created_by: normalizeUserId(createdBy),
      created_at: isoNow(),
      approved_by: "",
      approved_at: "",
      target_count: targetCount,
      sent_count: "",
      failed_count: "",
      notes: ""
    };

    await this.appendRow(EVENT_BROADCASTS_SHEET_NAME, this.valuesFor(EVENT_BROADCAST_COLUMNS, row));
    return row;
  }

  async getEventBroadcast(broadcastId) {
    await this.ensureProgramSheets();
    const { rows } = await this.readTable(EVENT_BROADCASTS_SHEET_NAME);
    return rows.find((row) => String(row.broadcast_id) === String(broadcastId));
  }

  async updateEventBroadcast(broadcastId, patch) {
    await this.ensureProgramSheets();
    const { rows } = await this.readTable(EVENT_BROADCASTS_SHEET_NAME);
    const existing = rows.find((row) => String(row.broadcast_id) === String(broadcastId));
    if (!existing?._rowNumber) {
      throw new Error(`Event broadcast not found: ${broadcastId}`);
    }

    const next = { ...existing, ...patch };
    await this.updateSheetRow(EVENT_BROADCASTS_SHEET_NAME, existing._rowNumber, this.valuesFor(EVENT_BROADCAST_COLUMNS, next));
    return next;
  }

  async birthdaysFor(month, day) {
    const sheetName = this.config.sheets.users;
    const { rows } = await this.readTable(sheetName);
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
    const sheetName = this.config.sheets.birthdayLog;
    const { rows } = await this.readTable(sheetName);
    return rows.find((row) => {
      return normalizeDateKey(row.date) === normalizeDateKey(dateKey)
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
