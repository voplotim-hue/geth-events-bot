import { AppsScriptStore } from "../src/apps-script-store.js";
import { loadConfig } from "../src/config.js";
import { loadDotEnv } from "../src/env.js";

loadDotEnv();

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

const maleNames = new Set([
  "адриан",
  "александр",
  "алексей",
  "арсений",
  "артем",
  "артём",
  "богдан",
  "владислав",
  "даниил",
  "даниэль",
  "денис",
  "дмитрий",
  "елисей",
  "игор",
  "igor",
  "илья",
  "максим",
  "марк",
  "мартин",
  "матвей",
  "михаил",
  "никита",
  "павел",
  "родион",
  "роман",
  "савелий",
  "тимофей",
  "тимур",
  "филипп",
  "ян",
  "ярослав"
]);

const femaleNames = new Set([
  "анастасия",
  "анна",
  "арианна",
  "арина",
  "вера",
  "вероника",
  "даниэла",
  "дарина",
  "дарья",
  "дина",
  "екатерина",
  "женя",
  "kira",
  "кира",
  "ксения",
  "лидия",
  "лиза",
  "лилия",
  "маргарита",
  "мария",
  "маша",
  "надежда",
  "нелли",
  "оливия",
  "ольга",
  "полина",
  "рыжая",
  "сарра",
  "софия",
  "татьяна",
  "ульяна",
  "эвелина",
  "элиза",
  "эмилия",
  "юлиана",
  "юлия"
]);

const cyrillicLookalikes = new Map([
  ["a", "а"],
  ["b", "в"],
  ["c", "с"],
  ["e", "е"],
  ["h", "н"],
  ["k", "к"],
  ["m", "м"],
  ["o", "о"],
  ["p", "р"],
  ["t", "т"],
  ["x", "х"],
  ["y", "у"]
]);

function normalizeToken(token) {
  const base = String(token || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е");

  if (!/[а-я]/.test(base)) return base;

  return [...base].map((letter) => cyrillicLookalikes.get(letter) || letter).join("");
}

function nameTokens(value) {
  return String(value || "")
    .normalize("NFKC")
    .match(/\p{L}+/gu)
    ?.map(normalizeToken)
    .filter(Boolean) || [];
}

function inferGender(user) {
  const firstTokens = nameTokens(user.first_name);
  for (const token of firstTokens) {
    if (maleNames.has(token)) return { gender: "мужской", reason: `имя: ${token}` };
    if (femaleNames.has(token)) return { gender: "женский", reason: `имя: ${token}` };
  }

  const middle = nameTokens(user.middle_name).join(" ");
  if (/(^|\s)[а-я]+ич[ь]?($|\s)/.test(middle)) {
    return { gender: "мужской", reason: `отчество: ${user.middle_name}` };
  }
  if (/(^|\s)[а-я]+(вна|ична)($|\s)/.test(middle)) {
    return { gender: "женский", reason: `отчество: ${user.middle_name}` };
  }

  return { gender: "", reason: "нужно проверить вручную" };
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

function userDisplayName(user) {
  return [user.last_name, user.first_name, user.middle_name]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ") || user.username || user.telegram_user_id;
}

const apply = process.argv.includes("--apply");
const bulk = process.argv.includes("--bulk");
const config = loadConfig();
const store = new AppsScriptStore(config.appsScript);
const usersSheet = config.appsScript.sheets.users;
const users = await store.readTable(usersSheet);

const planned = [];
const uncertain = [];
const genderByUserId = new Map();

for (const user of users.rows || []) {
  const existingGender = String(user.gender || "").trim();
  if (existingGender) {
    genderByUserId.set(String(user.telegram_user_id), existingGender);
    continue;
  }

  const inferred = inferGender(user);
  const item = {
    rowNumber: user._rowNumber,
    telegram_user_id: user.telegram_user_id,
    username: user.username,
    name: userDisplayName(user),
    role: user.role,
    gender: inferred.gender,
    reason: inferred.reason
  };

  if (inferred.gender) {
    planned.push({ ...item, user });
    genderByUserId.set(String(user.telegram_user_id), inferred.gender);
  } else {
    uncertain.push(item);
  }
}

const result = {
  mode: apply ? "apply" : "dry-run",
  totalUsers: users.rows.length,
  planned: planned.length,
  uncertain: uncertain.map(({ rowNumber, telegram_user_id, username, name, role, reason }) => ({
    rowNumber,
    telegram_user_id,
    username,
    name,
    role,
    reason
  })),
  usersUpdated: 0,
  rosterRowsUpdated: 0,
  rosterSheets: []
};

if (!apply) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (bulk) {
  const gendersByUserId = Object.fromEntries(
    planned.map((item) => [String(item.telegram_user_id), item.gender])
  );
  result.bulkResult = await store.request("bulkUpdateGenders", { gendersByUserId });
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

for (const item of planned) {
  const next = { ...item.user, gender: item.gender };
  await store.updateSheetRow(usersSheet, item.rowNumber, USER_COLUMNS.map((column) => next[column] ?? ""));
  result.usersUpdated += 1;
}

const events = await store.listActiveEvents();
const rosterSheets = [
  config.appsScript.sheets.eventRoster,
  ...events.map(eventRosterSheetName)
];

for (const sheetName of rosterSheets) {
  const table = await store.readTable(sheetName);
  let rowsUpdated = 0;

  for (const row of table.rows || []) {
    const userId = String(row.telegram_user_id || "").replace(/\.0$/, "").trim();
    const gender = genderByUserId.get(userId);
    if (!gender || String(row["Пол"] || "").trim() === gender) continue;

    const next = { ...row, "Пол": gender };
    await store.updateSheetRow(sheetName, row._rowNumber, EVENT_ROSTER_COLUMNS.map((column) => next[column] ?? ""));
    rowsUpdated += 1;
  }

  result.rosterRowsUpdated += rowsUpdated;
  result.rosterSheets.push({ sheetName, rowsUpdated });
}

await store.request("setupSpreadsheetView");

console.log(JSON.stringify(result, null, 2));
