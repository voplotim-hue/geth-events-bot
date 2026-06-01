import { loadConfig } from "../src/config.js";
import { loadDotEnv } from "../src/env.js";
import { ExcelStore } from "../src/excel-graph.js";

loadDotEnv();

const config = loadConfig();
const store = new ExcelStore(config.excel);

if (!config.excel.workbookPath) {
  console.log("Set EXCEL_WORKBOOK_PATH in .env, then run this script to print EXCEL_ITEM_ID.");
  process.exit(0);
}

const drive = encodeURIComponent(config.excel.driveId);
const path = String(config.excel.workbookPath)
  .replace(/^\/+/, "")
  .split("/")
  .map(encodeURIComponent)
  .join("/");

const item = await store.graph(`/drives/${drive}/root:/${path}:`);

console.log(`EXCEL_ITEM_ID=${item.id}`);
console.log(`name=${item.name}`);
console.log(`webUrl=${item.webUrl}`);
