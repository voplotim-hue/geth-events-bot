// Replace this value in Google Apps Script with GOOGLE_APPS_SCRIPT_SECRET from your .env.
// Do not commit the real secret to GitHub.
const BOT_SECRET = 'replace_with_GOOGLE_APPS_SCRIPT_SECRET';

const USERS_SHEET_NAME = 'Users';
const PROGRAM_POLLS_SHEET_NAME = 'ProgramPolls';
const PROGRAM_VOTES_SHEET_NAME = 'Программа мероприятия';
const EVENT_BROADCASTS_SHEET_NAME = 'EventBroadcasts';
const WEEKLY_SERVICE_SHEET_NAME = 'Субботние служения';
const WEEKLY_ATTENDANCE_SHEET_NAME = 'Посещаемость служений';
const PASTORAL_SPREADSHEET_PROPERTY = 'GETH_PASTORAL_SPREADSHEET_ID';
const PASTORAL_SHEET_NAME = 'Заметки';
const ROLE_HEADER = 'Роль';
const ROLE_VALUES = ['Участник', 'Помощник', 'Админ', 'Гость'];
const SHEET_DISPLAY_HEADERS = {
  Users: [
    'Telegram ID',
    'Username',
    'Фамилия',
    'Имя',
    'Отчество',
    'Роль',
    'Дата рождения',
    'Церковь',
    'Пол',
    'Согласие родителей',
    'Справка',
    'ID личного чата',
    'Активен',
    'Заметки',
    'Обновлено'
  ],
  Events: [
    'ID мероприятия',
    'Название',
    'Даты',
    'Описание',
    'Варианты ответа',
    'Фото Telegram file_id',
    'Аудитория',
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
    'Оплата',
    'Комментарий',
    'Церковь',
    'Дата рождения',
    'Примечание',
    'Пол',
    'Согласие родителей',
    'Ответ',
    'Статус решения',
    'Username',
    'Telegram ID',
    'Время ответа',
    'Роль'
  ],
  ProgramPolls: [
    'ID программы',
    'ID мероприятия',
    'Мероприятие',
    'Заголовок',
    'Текст',
    'Варианты',
    'Фото Telegram file_id',
    'Статус',
    'Создал',
    'Создано',
    'Согласовал',
    'Время согласования',
    'Получателей',
    'Отправлено',
    'Ошибок',
    'Заметки'
  ],
  [PROGRAM_VOTES_SHEET_NAME]: [
    'ФИО',
    'Мероприятие',
    'Опрос',
    'Ответ регистрации',
    'Выбор программы',
    'Предыдущий выбор',
    'Статус решения',
    'Время ответа',
    'Церковь',
    'ID программы',
    'ID мероприятия',
    'Telegram ID',
    'Username',
    'Роль'
  ],
  EventBroadcasts: [
    'ID рассылки',
    'ID мероприятия',
    'Мероприятие',
    'Тип',
    'Текст',
    'Фото Telegram file_id',
    'Статус',
    'Создал',
    'Создано',
    'Согласовал',
    'Время согласования',
    'Получателей',
    'Отправлено',
    'Ошибок',
    'Заметки'
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
  ],
  [WEEKLY_SERVICE_SHEET_NAME]: [
    'ID служения',
    'Дата',
    'Статус',
    'ID сообщения лидеров',
    'ID сообщения подростков',
    'Создано',
    'Отменено',
    'Распределено'
  ],
  [WEEKLY_ATTENDANCE_SHEET_NAME]: [
    'ID служения',
    'Дата',
    'Telegram ID',
    'ФИО',
    'Username',
    'Роль',
    'Группа',
    'Ответ на опрос',
    'Фактически присутствует',
    'Источник отметки',
    'Нагрузка лидера',
    'Назначенный лидер ID',
    'Назначенный лидер',
    'Время ответа',
    'Обновлено'
  ]
};
const USER_HEADER_ALIASES = {
  telegram_user_id: 'Telegram ID',
  username: 'Username',
  last_name: 'Фамилия',
  first_name: 'Имя',
  middle_name: 'Отчество',
  role: 'Роль',
  birth_date: 'Дата рождения',
  church: 'Церковь',
  gender: 'Пол',
  parent_consent: 'Согласие родителей',
  medical_certificate: 'Справка',
  private_chat_id: 'ID личного чата',
  is_active: 'Активен',
  notes: 'Заметки',
  updated_at: 'Обновлено'
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
const DECISION_CHANGED_TEXT = 'изменил решение';
const DECISION_CHANGED_ROW_BACKGROUND = '#fde7e9';
const DECISION_CHANGED_CELL_BACKGROUND = '#d93025';
const DECISION_CHANGED_CELL_FONT = '#ffffff';
const EVENT_ROSTER_SUMMARY_LABELS = [
  'Сводка',
  'Всего людей',
  'Всего помощников',
  'Всего подростков',
  'Парней',
  'Девочек',
  'Лидеров мужчин',
  'Лидеров женщин',
  'Итоговая сумма'
];
const PROGRAM_OPTION_COLORS = [
  '#d9ead3',
  '#cfe2f3',
  '#fff2cc',
  '#eadcf8',
  '#fce4d6',
  '#d9ead3',
  '#f4cccc',
  '#d0e0e3'
];

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
    .addItem('Подсветить изменения решений', 'applyAllEventRosterHighlights')
    .addItem('Обновить даты рождения в мероприятиях', 'syncEventRosterBirthDates')
    .addItem('Настроить программу мероприятий', 'ensureProgramSheets')
    .addToUi();
}

function onEdit(e) {
  const sheet = e && e.range ? e.range.getSheet() : null;
  if (!sheet || sheet.getName() !== USERS_SHEET_NAME) return;

  const roleColumn = roleColumnIndex(sheet);
  const edited = e.range;
  const touchesRoleColumn = roleColumn
    && edited.getColumn() <= roleColumn
    && edited.getLastColumn() >= roleColumn;
  if (edited.getRow() > 1 && touchesRoleColumn) {
    applyUsersRoleView();
  }

  const birthDateColumn = headerIndex(sheet, 'Дата рождения');
  const touchesBirthDateColumn = birthDateColumn
    && edited.getColumn() <= birthDateColumn
    && edited.getLastColumn() >= birthDateColumn;
  if (!touchesBirthDateColumn || edited.getLastRow() < 2) return;

  const telegramIdColumn = headerIndex(sheet, 'Telegram ID') || headerIndex(sheet, 'telegram_user_id');
  if (!telegramIdColumn) return;
  const firstRow = Math.max(edited.getRow(), 2);
  const userIds = sheet.getRange(firstRow, telegramIdColumn, edited.getLastRow() - firstRow + 1, 1)
    .getValues()
    .map((row) => row[0]);
  syncEventRosterBirthDates(userIds);
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

function headerIndex(sheet, headerName) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map((header) => String(header || '').trim());
  return headers.findIndex((header) => header === headerName) + 1;
}

function applyDateColumnFormat(sheet, headerName) {
  const column = headerIndex(sheet, headerName);
  if (!column) return;

  sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1)
    .setNumberFormat('dd.mm.yyyy');
}

function columnLetter(index) {
  let letter = '';
  let n = index;
  while (n > 0) {
    const mod = (n - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    n = Math.floor((n - mod) / 26);
  }
  return letter;
}

function applyPaymentColumnFormat(sheet) {
  const column = headerIndex(sheet, 'Оплата');
  if (!column) return;

  sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1)
    .setNumberFormat('# ##0');
}

function applyEventRosterSummary(sheet) {
  const paymentColumn = headerIndex(sheet, 'Оплата');
  const roleColumn = headerIndex(sheet, 'Роль') || headerIndex(sheet, 'role');
  const genderColumn = headerIndex(sheet, 'Пол');
  const nameColumn = headerIndex(sheet, 'ФИ');
  const answerColumn = headerIndex(sheet, 'Ответ');
  if (!paymentColumn || !roleColumn || !genderColumn || !nameColumn || !answerColumn) return;

  const paymentLetter = columnLetter(paymentColumn);
  const roleLetter = columnLetter(roleColumn);
  const genderLetter = columnLetter(genderColumn);
  const nameLetter = columnLetter(nameColumn);
  const answerLetter = columnLetter(answerColumn);
  const dataLastRow = eventRosterDataLastRow(sheet);
  const formulaLastRow = Math.max(2, dataLastRow);
  const summaryRow = Math.max(3, dataLastRow + 2);

  const paymentRange = `$${paymentLetter}$2:$${paymentLetter}$${formulaLastRow}`;
  const roleRange = `$${roleLetter}$2:$${roleLetter}$${formulaLastRow}`;
  const genderRange = `$${genderLetter}$2:$${genderLetter}$${formulaLastRow}`;
  const nameRange = `$${nameLetter}$2:$${nameLetter}$${formulaLastRow}`;
  const answerRange = `$${answerLetter}$2:$${answerLetter}$${formulaLastRow}`;
  const maleRegex = 'муж|пар|маль|male|boy';
  const femaleRegex = 'жен|дев|female|girl';
  const leaderRegex = 'админ|помощник';
  const goingAnswerRegex = 'записыва|(^|\\s)(еду|поеду|буду)(\\s|$)';
  const notGoingAnswerRegex = 'не еду|не поед|не буду|пока не знаю|не знаю|думаю|нет|no';
  const goingAnswerMask = `--REGEXMATCH(LOWER(${answerRange});"${goingAnswerRegex}");--(REGEXMATCH(LOWER(${answerRange});"${notGoingAnswerRegex}")=FALSE)`;

  const values = [
    ['Сводка', ''],
    ['Всего людей', `=SUMPRODUCT(${goingAnswerMask};--(${nameRange}<>""))`],
    ['Всего помощников', `=SUMPRODUCT(${goingAnswerMask};--REGEXMATCH(LOWER(${roleRange});"^помощник$"))`],
    ['Всего подростков', `=SUMPRODUCT(${goingAnswerMask};--REGEXMATCH(LOWER(${roleRange});"^участник$"))`],
    ['Парней', `=SUMPRODUCT(${goingAnswerMask};--REGEXMATCH(LOWER(${roleRange});"^участник$");--REGEXMATCH(LOWER(${genderRange});"${maleRegex}"))`],
    ['Девочек', `=SUMPRODUCT(${goingAnswerMask};--REGEXMATCH(LOWER(${roleRange});"^участник$");--REGEXMATCH(LOWER(${genderRange});"${femaleRegex}"))`],
    ['Лидеров мужчин', `=SUMPRODUCT(${goingAnswerMask};--REGEXMATCH(LOWER(${roleRange});"${leaderRegex}");--REGEXMATCH(LOWER(${genderRange});"${maleRegex}"))`],
    ['Лидеров женщин', `=SUMPRODUCT(${goingAnswerMask};--REGEXMATCH(LOWER(${roleRange});"${leaderRegex}");--REGEXMATCH(LOWER(${genderRange});"${femaleRegex}"))`],
    ['Итоговая сумма', `=SUMPRODUCT(${goingAnswerMask};N(${paymentRange}))`]
  ];

  const range = sheet.getRange(summaryRow, 2, values.length, 2);
  range.setValues(values)
    .setFontWeight('bold')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#ffffff', SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange(summaryRow, 2, 1, 2).setBackground('#0f6b85').setFontColor('#ffffff');
  sheet.getRange(summaryRow + 1, 2, 3, 2).setBackground('#e0f2fe').setFontColor('#0f172a');
  sheet.getRange(summaryRow + 4, 2, 2, 2).setBackground('#dcfce7').setFontColor('#14532d');
  sheet.getRange(summaryRow + 6, 2, 2, 2).setBackground('#fef3c7').setFontColor('#78350f');
  sheet.getRange(summaryRow + 8, 2, 1, 2).setBackground('#0f766e').setFontColor('#ffffff');
  sheet.getRange(summaryRow + 1, 3, values.length - 1, 1).setNumberFormat('# ##0');
  sheet.getRange(summaryRow, 2, values.length, 2).setHorizontalAlignment('left');
  sheet.getRange(summaryRow, 3, values.length, 1).setHorizontalAlignment('right');
  sheet.autoResizeColumns(2, 2);
}

function clearEventRosterSummary(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  sheet.getRange(1, SHEET_DISPLAY_HEADERS.EventRoster.length + 1, 1, 8).clearContent().clearFormat();

  if (lastRow < 2) return;

  const firstColumnValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const secondColumnValues = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
  firstColumnValues.forEach(([value], index) => {
    const firstText = String(value || '').trim();
    const secondText = String((secondColumnValues[index] || [])[0] || '').trim();
    if (['Бюджет', 'Сводка'].includes(firstText) || EVENT_ROSTER_SUMMARY_LABELS.includes(secondText)) {
      sheet.getRange(index + 2, 1, 1, 20).clearContent().clearFormat();
    }
  });
}

function isEventRosterSummaryRow(row) {
  const firstText = String(row['ID мероприятия'] || row.event_id || '').trim();
  const secondText = String(row['ФИ'] || row['ФИО'] || '').trim();
  return ['Бюджет', 'Сводка'].includes(firstText) || EVENT_ROSTER_SUMMARY_LABELS.includes(secondText);
}

function eventRosterDataLastRow(sheet) {
  const lastRow = sheet.getLastRow();
  const dataWidth = SHEET_DISPLAY_HEADERS.EventRoster.length;
  if (lastRow < 2) return 1;

  const values = sheet.getRange(2, 1, lastRow - 1, dataWidth).getValues();
  let result = 1;
  values.forEach((row, index) => {
    const marker = String(row[0] || '').trim();
    if (['Бюджет', 'Сводка'].includes(marker)) return;
    if (EVENT_ROSTER_SUMMARY_LABELS.includes(String(row[1] || '').trim())) return;
    if (row[0] || row[1] || row[9] || row[11] || row[12]) {
      result = index + 2;
    }
  });
  return result;
}

function normalizeSortText(value) {
  return String(value || '')
    .replace(/ё/g, 'е')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compareSortText(a, b) {
  return normalizeSortText(a).localeCompare(normalizeSortText(b), 'ru');
}

function sortEventRosterDataRows(sheet) {
  const lastRow = sheet.getLastRow();
  const dataWidth = SHEET_DISPLAY_HEADERS.EventRoster.length;
  if (lastRow < 3) return;

  const headers = SHEET_DISPLAY_HEADERS.EventRoster;
  const roleIndex = headers.indexOf('Роль');
  const nameIndex = headers.indexOf('ФИ');
  const eventIdIndex = headers.indexOf('ID мероприятия');
  const usernameIndex = headers.indexOf('Username');
  const dataRange = sheet.getRange(2, 1, lastRow - 1, dataWidth);
  const values = dataRange.getValues();
  const dataRows = values.filter((row) => {
    const marker = String(row[0] || '').trim();
    if (['Бюджет', 'Сводка'].includes(marker)) return false;
    if (EVENT_ROSTER_SUMMARY_LABELS.includes(String(row[1] || '').trim())) return false;
    return row.some((cell) => cell !== '') && rowLooksLikeEventRosterData(row, headers);
  });

  dataRows.sort((a, b) => {
    if (sheet.getName() === 'EventRoster') {
      const eventDiff = compareSortText(a[eventIdIndex], b[eventIdIndex]);
      if (eventDiff) return eventDiff;
    }

    const roleDiff = roleRank(a[roleIndex]) - roleRank(b[roleIndex]);
    if (roleDiff) return roleDiff;

    const nameDiff = compareSortText(a[nameIndex], b[nameIndex]);
    if (nameDiff) return nameDiff;

    return compareSortText(a[usernameIndex], b[usernameIndex]);
  });

  dataRange.clearContent();
  if (dataRows.length) {
    sheet.getRange(2, 1, dataRows.length, dataWidth).setValues(dataRows);
  }
}

function applyEventRosterFilter(sheet) {
  const dataWidth = SHEET_DISPLAY_HEADERS.EventRoster.length;
  const dataLastRow = eventRosterDataLastRow(sheet);
  try {
    const existingFilter = sheet.getFilter();
    if (existingFilter) {
      existingFilter.remove();
    }
  } catch (error) {
    console.warn(`Could not remove existing filter on ${sheet.getName()}: ${error.message || error}`);
  }

  if (dataLastRow < 2) return;
  try {
    sheet.getRange(1, 1, dataLastRow, dataWidth).createFilter();
  } catch (error) {
    const message = String(error.message || error);
    if (!/only one filter|только один фильтр/i.test(message)) {
      throw error;
    }
    console.warn(`Could not recreate filter on ${sheet.getName()}: ${message}`);
  }
}

function applyEventRosterSheetStyle(sheet) {
  clearEventRosterSummary(sheet);
  sortEventRosterDataRows(sheet);
  applyHeaderStyle(sheet);
  applyDateColumnFormat(sheet, 'Дата рождения');
  applyPaymentColumnFormat(sheet);
  sheet.setFrozenColumns(3);
  sheet.autoResizeColumns(1, Math.max(sheet.getLastColumn(), 1));
  applyEventRosterHiddenColumns(sheet);
  applyDecisionChangeHighlights(sheet);
  applyEventRosterFilter(sheet);
  applyEventRosterSummary(sheet);
}

function applyEventRosterHiddenColumns(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn > 0) {
    sheet.showColumns(1, lastColumn);
  }

  ['ID мероприятия', 'Telegram ID', 'Примечание', 'Пол'].forEach((header) => {
    const column = headerIndex(sheet, header);
    if (column) {
      sheet.hideColumns(column);
    }
  });
}

function isEventRosterSheetName(sheetName) {
  return sheetName === 'EventRoster' || String(sheetName || '').startsWith('Мероприятие - ');
}

function eventRosterHeaderIndex(sheet, headerName) {
  return headerIndex(sheet, headerName);
}

function applyDecisionChangeHighlights(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return;

  const statusColumn = eventRosterHeaderIndex(sheet, 'Статус решения');
  if (!statusColumn) return;

  const statusRange = sheet.getRange(2, statusColumn, lastRow - 1, 1);
  const statuses = statusRange.getValues();
  const rowBackgrounds = [];
  const statusBackgrounds = [];
  const statusFontColors = [];
  const statusFontWeights = [];

  statuses.forEach(([status]) => {
    const changed = String(status || '').trim().toLowerCase() === DECISION_CHANGED_TEXT;
    rowBackgrounds.push(Array.from({ length: lastColumn }, () => changed ? DECISION_CHANGED_ROW_BACKGROUND : '#ffffff'));
    statusBackgrounds.push([changed ? DECISION_CHANGED_CELL_BACKGROUND : '#ffffff']);
    statusFontColors.push([changed ? DECISION_CHANGED_CELL_FONT : '#202124']);
    statusFontWeights.push([changed ? 'bold' : 'normal']);
  });

  sheet.getRange(2, 1, lastRow - 1, lastColumn).setBackgrounds(rowBackgrounds);
  statusRange
    .setBackgrounds(statusBackgrounds)
    .setFontColors(statusFontColors)
    .setFontWeights(statusFontWeights);
}

function applyAllEventRosterHighlights() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  spreadsheet.getSheets()
    .filter((sheet) => isEventRosterSheetName(sheet.getName()))
    .forEach((sheet) => {
      applyEventRosterSheetStyle(sheet);
    });
}

function isProgramVotesSheetName(sheetName) {
  return sheetName === PROGRAM_VOTES_SHEET_NAME;
}

function applyProgramVotesSheetStyle(sheet) {
  applyHeaderStyle(sheet);
  sheet.setFrozenColumns(1);
  sheet.autoResizeColumns(1, Math.max(sheet.getLastColumn(), 1));

  const lastColumn = sheet.getLastColumn();
  if (lastColumn > 0) {
    sheet.showColumns(1, lastColumn);
  }

  ['ID программы', 'ID мероприятия', 'Telegram ID', 'Username', 'Роль'].forEach((header) => {
    const column = headerIndex(sheet, header);
    if (column) {
      sheet.hideColumns(column);
    }
  });

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const optionColumn = headerIndex(sheet, 'Выбор программы');
  const statusColumn = headerIndex(sheet, 'Статус решения');
  if (!optionColumn) return;

  const optionValues = sheet.getRange(2, optionColumn, lastRow - 1, 1).getValues()
    .map(([value]) => String(value || '').trim());
  const optionColorByValue = {};
  let colorIndex = 0;

  optionValues.forEach((option) => {
    if (!option || optionColorByValue[option]) return;
    optionColorByValue[option] = PROGRAM_OPTION_COLORS[colorIndex % PROGRAM_OPTION_COLORS.length];
    colorIndex += 1;
  });

  const rowBackgrounds = optionValues.map((option) => {
    const color = optionColorByValue[option] || '#ffffff';
    return Array.from({ length: lastColumn }, () => color);
  });
  sheet.getRange(2, 1, lastRow - 1, lastColumn).setBackgrounds(rowBackgrounds);

  if (statusColumn) {
    const statusRange = sheet.getRange(2, statusColumn, lastRow - 1, 1);
    const statuses = statusRange.getValues();
    const statusBackgrounds = [];
    const statusFontColors = [];
    const statusFontWeights = [];

    statuses.forEach(([status]) => {
      const changed = String(status || '').trim().toLowerCase() === DECISION_CHANGED_TEXT;
      statusBackgrounds.push([changed ? DECISION_CHANGED_CELL_BACKGROUND : '#ffffff']);
      statusFontColors.push([changed ? DECISION_CHANGED_CELL_FONT : '#202124']);
      statusFontWeights.push([changed ? 'bold' : 'normal']);
    });

    statusRange
      .setBackgrounds(statusBackgrounds)
      .setFontColors(statusFontColors)
      .setFontWeights(statusFontWeights);
  }
}

function setupSheetHeaders() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  Object.entries(SHEET_DISPLAY_HEADERS).forEach(([sheetName, headers]) => {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return;

    if (sheetName === USERS_SHEET_NAME) {
      reorderUsersSheet(sheet, headers);
      return;
    }

    if (sheetName === 'EventRoster') {
      return;
    }

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    applyHeaderStyle(sheet);
  });
}

function setupSpreadsheetView() {
  setupSheetHeaders();
  ensureProgramSheets();
  setupEventRosterSheets();
  applyUsersRoleView();
  applyAllEventRosterHighlights();
}

function normalizeEventRosterHeader(header) {
  const value = String(header || '').trim();
  const aliases = {
    'Сдал': 'Оплата',
    'примечание': 'Примечание',
    'comment': 'Комментарий',
    'comments': 'Комментарий',
    'username': 'Username',
    'telegram_user_id': 'Telegram ID',
    'answered_at': 'Время ответа',
    'role': 'Роль'
  };
  return aliases[value] || value;
}

function rowLooksLikeEventRosterData(row, oldHeaders) {
  const byHeader = {};
  oldHeaders.forEach((header, index) => {
    byHeader[header] = row[index] === null ? '' : row[index];
  });
  const marker = String(byHeader['ID мероприятия'] || '').trim();
  const name = String(byHeader['ФИ'] || byHeader['ФИО'] || '').trim();
  if (['Бюджет', 'Сводка'].includes(marker) || EVENT_ROSTER_SUMMARY_LABELS.includes(name)) {
    return false;
  }
  return Boolean(
    byHeader['ID мероприятия']
      || byHeader['ФИ']
      || byHeader['Telegram ID']
      || byHeader['Username']
      || byHeader['Ответ']
  );
}

function reorderEventRosterSheet(sheet, headers) {
  const values = sheet.getDataRange().getValues();
  const oldHeaders = (values[0] || []).map(normalizeEventRosterHeader);
  const dataRows = values.slice(1)
    .filter((row) => row.some((cell) => cell !== '') && rowLooksLikeEventRosterData(row, oldHeaders));
  const nextRows = dataRows.map((row) => {
    const byHeader = {};
    oldHeaders.forEach((header, index) => {
      byHeader[header] = row[index] === null ? '' : row[index];
    });
    return headers.map((header) => byHeader[header] ?? '');
  });
  const width = Math.max(sheet.getLastColumn(), headers.length + 6, 1);
  const height = Math.max(sheet.getLastRow(), nextRows.length + 1, 1);

  sheet.getRange(1, 1, height, width).clearContent().clearDataValidations();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (nextRows.length) {
    sheet.getRange(2, 1, nextRows.length, headers.length).setValues(nextRows);
  }
  applyEventRosterSheetStyle(sheet);
}

function setupEventRosterSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  spreadsheet.getSheets()
    .filter((sheet) => isEventRosterSheetName(sheet.getName()))
    .forEach((sheet) => reorderEventRosterSheet(sheet, SHEET_DISPLAY_HEADERS.EventRoster));
}

function normalizeUserHeader(header) {
  const value = String(header || '').trim();
  return USER_HEADER_ALIASES[value] || value;
}

function reorderUsersSheet(sheet, headers) {
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();
  const values = sheet.getDataRange().getValues();
  const oldHeaders = (values[0] || []).map(normalizeUserHeader);
  const dataRows = values.slice(1).filter((row) => row.some((cell) => cell !== ''));
  const nextRows = dataRows.map((row) => {
    const byHeader = {};
    oldHeaders.forEach((header, index) => {
      byHeader[header] = row[index] === null ? '' : row[index];
    });
    return headers.map((header) => byHeader[header] ?? '');
  });
  const width = Math.max(sheet.getLastColumn(), headers.length, 1);
  const height = Math.max(sheet.getLastRow(), nextRows.length + 1, 1);

  sheet.getRange(1, 1, height, width).clearContent().clearDataValidations();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (nextRows.length) {
    sheet.getRange(2, 1, nextRows.length, headers.length).setValues(nextRows);
  }
  applyHeaderStyle(sheet);
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
  applyDateColumnFormat(sheet, 'Дата рождения');
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
  sheet.setFrozenColumns(roleColumn);
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
    .filter((row) => {
      if (!headers.some((header) => row[header] !== '')) return false;
      if (isEventRosterSheetName(sheetName)) {
        if (isEventRosterSummaryRow(row)) return false;
        const marker = String(row['ID мероприятия'] || row.event_id || '').trim();
        if (['Бюджет', 'Сводка'].includes(marker)) return false;
        return Boolean(
          row['ID мероприятия']
            || row.event_id
            || row['ФИ']
            || row['Ответ']
            || row.Username
            || row.username
            || row['Telegram ID']
            || row.telegram_user_id
        );
      }
      return true;
    });

  return { headers, rows };
}

function appendRow(sheetName, values) {
  const sheet = sheetByName(sheetName);
  if (isEventRosterSheetName(sheetName)) {
    clearEventRosterSummary(sheet);
  }
  sheet.appendRow(values);
  if (sheetName === USERS_SHEET_NAME) {
    applyUsersRoleView();
  }
  if (isEventRosterSheetName(sheetName)) {
    applyEventRosterSheetStyle(sheet);
  }
  if (isProgramVotesSheetName(sheetName)) {
    applyProgramVotesSheetStyle(sheet);
  }
  return { rowNumber: sheet.getLastRow() };
}

function updateRow(sheetName, rowNumber, values) {
  const sheet = sheetByName(sheetName);
  sheet.getRange(Number(rowNumber), 1, 1, values.length).setValues([values]);
  if (sheetName === USERS_SHEET_NAME) {
    applyUsersRoleView();
  }
  if (isEventRosterSheetName(sheetName)) {
    applyEventRosterSheetStyle(sheet);
  }
  if (isProgramVotesSheetName(sheetName)) {
    applyProgramVotesSheetStyle(sheet);
  }
  return { rowNumber: Number(rowNumber) };
}

function ensureEventRosterSheet(sheetName, title, dates, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const safeName = String(sheetName || '').trim().slice(0, 100);
  if (!safeName) {
    throw new Error('Missing event roster sheet name');
  }

  const sheet = spreadsheet.getSheetByName(safeName) || spreadsheet.insertSheet(safeName);
  const finalHeaders = headers && headers.length ? headers : SHEET_DISPLAY_HEADERS.EventRoster;

  sheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]);
  applyEventRosterSheetStyle(sheet);

  if (title || dates) {
    sheet.setTabColor('#0f6b85');
  }

  return {
    sheetName: safeName,
    created: sheet.getLastRow() <= 1
  };
}

function ensureSheetWithHeaders(sheetName, headers, options) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  applyHeaderStyle(sheet);
  if (options && options.tabColor) {
    sheet.setTabColor(options.tabColor);
  }
  if (isProgramVotesSheetName(sheetName)) {
    applyProgramVotesSheetStyle(sheet);
  }
  return sheet;
}

function ensureProgramSheets() {
  ensureSheetWithHeaders(PROGRAM_POLLS_SHEET_NAME, SHEET_DISPLAY_HEADERS.ProgramPolls, { tabColor: '#674ea7' });
  ensureSheetWithHeaders(PROGRAM_VOTES_SHEET_NAME, SHEET_DISPLAY_HEADERS[PROGRAM_VOTES_SHEET_NAME], { tabColor: '#38761d' });
  ensureSheetWithHeaders(EVENT_BROADCASTS_SHEET_NAME, SHEET_DISPLAY_HEADERS.EventBroadcasts, { tabColor: '#3c78d8' });
  return {
    programPolls: PROGRAM_POLLS_SHEET_NAME,
    programVotes: PROGRAM_VOTES_SHEET_NAME,
    eventBroadcasts: EVENT_BROADCASTS_SHEET_NAME
  };
}

function ensureWeeklyServiceSheets() {
  const serviceSheet = ensureSheetWithHeaders(
    WEEKLY_SERVICE_SHEET_NAME,
    SHEET_DISPLAY_HEADERS[WEEKLY_SERVICE_SHEET_NAME],
    { tabColor: '#6aa84f' }
  );
  const attendanceSheet = ensureSheetWithHeaders(
    WEEKLY_ATTENDANCE_SHEET_NAME,
    SHEET_DISPLAY_HEADERS[WEEKLY_ATTENDANCE_SHEET_NAME],
    { tabColor: '#3d85c6' }
  );
  const presentColumn = headerIndex(attendanceSheet, 'Фактически присутствует');
  const weightColumn = headerIndex(attendanceSheet, 'Нагрузка лидера');
  if (presentColumn) {
    attendanceSheet.getRange(2, presentColumn, Math.max(1, attendanceSheet.getMaxRows() - 1), 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Да', 'Нет'], true).build());
  }
  if (weightColumn) {
    attendanceSheet.getRange(2, weightColumn, Math.max(1, attendanceSheet.getMaxRows() - 1), 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['1', '2', '3', '4'], true).build());
  }
  attendanceSheet.setFrozenRows(1);
  return { serviceSheet: serviceSheet.getName(), attendanceSheet: attendanceSheet.getName() };
}

function pastoralHeaders(headers) {
  return headers && headers.length ? headers : [
    'Дата',
    'ID служения',
    'Подросток',
    'Username подростка',
    'Лидер',
    'Статус беседы',
    'Комментарий',
    'Создано'
  ];
}

function getPastoralSpreadsheet(headers, createIfMissing) {
  const properties = PropertiesService.getScriptProperties();
  const storedId = properties.getProperty(PASTORAL_SPREADSHEET_PROPERTY);
  if (storedId) {
    try {
      return SpreadsheetApp.openById(storedId);
    } catch (error) {
      properties.deleteProperty(PASTORAL_SPREADSHEET_PROPERTY);
    }
  }
  if (!createIfMissing) return null;

  const spreadsheet = SpreadsheetApp.create('GethTeens — Душепопечение');
  properties.setProperty(PASTORAL_SPREADSHEET_PROPERTY, spreadsheet.getId());
  return spreadsheet;
}

function ensurePastoralSheet(headers) {
  const spreadsheet = getPastoralSpreadsheet(headers, true);
  const sheet = spreadsheet.getSheetByName(PASTORAL_SHEET_NAME) || spreadsheet.getActiveSheet().setName(PASTORAL_SHEET_NAME);
  const finalHeaders = pastoralHeaders(headers);
  sheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]);
  applyHeaderStyle(sheet);
  sheet.setTabColor('#674ea7');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(7, 420);
  return { spreadsheet, sheet };
}

function normalizeViewerEmails(viewerEmails) {
  return [...new Set((viewerEmails || [])
    .map((email) => String(email || '').trim().toLowerCase())
    .filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))];
}

function sharePastoralWorkbook(spreadsheet, viewerEmails) {
  const emails = normalizeViewerEmails(viewerEmails);
  emails.forEach((email) => spreadsheet.addEditor(email));
  return emails;
}

function createPastoralWorkbook(headers, viewerEmails) {
  const { spreadsheet } = ensurePastoralSheet(headers);
  const sharedWith = sharePastoralWorkbook(spreadsheet, viewerEmails);
  return { id: spreadsheet.getId(), url: spreadsheet.getUrl(), created: true, sharedWith };
}

function pastoralWorkbookInfo() {
  const spreadsheet = getPastoralSpreadsheet(null, false);
  if (!spreadsheet) return { exists: false };
  return { exists: true, id: spreadsheet.getId(), url: spreadsheet.getUrl() };
}

function appendPastoralNote(values, headers) {
  const { sheet } = ensurePastoralSheet(headers);
  const finalHeaders = pastoralHeaders(headers);
  const row = finalHeaders.map((_, index) => (values || [])[index] || '');
  sheet.appendRow(row);
  return { rowNumber: sheet.getLastRow(), url: sheet.getParent().getUrl() };
}

function upsertProgramVote(values) {
  ensureProgramSheets();
  const sheet = sheetByName(PROGRAM_VOTES_SHEET_NAME);
  const headers = SHEET_DISPLAY_HEADERS[PROGRAM_VOTES_SHEET_NAME];
  const normalizedValues = headers.map((_, index) => {
    const value = (values || [])[index];
    return value === null || value === undefined ? '' : value;
  });
  const programIdIndex = headers.indexOf('ID программы');
  const telegramUserIdIndex = headers.indexOf('Telegram ID');
  const programId = String(normalizedValues[programIdIndex] || '').trim();
  const telegramUserId = normalizeBulkUserId(normalizedValues[telegramUserIdIndex]);
  if (!programId || !telegramUserId) {
    throw new Error('upsertProgramVote requires ID программы and Telegram ID');
  }

  const matches = [];
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const rowCount = lastRow - 1;
    const rows = sheet.getRange(2, 1, rowCount, headers.length).getValues();
    rows.forEach((row, index) => {
      const rowProgramId = String(row[programIdIndex] || '').trim();
      const rowTelegramUserId = normalizeBulkUserId(row[telegramUserIdIndex]);
      if (rowProgramId === programId && rowTelegramUserId === telegramUserId) {
        matches.push(index + 2);
      }
    });
  }

  if (matches.length) {
    updateRow(PROGRAM_VOTES_SHEET_NAME, matches[0], normalizedValues);
    for (let index = 1; index < matches.length; index += 1) {
      sheet.getRange(matches[index], 1, 1, headers.length).clearContent();
    }
    applyProgramVotesSheetStyle(sheet);
    return {
      rowNumber: matches[0],
      updated: true,
      duplicatesCleared: Math.max(0, matches.length - 1)
    };
  }

  const result = appendRow(PROGRAM_VOTES_SHEET_NAME, normalizedValues);
  return {
    rowNumber: result.rowNumber,
    created: true,
    duplicatesCleared: 0
  };
}

function normalizeBulkUserId(value) {
  return String(value || '').replace(/\.0$/, '').trim();
}

function birthDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  const text = String(value || '').trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dot = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/);
  if (dot) {
    return `${dot[3]}-${String(dot[2]).padStart(2, '0')}-${String(dot[1]).padStart(2, '0')}`;
  }

  return text;
}

function syncEventRosterBirthDates(targetUserIds) {
  const selectedIds = new Set((targetUserIds || [])
    .map(normalizeBulkUserId)
    .filter(Boolean));
  const usersSheet = sheetByName(USERS_SHEET_NAME);
  const usersIdColumn = headerIndex(usersSheet, 'Telegram ID') || headerIndex(usersSheet, 'telegram_user_id');
  const usersBirthDateColumn = headerIndex(usersSheet, 'Дата рождения') || headerIndex(usersSheet, 'birth_date');
  if (!usersIdColumn || !usersBirthDateColumn || usersSheet.getLastRow() < 2) {
    return { updated: 0, sheets: [] };
  }

  const userRows = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, usersSheet.getLastColumn()).getValues();
  const birthdaysByUserId = new Map();
  userRows.forEach((row) => {
    const userId = normalizeBulkUserId(row[usersIdColumn - 1]);
    const birthDate = row[usersBirthDateColumn - 1];
    if (!userId || !birthDate || (selectedIds.size && !selectedIds.has(userId))) return;
    birthdaysByUserId.set(userId, birthDate);
  });

  const result = { updated: 0, sheets: [] };
  SpreadsheetApp.getActiveSpreadsheet().getSheets()
    .filter((sheet) => isEventRosterSheetName(sheet.getName()))
    .forEach((sheet) => {
      const rosterIdColumn = headerIndex(sheet, 'Telegram ID') || headerIndex(sheet, 'telegram_user_id');
      const rosterBirthDateColumn = headerIndex(sheet, 'Дата рождения');
      const lastRow = sheet.getLastRow();
      if (!rosterIdColumn || !rosterBirthDateColumn || lastRow < 2) return;

      const rowCount = lastRow - 1;
      const userIds = sheet.getRange(2, rosterIdColumn, rowCount, 1).getValues();
      const birthDates = sheet.getRange(2, rosterBirthDateColumn, rowCount, 1).getValues();
      let updated = 0;
      for (let index = 0; index < rowCount; index += 1) {
        const userId = normalizeBulkUserId(userIds[index][0]);
        const birthDate = birthdaysByUserId.get(userId);
        if (!birthDate || birthDateKey(birthDates[index][0]) === birthDateKey(birthDate)) continue;
        birthDates[index][0] = birthDate;
        updated += 1;
      }

      if (updated) {
        sheet.getRange(2, rosterBirthDateColumn, rowCount, 1).setValues(birthDates);
        applyEventRosterSheetStyle(sheet);
      }
      result.updated += updated;
      result.sheets.push({ sheetName: sheet.getName(), rowsUpdated: updated });
    });

  return result;
}

function normalizedGenderMap(gendersByUserId) {
  const result = {};
  Object.keys(gendersByUserId || {}).forEach((userId) => {
    const normalizedUserId = normalizeBulkUserId(userId);
    const gender = String(gendersByUserId[userId] || '').trim();
    if (normalizedUserId && gender) {
      result[normalizedUserId] = gender;
    }
  });
  return result;
}

function bulkUpdateGenderColumn(sheet, gendersByUserId) {
  const idColumn = headerIndex(sheet, 'Telegram ID') || headerIndex(sheet, 'telegram_user_id');
  const genderColumn = headerIndex(sheet, 'Пол') || headerIndex(sheet, 'gender');
  const lastRow = sheet.getLastRow();
  if (!idColumn || !genderColumn || lastRow < 2) {
    return 0;
  }

  const rowCount = lastRow - 1;
  const userIds = sheet.getRange(2, idColumn, rowCount, 1).getValues();
  const genders = sheet.getRange(2, genderColumn, rowCount, 1).getValues();
  let updated = 0;

  for (let index = 0; index < rowCount; index += 1) {
    const userId = normalizeBulkUserId(userIds[index][0]);
    const gender = gendersByUserId[userId];
    if (!gender || String(genders[index][0] || '').trim() === gender) continue;

    genders[index][0] = gender;
    updated += 1;
  }

  if (updated) {
    sheet.getRange(2, genderColumn, rowCount, 1).setValues(genders);
  }

  return updated;
}

function bulkUpdateGenders(gendersByUserId) {
  const normalized = normalizedGenderMap(gendersByUserId);
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const result = {
    usersUpdated: 0,
    rosterRowsUpdated: 0,
    rosterSheets: []
  };

  const usersSheet = sheetByName(USERS_SHEET_NAME);
  result.usersUpdated = bulkUpdateGenderColumn(usersSheet, normalized);
  if (result.usersUpdated) {
    applyUsersRoleView();
  }

  spreadsheet.getSheets()
    .filter((sheet) => isEventRosterSheetName(sheet.getName()))
    .forEach((sheet) => {
      const rowsUpdated = bulkUpdateGenderColumn(sheet, normalized);
      if (rowsUpdated) {
        applyEventRosterSheetStyle(sheet);
      }
      result.rosterRowsUpdated += rowsUpdated;
      result.rosterSheets.push({
        sheetName: sheet.getName(),
        rowsUpdated
      });
    });

  return result;
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

    if (body.action === 'ensureEventRosterSheet') {
      return jsonResponse({
        ok: true,
        result: ensureEventRosterSheet(body.sheetName, body.title || '', body.dates || '', body.headers || [])
      });
    }

    if (body.action === 'ensureProgramSheets') {
      return jsonResponse({ ok: true, result: ensureProgramSheets() });
    }

    if (body.action === 'ensureWeeklyServiceSheets') {
      return jsonResponse({ ok: true, result: ensureWeeklyServiceSheets() });
    }

    if (body.action === 'createPastoralWorkbook') {
      return jsonResponse({ ok: true, result: createPastoralWorkbook(body.headers || [], body.viewerEmails || []) });
    }

    if (body.action === 'pastoralWorkbookInfo') {
      return jsonResponse({ ok: true, result: pastoralWorkbookInfo() });
    }

    if (body.action === 'appendPastoralNote') {
      return jsonResponse({ ok: true, result: appendPastoralNote(body.values || [], body.headers || []) });
    }

    if (body.action === 'upsertProgramVote') {
      return jsonResponse({ ok: true, result: upsertProgramVote(body.values || []) });
    }

    if (body.action === 'bulkUpdateGenders') {
      return jsonResponse({ ok: true, result: bulkUpdateGenders(body.gendersByUserId || {}) });
    }

    if (body.action === 'syncEventRosterBirthDates') {
      return jsonResponse({ ok: true, result: syncEventRosterBirthDates(body.telegramUserIds || []) });
    }

    if (body.action === 'applyRoleView') {
      applyUsersRoleView();
      return jsonResponse({ ok: true, result: { applied: true } });
    }

    if (body.action === 'setupSpreadsheetView') {
      setupSpreadsheetView();
      return jsonResponse({ ok: true, result: { applied: true } });
    }

    if (body.action === 'applyEventRosterHighlights') {
      applyAllEventRosterHighlights();
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
