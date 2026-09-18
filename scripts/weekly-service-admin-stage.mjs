import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig } from "../src/config.js";
import { loadDotEnv } from "../src/env.js";
import { weeklyPollKeyboard, weeklyServiceId } from "../src/weekly-service.js";

const [stage, dateKey, rowNumber, limit] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) {
  throw new Error("Usage: node scripts/weekly-service-admin-stage.mjs <create|send> <YYYY-MM-DD> [row-number]");
}

loadDotEnv();
const config = loadConfig();

function callAppsScript(action, payload = {}) {
  const output = execFileSync("curl", [
    "-sS",
    "-L",
    "--connect-timeout", "10",
    "--max-time", "60",
    "-H", "content-type: text/plain;charset=utf-8",
    "--data-binary", JSON.stringify({ secret: config.appsScript.secret, action, ...payload }),
    config.appsScript.url
  ], { encoding: "utf8" });
  const response = JSON.parse(output || "{}");
  if (!response?.ok || !Object.prototype.hasOwnProperty.call(response, "result")) {
    throw new Error(`Apps Script ${action} failed: ${response?.error || "invalid response"}`);
  }
  return response.result;
}

function telegram(method, payload) {
  const output = execFileSync("curl", [
    "-sS",
    "--connect-timeout", "10",
    "--max-time", "30",
    "-H", "content-type: application/json",
    "--data-binary", JSON.stringify(payload),
    `https://api.telegram.org/bot${config.telegramToken}/${method}`
  ], { encoding: "utf8" });
  const response = JSON.parse(output || "{}");
  if (!response?.ok) throw new Error(`Telegram ${method} failed: ${response?.description || "invalid response"}`);
  return response.result;
}

const execFileAsync = promisify(execFile);

async function appendAttendance(values) {
  const body = JSON.stringify({
    secret: config.appsScript.secret,
    action: "appendRow",
    sheetName: "Посещаемость служений",
    values
  });
  const { stdout } = await execFileAsync("curl", [
    "-sS",
    "-L",
    "--connect-timeout", "10",
    "--max-time", "60",
    "-H", "content-type: text/plain;charset=utf-8",
    "--data-binary", body,
    config.appsScript.url
  ]);
  const response = JSON.parse(stdout || "{}");
  if (!response?.ok) throw new Error(`Apps Script appendRow failed: ${response?.error || "invalid response"}`);
}

async function updateAttendance(rowNumber, values) {
  const body = JSON.stringify({
    secret: config.appsScript.secret,
    action: "updateRow",
    sheetName: "Посещаемость служений",
    rowNumber,
    values
  });
  const { stdout } = await execFileAsync("curl", [
    "-sS",
    "-L",
    "--connect-timeout", "10",
    "--max-time", "60",
    "-H", "content-type: text/plain;charset=utf-8",
    "--data-binary", body,
    config.appsScript.url
  ]);
  const response = JSON.parse(stdout || "{}");
  if (!response?.ok) throw new Error(`Apps Script updateRow failed: ${response?.error || "invalid response"}`);
}

function isGoing(value) {
  const answer = String(value || "").toLowerCase().replace(/ё/g, "е");
  return !answer.includes("не еду") && !answer.includes("не поед")
    && (answer.includes("еду") || answer.includes("поеду") || answer.includes("записыва"));
}

function isLeader(value) {
  return ["админ", "помощник"].includes(String(value || "").trim().toLowerCase());
}

function outgoingTeenagers() {
  const eventSheet = "Мероприятие - День рождения GethTeens (8 лет) ev_mu04fs45";
  return callAppsScript("readTable", { sheetName: eventSheet }).rows
    .filter((row) => isGoing(row["Ответ"]) && !isLeader(row.role || row["Роль"]))
    .map((row) => ({
      id: String(row.telegram_user_id || row["Telegram ID"] || "").replace(/\.0$/, ""),
      fullName: String(row["ФИ"] || "").trim(),
      username: String(row.username || row.Username || "").trim(),
      role: String(row.role || row["Роль"] || "Участник").trim() || "Участник"
    }))
    .filter((user) => user.id);
}

function attendanceValues(row, patch = {}) {
  const value = (key) => patch[key] ?? row[key] ?? "";
  return [
    value("ID служения"), value("Дата"), value("Telegram ID"), value("ФИО"), value("Username"),
    value("Роль"), value("Группа"), value("Ответ на опрос"), value("Фактически присутствует"),
    value("Источник отметки"), value("Нагрузка лидера"), value("Назначенный лидер ID"),
    value("Назначенный лидер"), value("Время ответа"), value("Обновлено")
  ];
}

const serviceId = weeklyServiceId(dateKey);
if (stage === "inspect") {
  const eventSheet = "Мероприятие - День рождения GethTeens (8 лет) ev_mu04fs45";
  const rows = callAppsScript("readTable", { sheetName: eventSheet }).rows || [];
  const answerKey = Object.keys(rows[0] || {}).find((key) => /ответ/i.test(key)) || "";
  console.log(JSON.stringify({
    rows: rows.length,
    headers: Object.keys(rows[0] || {}),
    answerKey,
    answers: [...new Set(rows.map((row) => String(row[answerKey] || "").trim()).filter(Boolean))]
  }));
} else if (stage === "create") {
  const result = callAppsScript("appendRow", {
    sheetName: "Субботние служения",
    values: [serviceId, dateKey, "scheduled", "", "", new Date().toISOString(), "", ""]
  });
  console.log(JSON.stringify({ created: true, serviceId, rowNumber: result.rowNumber }));
} else if (stage === "send") {
  if (!/^\d+$/.test(rowNumber || "")) throw new Error("A row number is required for send");
  const message = telegram("sendMessage", {
    chat_id: config.leadersGroupChatId,
    text: "Кто завтра будет на выезде на базу?",
    disable_web_page_preview: true,
    reply_markup: weeklyPollKeyboard(serviceId, "leaders")
  });
  callAppsScript("updateRow", {
    sheetName: "Субботние служения",
    rowNumber: Number(rowNumber),
    values: [serviceId, dateKey, "polls_sent", String(message.message_id || ""), "", new Date().toISOString(), "", ""]
  });
  console.log(JSON.stringify({ sent: true, serviceId, leaderMessageId: message.message_id }));
} else if (stage === "seed") {
  const offset = Number(rowNumber || 0);
  const batchLimit = Number(limit || 8);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 12) {
    throw new Error("Seed requires a non-negative offset and a limit from 1 to 12");
  }
  const users = outgoingTeenagers();
  const batch = users.slice(offset, offset + batchLimit);
  await Promise.all(batch.map((user) => appendAttendance([
    serviceId,
    dateKey,
    user.id,
    user.fullName,
    user.username,
    user.role,
    "teenagers",
    "Буду",
    "Да",
    "мероприятие",
    "",
    "",
    "",
    "",
    new Date().toISOString()
  ])));
  console.log(JSON.stringify({ seeded: batch.length, total: users.length, nextOffset: offset + batch.length }));
} else if (stage === "dedupe") {
  const batchLimit = Number(rowNumber || 10);
  if (!Number.isInteger(batchLimit) || batchLimit < 1 || batchLimit > 12) {
    throw new Error("Dedupe requires a limit from 1 to 12");
  }
  const rows = callAppsScript("readTable", { sheetName: "Посещаемость служений" }).rows || [];
  const byUser = new Map();
  const duplicates = [];
  for (const row of rows) {
    if (String(row["ID служения"] || "") !== serviceId || row["Группа"] !== "teenagers") continue;
    const userId = String(row["Telegram ID"] || "").replace(/\.0$/, "");
    if (!userId) continue;
    if (byUser.has(userId)) duplicates.push(row);
    else byUser.set(userId, row);
  }
  const batch = duplicates.slice(0, batchLimit);
  await Promise.all(batch.map((row) => {
    const values = attendanceValues(row, {
      "Группа": "Служебный дубликат",
      "Фактически присутствует": "Нет",
      "Источник отметки": "служебная очистка",
      "Обновлено": new Date().toISOString()
    });
    return updateAttendance(Number(row._rowNumber), values);
  }));
  console.log(JSON.stringify({ cleaned: batch.length, remaining: duplicates.length - batch.length }));
} else if (stage === "cleanup-service-row") {
  if (!/^\d+$/.test(rowNumber || "")) throw new Error("A row number is required for cleanup-service-row");
  callAppsScript("updateRow", {
    sheetName: "Субботние служения",
    rowNumber: Number(rowNumber),
    values: [serviceId, dateKey, "служебный дубликат", "", "", new Date().toISOString(), "", ""]
  });
  console.log(JSON.stringify({ cleaned: true, rowNumber: Number(rowNumber) }));
} else {
  throw new Error(`Unknown stage: ${stage}`);
}
