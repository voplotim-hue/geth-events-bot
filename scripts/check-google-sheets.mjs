import { loadConfig } from "../src/config.js";
import { loadDotEnv } from "../src/env.js";
import { GoogleSheetsStore } from "../src/google-sheets.js";

loadDotEnv();

const config = loadConfig();
if (!config.googleSheets.enabled) {
  console.log("GOOGLE_SHEETS_ENABLED=false. Fill Google settings in .env first.");
  process.exit(0);
}

const store = new GoogleSheetsStore(config.googleSheets);
const token = await store.getToken();
const metadataResponse = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${config.googleSheets.spreadsheetId}?fields=properties.title,sheets.properties.title`,
  { headers: { authorization: `Bearer ${token}` } }
);
const metadata = await metadataResponse.json();
if (!metadataResponse.ok) {
  throw new Error(metadata?.error?.message || metadataResponse.statusText);
}

const expectedSheets = Object.values(config.googleSheets.sheets);
const actualSheets = metadata.sheets.map((sheet) => sheet.properties.title);
const checks = [];

for (const sheetName of expectedSheets) {
  const exists = actualSheets.includes(sheetName);
  let headers = [];
  if (exists) {
    const table = await store.readTable(sheetName);
    headers = table.headers;
  }
  checks.push({ sheetName, exists, headers });
}

console.log(JSON.stringify({
  title: metadata.properties.title,
  spreadsheetId: config.googleSheets.spreadsheetId,
  sheets: actualSheets,
  checks
}, null, 2));
