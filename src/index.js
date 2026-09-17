import { Bot } from "./bot.js";
import { startBirthdayScheduler } from "./birthdays.js";
import { loadConfig } from "./config.js";
import { loadDotEnv } from "./env.js";
import { ExcelStore } from "./excel-graph.js";
import { AppsScriptStore } from "./apps-script-store.js";
import { startEventRosterReconciler } from "./event-roster-reconciler.js";
import { GoogleSheetsStore } from "./google-sheets.js";
import { TelegramApi } from "./telegram-api.js";
import { startWeeklyServiceScheduler } from "./weekly-service.js";

loadDotEnv();

const config = loadConfig();
const telegram = new TelegramApi(config.telegramToken);
const store = config.appsScript.enabled
  ? new AppsScriptStore(config.appsScript)
  : config.googleSheets.enabled
    ? new GoogleSheetsStore(config.googleSheets)
    : new ExcelStore(config.excel);

startBirthdayScheduler({ config, store, telegram });
startWeeklyServiceScheduler({ config, store, telegram });
startEventRosterReconciler({ store });

const bot = new Bot({ config, telegram, store });

process.on("SIGINT", () => {
  bot.stopped = true;
  process.exit(0);
});

process.on("SIGTERM", () => {
  bot.stopped = true;
  process.exit(0);
});

await bot.start();
