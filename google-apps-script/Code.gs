// Replace this value in Google Apps Script with GOOGLE_APPS_SCRIPT_SECRET from your .env.
// Do not commit the real secret to GitHub.
const BOT_SECRET = 'replace_with_GOOGLE_APPS_SCRIPT_SECRET';

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function fail(message) {
  return jsonResponse({ ok: false, error: String(message) });
}

function sheetByName(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error(`Sheet not found: ${name}`);
  }
  return sheet;
}

function readTable(sheetName) {
  const sheet = sheetByName(sheetName);
  const values = sheet.getDataRange().getValues();
  const headers = (values[0] || []).map((header) => String(header || '').trim());
  const rows = values.slice(1)
    .map((raw, index) => {
      const row = { _rowNumber: index + 2 };
      headers.forEach((header, columnIndex) => {
        row[header] = raw[columnIndex] === null ? '' : raw[columnIndex];
      });
      return row;
    })
    .filter((row) => headers.some((header) => row[header] !== ''));

  return { headers, rows };
}

function appendRow(sheetName, values) {
  const sheet = sheetByName(sheetName);
  sheet.appendRow(values);
  return { rowNumber: sheet.getLastRow() };
}

function updateRow(sheetName, rowNumber, values) {
  const sheet = sheetByName(sheetName);
  sheet.getRange(Number(rowNumber), 1, 1, values.length).setValues([values]);
  return { rowNumber: Number(rowNumber) };
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData && e.postData.contents ? e.postData.contents : '{}');
    if (body.secret !== BOT_SECRET) {
      return fail('Unauthorized');
    }

    if (body.action === 'readTable') {
      return jsonResponse({ ok: true, result: readTable(body.sheetName) });
    }

    if (body.action === 'appendRow') {
      return jsonResponse({ ok: true, result: appendRow(body.sheetName, body.values || []) });
    }

    if (body.action === 'updateRow') {
      return jsonResponse({ ok: true, result: updateRow(body.sheetName, body.rowNumber, body.values || []) });
    }

    return fail(`Unknown action: ${body.action}`);
  } catch (error) {
    return fail(error.message || error);
  }
}

function doGet() {
  return jsonResponse({ ok: true, service: 'GethEvents bot bridge' });
}
