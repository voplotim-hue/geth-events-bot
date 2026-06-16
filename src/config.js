function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "y", "да"].includes(String(value).toLowerCase());
}

function parseBirthdayTime(value) {
  const raw = value || "09:00";
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(raw);
  if (!match) {
    throw new Error(`BIRTHDAY_CHECK_TIME must be HH:mm, got "${raw}"`);
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

export function loadConfig(env = process.env) {
  const telegramToken = env.TELEGRAM_BOT_TOKEN;
  if (!telegramToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN in .env");
  }

  const excelEnabled = parseBoolean(env.EXCEL_ENABLED, false);
  const googleSheetsEnabled = parseBoolean(env.GOOGLE_SHEETS_ENABLED, false);
  const appsScriptEnabled = parseBoolean(env.GOOGLE_APPS_SCRIPT_ENABLED, false);
  const adminUserIdList = splitList(env.ADMIN_USER_IDS).map(String);
  const adminUserIds = new Set(adminUserIdList);
  const birthdayApproverChatId = env.BIRTHDAY_APPROVER_CHAT_ID
    || env.SUPERADMIN_USER_ID
    || adminUserIdList[0]
    || "";
  const defaultOptions = String(env.EVENT_DEFAULT_OPTIONS || "Еду|Не еду|Пока не знаю")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  if (defaultOptions.length < 2) {
    throw new Error("EVENT_DEFAULT_OPTIONS must contain at least two options separated by |");
  }

  const excel = {
    enabled: excelEnabled,
    tenantId: env.EXCEL_TENANT_ID,
    clientId: env.EXCEL_CLIENT_ID,
    clientSecret: env.EXCEL_CLIENT_SECRET,
    driveId: env.EXCEL_DRIVE_ID,
    itemId: env.EXCEL_ITEM_ID,
    workbookPath: env.EXCEL_WORKBOOK_PATH,
    tables: {
      users: env.EXCEL_TABLE_USERS || "Users",
      events: env.EXCEL_TABLE_EVENTS || "Events",
      registrations: env.EXCEL_TABLE_REGISTRATIONS || "Registrations",
      eventRoster: env.EXCEL_TABLE_EVENT_ROSTER || "EventRoster",
      birthdayLog: env.EXCEL_TABLE_BIRTHDAY_LOG || "BirthdayLog",
      birthdayTemplates: env.EXCEL_TABLE_BIRTHDAY_TEMPLATES || "BirthdayTemplates"
    }
  };

  const googleSheets = {
    enabled: googleSheetsEnabled,
    spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_PRIVATE_KEY,
    keyFile: env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE,
    sheets: {
      users: env.GOOGLE_SHEET_USERS || env.EXCEL_TABLE_USERS || "Users",
      events: env.GOOGLE_SHEET_EVENTS || env.EXCEL_TABLE_EVENTS || "Events",
      registrations: env.GOOGLE_SHEET_REGISTRATIONS || env.EXCEL_TABLE_REGISTRATIONS || "Registrations",
      eventRoster: env.GOOGLE_SHEET_EVENT_ROSTER || env.EXCEL_TABLE_EVENT_ROSTER || "EventRoster",
      birthdayLog: env.GOOGLE_SHEET_BIRTHDAY_LOG || env.EXCEL_TABLE_BIRTHDAY_LOG || "BirthdayLog",
      birthdayTemplates: env.GOOGLE_SHEET_BIRTHDAY_TEMPLATES || env.EXCEL_TABLE_BIRTHDAY_TEMPLATES || "BirthdayTemplates"
    }
  };

  const appsScript = {
    enabled: appsScriptEnabled,
    url: env.GOOGLE_APPS_SCRIPT_URL,
    secret: env.GOOGLE_APPS_SCRIPT_SECRET,
    sheets: {
      users: env.GOOGLE_SHEET_USERS || env.EXCEL_TABLE_USERS || "Users",
      events: env.GOOGLE_SHEET_EVENTS || env.EXCEL_TABLE_EVENTS || "Events",
      registrations: env.GOOGLE_SHEET_REGISTRATIONS || env.EXCEL_TABLE_REGISTRATIONS || "Registrations",
      eventRoster: env.GOOGLE_SHEET_EVENT_ROSTER || env.EXCEL_TABLE_EVENT_ROSTER || "EventRoster",
      birthdayLog: env.GOOGLE_SHEET_BIRTHDAY_LOG || env.EXCEL_TABLE_BIRTHDAY_LOG || "BirthdayLog",
      birthdayTemplates: env.GOOGLE_SHEET_BIRTHDAY_TEMPLATES || env.EXCEL_TABLE_BIRTHDAY_TEMPLATES || "BirthdayTemplates"
    }
  };

  if (excelEnabled) {
    const missing = [];
    for (const key of ["tenantId", "clientId", "clientSecret", "driveId"]) {
      if (!excel[key]) missing.push(`EXCEL_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`);
    }
    if (!excel.itemId && !excel.workbookPath) {
      missing.push("EXCEL_ITEM_ID or EXCEL_WORKBOOK_PATH");
    }
    if (missing.length) {
      throw new Error(`Missing Excel configuration: ${missing.join(", ")}`);
    }
  }

  if (googleSheetsEnabled) {
    const missing = [];
    if (!googleSheets.spreadsheetId) missing.push("GOOGLE_SHEETS_SPREADSHEET_ID");
    if (!googleSheets.keyFile && !googleSheets.serviceAccountEmail) missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_KEY_FILE");
    if (!googleSheets.keyFile && !googleSheets.privateKey) missing.push("GOOGLE_PRIVATE_KEY or GOOGLE_SERVICE_ACCOUNT_KEY_FILE");
    if (missing.length) {
      throw new Error(`Missing Google Sheets configuration: ${missing.join(", ")}`);
    }
  }

  if (appsScriptEnabled) {
    const missing = [];
    if (!appsScript.url) missing.push("GOOGLE_APPS_SCRIPT_URL");
    if (!appsScript.secret) missing.push("GOOGLE_APPS_SCRIPT_SECRET");
    if (missing.length) {
      throw new Error(`Missing Google Apps Script configuration: ${missing.join(", ")}`);
    }
  }

  return {
    telegramToken,
    botUsername: String(env.TELEGRAM_BOT_USERNAME || "GethEvents_bot").replace(/^@/, ""),
    adminUserIds,
    groupChatId: env.GROUP_CHAT_ID || "",
    timeZone: env.TIMEZONE || "Europe/Minsk",
    birthdayCheckTime: parseBirthdayTime(env.BIRTHDAY_CHECK_TIME),
    sendBirthdaysToGroup: parseBoolean(env.SEND_BIRTHDAYS_TO_GROUP, true),
    birthdayApproverChatId,
    defaultOptions,
    excel,
    googleSheets,
    appsScript
  };
}
