// Replace this value in Google Apps Script with GOOGLE_APPS_SCRIPT_SECRET from your .env.
// Do not commit the real secret to GitHub.
const BOT_SECRET = 'replace_with_GOOGLE_APPS_SCRIPT_SECRET';

const USERS_SHEET_NAME = 'Users';
const ROLE_HEADER = 'Роль';
const ROLE_VALUES = ['Участник', 'Помощник', 'Админ', 'Гость'];
const SHEET_DISPLAY_HEADERS = {
  Users: [
    'Telegram ID',
    'Username',
    'Фамилия',
    'Имя',
    'Отчество',
    'Дата рождения',
    'Церковь',
    'Пол',
    'Согласие родителей',
    'Справка',
    'ID личного чата',
    'Активен',
    'Заметки',
    'Обновлено',
    'Роль'
  ],
  Events: [
    'ID мероприятия',
    'Название',
    'Даты',
    'Описание',
    'Варианты ответа',
    'Статус',
    'ID группы',
    'ID сообщения',
    'Создано',
    'Обновлено'
  ],
  Registrations: [
    'ID мероприятия',
    'Мероприятие',
    'Telegram ID',
    'Username',
    'ФИО',
    'Ответ',
    'Предыдущий ответ',
    'Пометка изменения',
    'Время ответа',
    'ID сообщения',
    'Обновлено'
  ],
  EventRoster: [
    'ID мероприятия',
    'ФИ',
    'Сдал',
    'Церковь',
    'Дата рождения',
    'Примечание',
    'Пол',
    'Согласие родителей',
    'Справка',
    'Ответ',
    'Статус решения',
    'Username',
    'Telegram ID',
    'Время ответа',
    'Роль'
  ],
  BirthdayLog: [
    'Дата',
    'Telegram ID',
    'Username',
    'ФИО',
    'Текст поздравления',
    'Статус согласования',
    'Отправлено в ЛС',
    'Отправлено в группу',
    'Согласовал',
    'Время согласования',
    'Время отправки',
    'Заметки'
  ],
  BirthdayTemplates: [
    'Место Писания',
    'Стих',
    'Пожелание',
    'Активен'
  ]
};
const ROLE_STYLES = {
  'Админ': {
    rank: 1,
    background: '#fce4d6',
    fontColor: '#9c2f1a'
  },
  'Помощник': {
    rank: 2,
    background: '#fff2cc',
    fontColor: '#7f6000'
  },
  'Участник': {
    rank: 3,
    background: '#ffffff',
    fontColor: '#202124'
  },
  'Гость': {
    rank: 4,
    background: '#eef2f7',
    fontColor: '#5f6368'
  },
  '': {
    rank: 5,
    background: '#ffffff',
    fontColor: '#202124'
  }
};

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
    .addItem('Назначить гостем', 'assignGuestRole')
    .addItem('Назначить админом в таблице', 'assignAdminRole')
    .addSeparator()
    .addItem('Настроить русский вид таблицы', 'setupSpreadsheetView')
    .addItem('Обновить порядок и цвета ролей', 'applyUsersRoleView')
    .addToUi();
}

function onEdit(e) {
  const sheet = e && e.range ? e.range.getSheet() : null;
  if (!sheet || sheet.getName() !== USERS_SHEET_NAME) return;

  const roleColumn = roleColumnIndex(sheet);
  if (!roleColumn) return;

  const edited = e.range;
  const touchesRoleColumn = edited.getColumn() <= roleColumn && edited.getLastColumn() >= roleColumn;
  if (edited.getRow() > 1 && touchesRoleColumn) {
    applyUsersRoleView();
  }
}

function roleColumnIndex(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map((header) => String(header || '').trim());
  const index = headers.findIndex((header) => header === ROLE_HEADER || header === 'role');
  return index === -1 ? 0 : index + 1;
}

function applyHeaderStyle(sheet) {
  sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .setFontWeight('bold')
    .setBackground('#0f6b85')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

function setupSheetHeaders() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  Object.entries(SHEET_DISPLAY_HEADERS).forEach(([sheetName, headers]) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    applyHeaderStyle(sheet);
  });
}

function setupSpreadsheetView() {
  setupSheetHeaders();
  applyUsersRoleView();
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
  applyHeaderStyle(sheet);
  return column;
}

function roleRank(value) {
  return (ROLE_STYLES[String(value || '').trim()] || ROLE_STYLES['']).rank;
}

function roleStyle(value) {
  return ROLE_STYLES[String(value || '').trim()] || ROLE_STYLES[''];
}

function applyRoleColors(sheet, roleColumn) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) return;

  const roleValues = sheet.getRange(2, roleColumn, lastRow - 1, 1).getValues();
  const backgrounds = [];
  const fontColors = [];

  roleValues.forEach(([role]) => {
    const style = roleStyle(role);
    backgrounds.push(Array.from({ length: lastColumn }, () => style.background));
    fontColors.push(Array.from({ length: lastColumn }, () => style.fontColor));
  });

  sheet.getRange(2, 1, lastRow - 1, lastColumn)
    .setBackgrounds(backgrounds)
    .setFontColors(fontColors);
}

function applyUsersRoleView() {
  const sheet = sheetByName(USERS_SHEET_NAME);
  const roleColumn = prepareRoleColumn();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2) {
    applyRoleColors(sheet, roleColumn);
    return;
  }

  const range = sheet.getRange(2, 1, lastRow - 1, lastColumn);
  const rows = range.getValues();
  const nonEmptyRows = rows.filter((row) => row.some((cell) => cell !== ''));

  nonEmptyRows.sort((a, b) => {
    const rankDiff = roleRank(a[roleColumn - 1]) - roleRank(b[roleColumn - 1]);
    if (rankDiff) return rankDiff;
    const aName = [a[2], a[3], a[4]].filter(Boolean).join(' ');
    const bName = [b[2], b[3], b[4]].filter(Boolean).join(' ');
    return String(aName || a[1] || '').localeCompare(String(bName || b[1] || ''), 'ru');
  });

  range.clearContent();
  if (nonEmptyRows.length) {
    sheet.getRange(2, 1, nonEmptyRows.length, lastColumn).setValues(nonEmptyRows);
  }

  applyRoleColors(sheet, roleColumn);
  sheet.setFrozenRows(1);
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
  applyUsersRoleView();
}

function assignAssistantRole() {
  setSelectedUsersRole('Помощник');
}

function assignParticipantRole() {
  setSelectedUsersRole('Участник');
}

function assignGuestRole() {
  setSelectedUsersRole('Гость');
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
  if (sheetName === USERS_SHEET_NAME) {
    applyUsersRoleView();
  }
  return { rowNumber: sheet.getLastRow() };
}

function updateRow(sheetName, rowNumber, values) {
  const sheet = sheetByName(sheetName);
  sheet.getRange(Number(rowNumber), 1, 1, values.length).setValues([values]);
  if (sheetName === USERS_SHEET_NAME) {
    applyUsersRoleView();
  }
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

    if (body.action === 'applyRoleView') {
      applyUsersRoleView();
      return jsonResponse({ ok: true, result: { applied: true } });
    }

    if (body.action === 'setupSpreadsheetView') {
      setupSpreadsheetView();
      return jsonResponse({ ok: true, result: { applied: true } });
    }

    return fail(`Unknown action: ${body.action}`);
  } catch (error) {
    return fail(error.message || error);
  }
}

function doGet() {
  return jsonResponse({ ok: true, service: 'GethEvents bot bridge' });
}
