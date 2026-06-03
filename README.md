# Telegram -> Google Sheets bot for events and birthdays

Бот ведет регистрации на мероприятия через inline-кнопки Telegram, записывает актуальные ответы в Google Sheets и ежедневно проверяет дни рождения по карточкам пользователей.

## Что уже есть

- Привязка пользователя через `/start`.
- Анкета пользователя после `/start`: дата рождения, ФИО одной строкой и церковь.
- Роль пользователя в карточке: `Участник`, `Помощник`, `Админ`.
- Кнопка администратора для создания регистрации на мероприятие прямо в личном чате с ботом.
- Команда администратора `/event` для быстрой публикации регистрации в группе.
- Запись ответа пользователя в таблицу `Registrations`.
- Автоматическое добавление проголосовавших в лист `EventRoster` в формате прошлого мероприятия.
- Автоматическое обновление ответа, если пользователь нажал другой вариант.
- Пометка `изменил решение`, если пользователь поменял вариант ответа.
- Ежедневная проверка дней рождения из таблицы `Users`.
- Личное уведомление всем админам, если сегодня у кого-то день рождения.
- Христианские поздравления с обращением по имени, стихом из Библии и пожеланием.
- 50 редактируемых вариантов поздравлений в таблице `BirthdayTemplates`.
- Подтверждение поздравления суперадмином перед отправкой адресату.
- Кнопки для суперадмина: утвердить и отправить, редактировать, отклонить.
- Личные поздравления после подтверждения, если пользователь уже писал боту в личку.
- Поздравления в группу после подтверждения, если включено `SEND_BIRTHDAYS_TO_GROUP=true`.

## Файлы

- `src/` - код бота.
- `.env.example` - пример настроек.
- `outputs/telegram-excel-events-bot/TelegramEventsBot.xlsx` - шаблон, который можно импортировать в Google Sheets.
- `scripts/build-workbook.mjs` - пересоздание шаблона.
- `scripts/check-google-sheets.mjs` - тихая проверка доступа бота к Google-таблице.

## Минимальное участие с вашей стороны

Нужны только реальные доступы и идентификаторы:

1. Создать Telegram-бота через BotFather и получить `TELEGRAM_BOT_TOKEN`.
2. Добавить бота в группу администратором.
3. Отправить боту `/start` в личку.
4. Суперадмин тоже должен отправить боту `/start` в личку, чтобы получать черновики поздравлений.
5. Импортировать `TelegramEventsBot.xlsx` в Google Sheets.
6. Добавить Apps Script из папки `google-apps-script/` в Google-таблицу и развернуть как Web App.
7. Заполнить `.env` по примеру `.env.example`.

## Настройка

Скопируйте пример настроек:

```bash
cp .env.example .env
```

Заполните:

```text
TELEGRAM_BOT_TOKEN=
ADMIN_USER_IDS=
GROUP_CHAT_ID=
SUPERADMIN_USER_ID=
BIRTHDAY_APPROVER_CHAT_ID=
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_KEY_FILE=./service-account.json
GOOGLE_APPS_SCRIPT_ENABLED=true
GOOGLE_APPS_SCRIPT_URL=
GOOGLE_APPS_SCRIPT_SECRET=
```

`ADMIN_USER_IDS` - Telegram ID администраторов, которые могут создавать мероприятия. Узнать свой ID можно командой `/id`.

`GROUP_CHAT_ID` - ID группы. Добавьте бота в группу и отправьте `/id` в группе.

`BIRTHDAY_APPROVER_CHAT_ID` - личный chat ID суперадмина, которому будут приходить черновики поздравлений. Обычно он совпадает с Telegram user ID. Если не указать, бот возьмет `SUPERADMIN_USER_ID`, а затем первого пользователя из `ADMIN_USER_IDS`.

`GOOGLE_SHEETS_SPREADSHEET_ID` - ID Google-таблицы из ссылки. Например в ссылке `https://docs.google.com/spreadsheets/d/ABC123/edit` ID будет `ABC123`.

## Google Sheets Через Apps Script

Это самый простой вариант без Google Cloud и service account.

1. Откройте Google-таблицу.
2. `Расширения -> Apps Script`.
3. Вставьте код из [Code.gs](/Users/admin/Documents/Codex/2026-05-30/telegram-google/google-apps-script/Code.gs).
4. Убедитесь, что `BOT_SECRET` в Apps Script совпадает с `GOOGLE_APPS_SCRIPT_SECRET` в `.env`.
5. Нажмите `Deploy -> New deployment`.
6. Тип: `Web app`.
7. Execute as: `Me`.
8. Who has access: `Anyone`.
9. Скопируйте Web App URL в `.env`:

```text
GOOGLE_APPS_SCRIPT_ENABLED=true
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
```

После заполнения `.env` проверьте доступ:

```bash
node scripts/check-apps-script.mjs
```

После обновления Apps Script в таблице появится меню `GethEvents`. На листе `Users` можно выделить одну или несколько строк анкет и выбрать:

- `Назначить помощником`
- `Сделать участником`
- `Назначить админом в таблице`
- `Обновить порядок и цвета ролей`

Меню меняет значение в колонке `Роль`, сортирует анкеты и раскрашивает строки:

- `Админ` - сверху, светло-красное выделение.
- `Помощник` - после админов, светло-желтое выделение.
- `Участник` - ниже, без яркого выделения.

Если роль поменять вручную в колонке `Роль`, Apps Script тоже обновит порядок и цвета.

## Google Sheets Через Service Account

Этот вариант тоже поддерживается, но требует Google Cloud:

- Google Cloud project.
- Включенный Google Sheets API.
- Service account.
- JSON key service account, сохраненный как `service-account.json`.
- Доступ к таблице: нужно открыть Google-таблицу и расшарить ее на email service account с правом редактора.

Для него используйте:

```text
GOOGLE_SHEETS_ENABLED=true
GOOGLE_APPS_SCRIPT_ENABLED=false
```

## Запуск

```bash
node src/index.js
```

Если на машине доступен npm, можно также запускать через:

```bash
npm start
```

В этом проекте нет npm-зависимостей для runtime: Telegram API и Google Sheets API вызываются через встроенный `fetch` Node.js.

## Запуск Через Docker

Для сервера удобнее запускать через Docker Compose:

```bash
docker compose up -d --build
```

Логи:

```bash
docker compose logs -f bot
```

Остановка:

```bash
docker compose down
```

Подробная инструкция: [DEPLOY_DOCKER.md](/Users/admin/Documents/Codex/2026-05-30/telegram-google/DEPLOY_DOCKER.md).

## Команды бота

```text
/start
```

Привязывает Telegram-пользователя к строке в `Users` и запускает анкету в личном чате. Бот по шагам спросит дату рождения, ФИО одной строкой и церковь, покажет сводку и сохранит данные в карточку после кнопки `Отправить`.

Для личных поздравлений пользователь должен выполнить `/start` именно в личном чате с ботом.

```text
/id
```

Показывает `chat_id` и `user_id`.

```text
/new_event
```

Запускает мастер создания регистрации для администратора или суперадмина. Бот по шагам спросит:

- название мероприятия;
- даты;
- комментарий;
- варианты ответа.

После предпросмотра кнопка `Опубликовать регистрацию` отправит сообщение с вариантами ответа в группу из `GROUP_CHAT_ID`.

```text
/event Название | даты | описание | Еду,Не еду,Пока не знаю
```

Быстро создает регистрацию в группе одной командой.

Пример:

```text
/event Летний лагерь | 15-20 июля | Кто едет с нами? | Еду,Не еду,Думаю
```

```text
/birthdays
```

Ручная проверка дней рождения. Бот создаст христианские черновики поздравлений и отправит их суперадмину на подтверждение. Автоматическая проверка идет каждый день после времени из `BIRTHDAY_CHECK_TIME`.

## Как работает подтверждение поздравлений

1. Бот находит именинника в `Users`.
2. Отправляет всем админам личное уведомление: `Сегодня день рождения у Имя! Вы можете поздравить именинника в ЛС от себя лично. Хорошего дня ❤`. Имя будет кликабельным и вести в личный чат пользователя, если в `Users` есть `username` или `telegram_user_id`.
3. Берет один из активных вариантов из `BirthdayTemplates`.
4. Собирает текст: обращение по имени, фраза про команду, стих из Библии, пожелание.
5. Записывает черновик в `BirthdayLog` со статусом `pending`.
6. Отправляет суперадмину сообщение с кнопками.
7. После кнопки `Утвердить и отправить` бот отправляет поздравление адресату и, если включено, в группу.
8. После кнопки `Редактировать` бот пришлет текущий текст, попросит отправить отредактированный вариант одним сообщением, сохранит правку только для этого именинника в `BirthdayLog` и снова покажет превью. В базу шаблонов эта правка не попадет. Отменить ввод можно командой `/cancel`.
9. После кнопки `Отклонить` статус становится `rejected`, и бот не отправляет поздравление.

## Структура Google Sheets

`Users` - карточки пользователей:

```text
telegram_user_id | username | last_name | first_name | middle_name | birth_date | church | gender | parent_consent | medical_certificate | private_chat_id | is_active | notes | updated_at | role
```

`Events` - мероприятия:

```text
event_id | title | dates | description | options | status | group_chat_id | message_id | created_at | updated_at
```

`Registrations` - актуальные ответы:

```text
event_id | event_title | telegram_user_id | username | full_name | answer | previous_answer | change_note | answered_at | source_message_id | updated_at
```

`EventRoster` - реестр мероприятия в стиле прошлой таблицы:

```text
event_id | ФИ | Сдал | Церковь | Дата рождения | примечание | Пол | Согласие родителей | Справка | Ответ | Статус решения | username | telegram_user_id | answered_at | role
```

Когда пользователь нажимает кнопку регистрации, бот берет ФИО, церковь, дату рождения, пол, согласие родителей, справку и роль из `Users`, а затем добавляет или обновляет строку в `EventRoster`. Если человек поменял вариант ответа, в `Статус решения` появится `изменил решение`.

`BirthdayLog` - лог поздравлений:

```text
date | telegram_user_id | username | full_name | birthday_message | approval_status | private_sent | group_sent | approved_by | approved_at | sent_at | notes
```

`BirthdayTemplates` - редактируемая база христианских поздравлений:

```text
reference | verse | wish | is_active
```

## Важные ограничения Telegram

- Бот не может первым написать пользователю в личку. Пользователь должен один раз отправить `/start`.
- Надежный ключ пользователя - `telegram_user_id`, не `username`. Username можно поменять.
- Для регистраций используются inline-кнопки, а не нативные Telegram-опросы. Так бот точно знает, кто какой вариант выбрал.

## Пересоздать шаблон

```bash
node scripts/build-workbook.mjs
```

После пересоздания шаблона его можно импортировать в Google Sheets или вручную перенести структуру листов.
