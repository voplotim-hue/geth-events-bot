import { AppsScriptStore } from "../src/apps-script-store.js";
import { loadConfig } from "../src/config.js";
import { loadDotEnv } from "../src/env.js";

loadDotEnv();

const config = loadConfig();
const store = new AppsScriptStore(config.appsScript);

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

const ROLE_RANKS = new Map([
  ["Админ", 1],
  ["Помощник", 2],
  ["Участник", 3],
  ["Гость", 4],
  ["", 5]
]);

function normalizeSortText(value) {
  return String(value ?? "")
    .replace(/ё/g, "е")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compareSortText(a, b) {
  return normalizeSortText(a).localeCompare(normalizeSortText(b), "ru");
}

function normalizeBirthDateForWrite(value) {
  const text = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
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

function roleRank(value) {
  return ROLE_RANKS.get(String(value || "").trim()) ?? 5;
}

function rowHasRosterData(row) {
  return row.event_id || row["ФИ"] || row.username || row.telegram_user_id || row["Ответ"];
}

async function sortRosterSheet(sheetName, { groupByEvent = false } = {}) {
  const table = await store.readTable(sheetName);
  const rows = (table.rows || []).filter(rowHasRosterData);

  rows.sort((a, b) => {
    if (groupByEvent) {
      const eventDiff = compareSortText(a.event_id, b.event_id);
      if (eventDiff) return eventDiff;
    }

    const roleDiff = roleRank(a.role) - roleRank(b.role);
    if (roleDiff) return roleDiff;

    const nameDiff = compareSortText(a["ФИ"], b["ФИ"]);
    if (nameDiff) return nameDiff;

    return compareSortText(a.username, b.username);
  });

  for (let index = 0; index < rows.length; index += 1) {
    const row = {
      ...rows[index],
      "Дата рождения": normalizeBirthDateForWrite(rows[index]["Дата рождения"])
    };
    await store.updateSheetRow(
      sheetName,
      index + 2,
      EVENT_ROSTER_COLUMNS.map((column) => row[column] ?? "")
    );
  }

  return {
    sheetName,
    count: rows.length,
    first10: rows.slice(0, 10).map((row) => ({
      fio: row["ФИ"],
      role: row.role
    })),
    nadezhdaRow: rows.findIndex((row) => String(row["ФИ"] || "").includes("Пухнаревич Надежда")) + 2
  };
}

const events = await store.listActiveEvents();
const eventSheets = events.map(eventRosterSheetName);
const requestedSheets = process.argv.slice(2);
const results = [];

if (requestedSheets.length) {
  for (const sheetName of requestedSheets) {
    results.push(await sortRosterSheet(sheetName, { groupByEvent: sheetName === config.appsScript.sheets.eventRoster }));
  }
} else {
  results.push(await sortRosterSheet(config.appsScript.sheets.eventRoster, { groupByEvent: true }));
  for (const sheetName of eventSheets) {
    results.push(await sortRosterSheet(sheetName));
  }
}

console.log(JSON.stringify({ results }, null, 2));
