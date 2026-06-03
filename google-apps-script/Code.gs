// Replace this value in Google Apps Script with GOOGLE_APPS_SCRIPT_SECRET from your .env.
// Do not commit the real secret to GitHub.
const BOT_SECRET = 'replace_with_GOOGLE_APPS_SCRIPT_SECRET';

const USERS_SHEET_NAME = 'Users';
const ROLE_HEADER = 'Роль';
const ROLE_VALUES = ['Участник', 'Помощник', 'Админ'];

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

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('GethEvents')
    .addItem('Назначить помощником', 'assignAssistantRole')
    .addItem('Сделать участником', 'assignParticipantRole')
    .addItem('Назначить админом в таблице', 'assignAdminRole')
    .addSeparator()
    .addItem('Подготовить колонку «Роль»', 'prepareRoleColumn')
    .addToUi();
}

function roleColumnIndex(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map((header) => String(header || '').trim());
  const index = headers.indexOf(ROLE_HEADER);
  return index === -1 ? 0 : index + 1;
}

function prepareRoleColumn() {
  const sheet = sheetByName(USERS_SHEET_NAME);
  let column = roleColumnIndex(sheet);
  if (!column) {
    column = sheet.getLastColumn() + 1;
    sheet.getRange(1, column).setValue(ROLE_HEADER);
  }

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(ROLE_VALUES, true)
    .setAllowInvalid(false)
    .build();

  sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  sheet.getRange(1, column).setFontWeight('bold');
  return column;
}

function setSelectedUsersRole(role) {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== USERS_SHEET_NAME) {
    SpreadsheetApp.getUi().alert('Откройте лист Users и выделите строки анкет.');
    return;
  }

  const roleColumn = prepareRoleColumn();
  const range = sheet.getActiveRange();
  if (!range || range.getRow() === 1 && range.getNumRows() === 1) {
    SpreadsheetApp.getUi().alert('Выделите одну или несколько строк пользователей ниже заголовка.');
    return;
  }

  const startRow = Math.max(range.getRow(), 2);
  const endRow = range.getLastRow();
  if (endRow < 2) {
    SpreadsheetApp.getUi().alert('Выделите строки пользователей ниже заголовка.');
    return;
  }

  sheet.getRange(startRow, roleColumn, endRow - startRow + 1, 1)
    .setValues(Array.from({ length: endRow - startRow + 1 }, () => [role]));
}

function assignAssistantRole() {
  setSelectedUsersRole('Помощник');
}

function assignParticipantRole() {
  setSelectedUsersRole('Участник');
}

function assignAdminRole() {
  setSelectedUsersRole('Админ');
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
