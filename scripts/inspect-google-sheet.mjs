const url = process.argv[2];

if (!url) {
  console.error("Usage: node scripts/inspect-google-sheet.mjs <google-sheet-html-url>");
  process.exit(1);
}

const response = await fetch(url, { redirect: "follow" });
const html = await response.text();

function stripTags(value) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .trim();
}

const sheetButtons = [...html.matchAll(/items\.push\(\{name: "([^"]+)", pageUrl: "([^"]+)", gid: "([^"]+)"/g)]
  .map((match) => ({
    id: match[3],
    name: match[1].replace(/\\"/g, "\""),
    pageUrl: match[2]
      .replace(/\\\//g, "/")
      .replace(/\\x3d/g, "=")
      .replace(/\\x26/g, "&")
  }));

async function readSheet(button) {
  const sheetResponse = await fetch(button.pageUrl, { redirect: "follow" });
  const sheetHtml = await sheetResponse.text();
  const tableHtml = sheetHtml.match(/<table class="waffle"[\s\S]*?<\/table>/)?.[0] || "";
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((rowMatch) => [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => stripTags(cell[1])))
    .map((row) => {
      let last = row.length - 1;
      while (last >= 0 && !row[last]) last -= 1;
      return row.slice(0, last + 1);
    })
    .filter((row) => row.some(Boolean));

  return {
    id: button.id,
    name: button.name,
    rowCount: rows.length,
    columnCount: Math.max(0, ...rows.map((row) => row.length)),
    rows: rows.slice(0, 40)
  };
}

const sheets = [];
for (const button of sheetButtons) {
  sheets.push(await readSheet(button));
}

console.log(JSON.stringify({
  status: response.status,
  title: stripTags(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || ""),
  sheetButtons,
  sheets
}, null, 2));
