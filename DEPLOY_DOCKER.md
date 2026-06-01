# Docker deploy

Короткая инструкция для запуска бота на сервере через Docker Compose.

## 1. Что нужно на сервере

- Docker
- Docker Compose plugin
- папка проекта
- заполненный `.env`

Порты открывать не нужно: бот работает через Telegram long polling и сам ходит наружу в Telegram API и Google Apps Script.

## 2. Загрузка проекта

Скопируйте папку проекта на сервер, например:

```bash
scp -r telegram-google user@server:/opt/geth-events-bot
```

На сервере:

```bash
cd /opt/geth-events-bot
cp .env.example .env
```

Заполните `.env` реальными значениями.

## 3. Рекомендуемый режим хранения

Для самого простого разворачивания оставьте Apps Script:

```env
GOOGLE_APPS_SCRIPT_ENABLED=true
GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
GOOGLE_APPS_SCRIPT_SECRET=...
GOOGLE_SHEETS_ENABLED=false
```

В этом режиме контейнеру не нужен Google Cloud и не нужен `service-account.json`.

## 4. Запуск

```bash
docker compose up -d --build
```

Посмотреть логи:

```bash
docker compose logs -f bot
```

Остановить:

```bash
docker compose down
```

Перезапустить после правок:

```bash
docker compose up -d --build
```

## 5. Проверка Google-таблицы

```bash
docker compose run --rm bot node scripts/check-apps-script.mjs
```

## 6. Важные настройки перед боевым запуском

Проверьте в `.env`:

```env
GROUP_CHAT_ID=-1002102464075
BIRTHDAY_CHECK_TIME=09:00
TIMEZONE=Europe/Minsk
SEND_BIRTHDAYS_TO_GROUP=true
```

Для тестовой группы оставьте тестовый `GROUP_CHAT_ID`. Для основной группы верните боевой ID.

## 7. Обновление версии на сервере

После загрузки новых файлов:

```bash
docker compose up -d --build
docker compose logs -f bot
```

Контейнер настроен с `restart: unless-stopped`, поэтому после перезагрузки сервера Docker сам поднимет бота.
