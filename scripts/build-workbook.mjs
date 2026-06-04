import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import { BIRTHDAY_BLESSINGS } from "../src/blessings.js";

const outputDir = new URL("../outputs/telegram-excel-events-bot/", import.meta.url);
const outputPath = new URL("TelegramEventsBot.xlsx", outputDir);

const seedUsers = [
  [
    "8693437323",
    "d_shaplyko",
    "Шаплыко",
    "Дмитрий",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "yes",
    "admin; open Telegram info provided manually",
    "",
    "Админ"
  ],
  [
    "384813731",
    "Rtchapae",
    "Ухналев",
    "Роман",
    "",
    "1997-05-03",
    "",
    "",
    "",
    "",
    "",
    "yes",
    "superadmin and birthday approver; full name provided manually; Telegram profile first=Roman",
    "",
    "Админ"
  ],
  [
    "443839519",
    "reistar777",
    "Волчек",
    "Александр",
    "",
    "1988-02-06",
    "",
    "",
    "",
    "",
    "",
    "yes",
    "admin; open Telegram info from screenshot; Telegram profile first=W last=Alex",
    "",
    "Админ"
  ],
  [
    "6605138381",
    "orceeek",
    "Ахрименко",
    "Ксения",
    "Витальевна",
    "2008-03-22",
    "",
    "",
    "",
    "",
    "",
    "yes",
    "admin; birth date and Telegram info provided manually; Telegram profile first=Ksenia Orsik",
    "",
    "Админ"
  ],
  [
    "397001327",
    "tedmartyson",
    "Корень",
    "Илья",
    "Андреевич",
    "1998-08-10",
    "",
    "",
    "",
    "",
    "",
    "yes",
    "admin; birth date and Telegram info provided manually; Telegram profile first=Ilya",
    "",
    "Админ"
  ],
  [
    "1901156243",
    "Nadezhda_Puh",
    "Пухнаревич",
    "Надежда",
    "",
    "1983-09-18",
    "",
    "",
    "",
    "",
    "",
    "yes",
    "admin; birth date and Telegram info provided manually",
    "",
    "Админ"
  ]
];

function colName(index) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}

const sheets = [
  {
    name: "Users",
    headers: [
      "telegram_user_id",
      "username",
      "last_name",
      "first_name",
      "middle_name",
      "role",
      "birth_date",
      "church",
      "gender",
      "parent_consent",
      "medical_certificate",
      "private_chat_id",
      "is_active",
      "notes",
      "updated_at"
    ],
    rows: seedUsers
  },
  {
    name: "Events",
    headers: [
      "event_id",
      "title",
      "dates",
      "description",
      "options",
      "status",
      "group_chat_id",
      "message_id",
      "created_at",
      "updated_at"
    ],
    example: [
      "example",
      "Летний лагерь",
      "15-20 июля",
      "Кто едет с нами?",
      "Еду|Не еду|Пока не знаю",
      "closed",
      "",
      "",
      "",
      ""
    ]
  },
  {
    name: "Registrations",
    headers: [
      "event_id",
      "event_title",
      "telegram_user_id",
      "username",
      "full_name",
      "answer",
      "previous_answer",
      "change_note",
      "answered_at",
      "source_message_id",
      "updated_at"
    ],
    example: [
      "example",
      "Летний лагерь",
      "",
      "example_user",
      "Иванов Иван Иванович",
      "Еду",
      "",
      "",
      "",
      "",
      ""
    ]
  },
  {
    name: "EventRoster",
    headers: [
      "event_id",
      "ФИ",
      "Сдал",
      "Церковь",
      "Дата рождения",
      "примечание",
      "Пол",
      "Согласие родителей",
      "Справка",
      "Ответ",
      "Статус решения",
      "username",
      "telegram_user_id",
      "answered_at",
      "role"
    ],
    example: [
      "example",
      "Шаплыко Дмитрий",
      "",
      "Гефсимания",
      "",
      "пример строки, можно удалить",
      "муж",
      "",
      "",
      "Еду",
      "",
      "d_shaplyko",
      "8693437323",
      "",
      "Админ"
    ]
  },
  {
    name: "BirthdayLog",
    headers: [
      "date",
      "telegram_user_id",
      "username",
      "full_name",
      "birthday_message",
      "approval_status",
      "private_sent",
      "group_sent",
      "approved_by",
      "approved_at",
      "sent_at",
      "notes"
    ],
    example: [
      "2026-05-30",
      "",
      "example_user",
      "Иванов Иван Иванович",
      "Иван, с днем рождения!\n\nМы очень рады, что ты с нами в команде...",
      "sent",
      "yes",
      "yes",
      "123456789",
      "2026-05-30T09:05:00.000Z",
      "",
      "пример строки, можно удалить"
    ]
  },
  {
    name: "BirthdayTemplates",
    headers: [
      "reference",
      "verse",
      "wish",
      "is_active"
    ],
    rows: BIRTHDAY_BLESSINGS.map((item) => [
      item.reference,
      item.verse,
      item.wish,
      "yes"
    ])
  }
];

const workbook = Workbook.create();

for (const spec of sheets) {
  const worksheet = workbook.worksheets.add(spec.name);
  const lastColumn = colName(spec.headers.length - 1);
  const dataRows = spec.rows || [spec.example];
  const range = worksheet.getRange(`A1:${lastColumn}${dataRows.length + 1}`);
  range.values = [spec.headers, ...dataRows];

  const table = worksheet.tables.add(`A1:${lastColumn}${dataRows.length + 1}`, true);
  table.name = spec.name;
  table.style = "TableStyleMedium2";

  worksheet.getRange(`A1:${lastColumn}1`).format.font.bold = true;
  worksheet.getRange(`A:${lastColumn}`).format.autofitColumns();
  worksheet.getRange("1:1").format.rowHeight = 24;
}

const readme = workbook.worksheets.add("HowTo");
readme.getRange("A1:B12").values = [
  ["Что это", "Шаблон Excel для Telegram-бота регистраций и дней рождения"],
  ["Users", "Карточки пользователей. Заполните ФИО, birth_date, church, gender и документы."],
  ["Events", "Мероприятия создаются ботом через /event."],
  ["Registrations", "Сюда бот пишет актуальный ответ пользователя, прошлый ответ и пометку изменения решения."],
  ["EventRoster", "Реестр мероприятия в стиле прошлой таблицы: ФИ, Сдал, Церковь, дата рождения, примечание, пол, согласия, справки и статус решения."],
  ["Автозаполнение", "Когда пользователь нажимает кнопку регистрации, бот берет данные из Users и добавляет/обновляет строку в EventRoster."],
  ["BirthdayLog", "Лог поздравлений и статусов подтверждения: pending, sent, rejected, error."],
  ["BirthdayTemplates", "Редактируемая база христианских поздравлений, стихов и пожеланий."],
  ["Подтверждение", "Бот отправляет черновик суперадмину. После кнопки подтверждения поздравление уходит адресату."],
  ["Важно", "telegram_user_id надежнее username. Username можно менять."],
  ["Личка", "Для личных поздравлений пользователь должен один раз отправить боту /start."],
  ["Примерные строки", "Их можно удалить после проверки структуры."]
];
readme.getRange("A1:B1").format.font.bold = true;
readme.getRange("A:B").format.autofitColumns();

const usersPreview = await workbook.inspect({
  kind: "table",
  range: "Users!A1:J4",
  include: "values,formulas",
  tableMaxRows: 4,
  tableMaxCols: 10
});
console.log(usersPreview.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "formula error scan"
});
console.log(errors.ndjson);

for (const spec of [...sheets, { name: "HowTo" }]) {
  await workbook.render({ sheetName: spec.name, range: "A1:L8", scale: 1 });
}

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(`saved ${outputPath.pathname}`);
