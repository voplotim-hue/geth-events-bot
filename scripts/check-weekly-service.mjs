import { execFileSync } from "node:child_process";
import { loadConfig } from "../src/config.js";
import { loadDotEnv } from "../src/env.js";

const dateKey = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey || "")) {
  throw new Error("Usage: node scripts/check-weekly-service.mjs <YYYY-MM-DD>");
}

loadDotEnv();
const config = loadConfig();

function readTable(sheetName) {
  const body = JSON.stringify({
    secret: config.appsScript.secret,
    action: "readTable",
    sheetName
  });
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
  if (!response?.ok || !response.result) throw new Error(response?.error || "Apps Script returned no result");
  return response.result.rows || [];
}

const services = readTable("Субботние служения");
const value = (row, key, label) => row?.[key] || row?.[label] || "";
const matchingServices = services.filter((row) => String(value(row, "service_date", "Дата")).startsWith(dateKey));
const service = matchingServices[0];
const serviceId = value(service, "service_id", "ID служения");
const attendance = readTable("Посещаемость служений")
  .filter((row) => String(value(row, "service_id", "ID служения")) === String(serviceId));
const teenagerIds = attendance
  .filter((row) => value(row, "group", "Группа") === "teenagers")
  .map((row) => value(row, "telegram_user_id", "Telegram ID"));
console.log(JSON.stringify({
  service: service ? {
    id: serviceId,
    status: value(service, "status", "Статус"),
    leaderMessageId: value(service, "leader_message_id", "ID сообщения лидеров"),
    teenagerMessageId: value(service, "teenager_message_id", "ID сообщения подростков")
  } : null,
  attendance: {
    total: attendance.length,
    leaders: attendance.filter((row) => value(row, "group", "Группа") === "leaders").length,
    teenagers: attendance.filter((row) => value(row, "group", "Группа") === "teenagers").length,
    actualTeenagers: attendance.filter((row) => value(row, "group", "Группа") === "teenagers" && value(row, "actual_present", "Фактически присутствует") === "Да").length,
    uniqueTeenagers: new Set(teenagerIds).size,
    duplicateTeenagerRows: teenagerIds.length - new Set(teenagerIds).size
  },
  duplicateServiceRows: matchingServices.map((row) => ({
    rowNumber: row._rowNumber,
    status: value(row, "status", "Статус"),
    leaderMessageId: value(row, "leader_message_id", "ID сообщения лидеров")
  }))
}));
