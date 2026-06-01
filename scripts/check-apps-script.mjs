import { AppsScriptStore } from "../src/apps-script-store.js";
import { loadConfig } from "../src/config.js";
import { loadDotEnv } from "../src/env.js";

loadDotEnv();

const config = loadConfig();
if (!config.appsScript.enabled) {
  console.log("GOOGLE_APPS_SCRIPT_ENABLED=false. Deploy Apps Script and fill GOOGLE_APPS_SCRIPT_URL first.");
  process.exit(0);
}

const store = new AppsScriptStore(config.appsScript);
const checks = [];

for (const sheetName of Object.values(config.appsScript.sheets)) {
  try {
    const table = await store.readTable(sheetName);
    checks.push({
      sheetName,
      ok: true,
      headers: table.headers,
      rowCount: table.rows.length
    });
  } catch (error) {
    checks.push({
      sheetName,
      ok: false,
      error: error.message
    });
  }
}

console.log(JSON.stringify({ checks }, null, 2));
