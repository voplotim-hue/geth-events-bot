import { AppsScriptStore } from "../src/apps-script-store.js";
import { execFileSync } from "node:child_process";
import { loadConfig } from "../src/config.js";
import { loadDotEnv } from "../src/env.js";
import { TelegramApi } from "../src/telegram-api.js";
import { weeklyPollKeyboard, weeklyServiceId } from "../src/weekly-service.js";

const [eventId, dateKey] = process.argv.slice(2);
if (!eventId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) {
  throw new Error("Usage: node scripts/launch-leader-only-event-poll.mjs <event-id> <YYYY-MM-DD>");
}

function eventRosterSheetName(event) {
  const title = String(event.title || "Мероприятие")
    .replace(/[\[\]*?/\\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Мероприятие";
  return `Мероприятие - ${title} ${event.event_id}`;
}

function normalizedAnswer(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[!.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGoing(value) {
  const answer = normalizedAnswer(value);
  return Boolean(answer)
    && !answer.includes("не еду")
    && !answer.includes("не поед")
    && (answer.includes("еду") || answer.includes("поеду") || answer.includes("записыва") || answer === "буду");
}

function isLeader(role) {
  return ["Админ", "Помощник"].includes(String(role || "").trim());
}

function userFromRoster(row) {
  const parts = String(row["ФИ"] || "").trim().split(/\s+/).filter(Boolean);
  return {
    telegram_user_id: String(row.telegram_user_id || "").replace(/\.0$/, ""),
    username: row.username || "",
    last_name: parts[0] || "",
    first_name: parts[1] || "",
    middle_name: parts.slice(2).join(" "),
    role: row.role || "Участник"
  };
}

loadDotEnv();
const config = loadConfig();
const store = new AppsScriptStore(config.appsScript);
const telegram = new TelegramApi(config.telegramToken);

// Use curl only for a one-off recovery when the local Node HTTPS client cannot reach Apps Script.
if (process.env.APPS_SCRIPT_CURL_FALLBACK === "1") {
  store.request = async (action, payload = {}) => {
    const body = JSON.stringify({ secret: config.appsScript.secret, action, ...payload });
    const output = execFileSync("curl", [
      "-sS",
      "-L",
      "--connect-timeout", "10",
      "--max-time", "60",
      "-H", "content-type: text/plain;charset=utf-8",
      "--data-binary", body,
      config.appsScript.url
    ], { encoding: "utf8" });
    const response = JSON.parse(output || "{}");
    if (!response?.ok || !Object.prototype.hasOwnProperty.call(response, "result")) {
      throw new Error(`Apps Script ${action} failed: ${response?.error || "invalid response"}`);
    }
    return response.result;
  };

  telegram.request = async (method, payload = {}) => {
    const output = execFileSync("curl", [
      "-sS",
      "--connect-timeout", "10",
      "--max-time", "30",
      "-H", "content-type: application/json",
      "--data-binary", JSON.stringify(payload),
      `${telegram.baseUrl}/${method}`
    ], { encoding: "utf8" });
    const response = JSON.parse(output || "{}");
    if (!response?.ok) {
      throw new Error(`Telegram ${method} failed: ${response?.description || "invalid response"}`);
    }
    return response.result;
  };
}
const { rows: eventRows } = await store.readTable(config.appsScript.sheets.events);
const event = (eventRows || []).find((row) => String(row.event_id) === String(eventId));
if (!event) {
  const available = (eventRows || []).map((row) => ({
    event_id: row.event_id,
    title: row.title,
    dates: row.dates,
    status: row.status
  }));
  throw new Error(`Event not found: ${eventId}. Available: ${JSON.stringify(available)}`);
}
if (!config.leadersGroupChatId) throw new Error("LEADERS_GROUP_CHAT_ID is not configured");

let service = await store.getWeeklyServiceByDate(dateKey);
const leaderPollAlreadySent = Boolean(service?.leader_message_id);
if (String(service?.status || "") === "cancelled") {
  throw new Error(`Service ${dateKey} is cancelled`);
}
if (!service) {
  service = await store.createWeeklyService({
    serviceId: weeklyServiceId(dateKey),
    dateKey,
    status: "scheduled"
  });
}

const roster = await store.readTable(eventRosterSheetName(event));
const teenagers = (roster.rows || [])
  .filter((row) => isGoing(row["Ответ"]) && !isLeader(row.role))
  .map(userFromRoster)
  .filter((user) => user.telegram_user_id);
const uniqueTeenagers = [...new Map(teenagers.map((user) => [user.telegram_user_id, user])).values()];

let leaderMessageId = service.leader_message_id || "";
if (!leaderPollAlreadySent) {
  const leaderMessage = await telegram.sendMessage(
    config.leadersGroupChatId,
    "Кто завтра будет на выезде на базу?",
    { reply_markup: weeklyPollKeyboard(service.service_id, "leaders") }
  );
  leaderMessageId = String(leaderMessage.message_id || "");
  service = await store.updateWeeklyService(service.service_id, {
    status: "polls_sent",
    leader_message_id: leaderMessageId,
    teenager_message_id: ""
  });
}
const seeded = await store.seedWeeklyTeenAttendance({ service, users: uniqueTeenagers });
console.log(JSON.stringify({
  sent: !leaderPollAlreadySent,
  serviceId: service.service_id,
  leaderMessageId,
  teenagers: uniqueTeenagers.length,
  seeded
}));
