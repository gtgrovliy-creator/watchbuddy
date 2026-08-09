# 🎬 WatchBuddy — Telegram Mini App

Совместный просмотр любых видео с девушкой прямо в Telegram! Синхронизация воспроизведения, чат и управление комнатой в реальном времени.

## ✨ Возможности

- 🎥 **Синхронизированный просмотр** — play, pause, seek синхронизируются у всех участников
- 🎬 **Поддержка разных видео**:
  - **YouTube** — поиск и вставка ссылок
  - **Прямые ссылки** — .mp4, .webm, .m3u8 и другие видеофайлы
  - **VK Video** — ссылки на видео VK (открытие в новой вкладке для синхронного просмотра)
- 🔗 **Вставка ссылок** — вставьте любую ссылку и все увидят видео одновременно
- 💬 **Встроенный чат** — общайтесь прямо во время просмотра
- 👑 **Роли** — Host (полный контроль), Moderator (управление), Participant (только просмотр)
- 🔍 **Поиск YouTube** — ищите видео прямо в приложении
- 📱 **Интеграция с Telegram** — автоматическое имя пользователя, хаптика, шаринг ссылок
- 🤖 **Telegram Bot** — команды /create, /join, /start для быстрого доступа
- 🔗 **Комнаты** — создавайте комнаты и делитесь ID с партнёром

## 🚀 Быстрый старт (локально)

### 1. Установка зависимостей

```bash
npm install && npm install --prefix backend && npm install --prefix frontend
```

### 2. Настройка .env

Скопируйте `backend/.env.example` в `backend/.env`:

```bash
cp backend/.env.example backend/.env
```

Заполните:
- `YOUTUBE_API_KEY` — ключ YouTube Data API (необязательно, без него работает fallback)
- `TELEGRAM_BOT_TOKEN` — токен бота от @BotFather (необязательно для локальной разработки)
- `PUBLIC_URL` — URL вашего приложения

### 3. Запуск

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

## 🚀 Деплой на Render (бесплатно)

### 1. Создайте аккаунт на Render

Перейдите на [render.com](https://render.com) и зарегистрируйтесь (можно через GitHub).

### 2. Загрузите проект на GitHub

```bash
git init
git add .
git commit -m "WatchBuddy Telegram Mini App"
git remote add origin https://github.com/ВАШ_ЛОГИН/watchbuddy.git
git push -u origin main
```

### 3. Создайте Web Service на Render

1. Нажмите **"New +"** → **"Web Service"**
2. Подключите ваш GitHub репозиторий
3. Render автоматически определит конфигурацию из `render.yaml`
4. Нажмите **"Create Web Service"**

### 4. Настройте переменные окружения

В настройках сервиса → **Environment** добавьте:

| Переменная | Значение |
|---|---|
| `YOUTUBE_API_KEY` | Ваш YouTube API Key (необязательно) |
| `TELEGRAM_BOT_TOKEN` | Токен бота от @BotFather |
| `PUBLIC_URL` | URL вашего сервиса (например `https://watchbuddy.onrender.com`) |

### 5. Дождитесь деплоя

Render автоматически соберёт и запустит приложение. URL будет вида:
`https://watchbuddy.onrender.com`

## 🤖 Настройка Telegram Bot

### 1. Создайте бота

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/newbot`
3. Введите имя бота (например "WatchBuddy")
4. Введите username бота (например `watchbuddy_bot`)
5. Скопируйте **токен** из ответа

### 2. Создайте Mini App

1. В @BotFather отправьте `/newapp`
2. Выберите вашего бота
3. Введите название приложения
4. Введите URL вашего развёрнутого приложения (например `https://watchbuddy.onrender.com`)
5. Отправьте `/setmenubutton` и укажите кнопку "🎬 Открыть WatchBuddy"

### 3. Настройте токен

Вставьте токен в переменную `TELEGRAM_BOT_TOKEN` на Render (или в `backend/.env` для локальной разработки).

### 4. Готово! 🎉

Теперь вы можете:
- Открыть бота в Telegram и нажать **"🎬 Открыть WatchBuddy"**
- Отправить `/create` — бот создаст комнату и даст код
- Отправить `/join <код>` — присоединиться к комнате
- Поделиться кодом с девушкой — она откроет бота и введёт код

## 📱 Как пользоваться

1. **Создайте комнату** — нажмите "Create Room" или отправьте `/create` боту
2. **Поделитесь кодом** — отправьте код комнаты девушке в Telegram
3. **Девушка присоединяется** — вводит код в поле "Room ID" или отправляет `/join <код>` боту
4. **Добавьте видео** — нажмите "Browse" и вставьте ссылку (.mp4, YouTube, VK) или найдите на YouTube
5. **Смотрите вместе!** 🍿 — видео синхронизируется у обоих

## 🏗️ Архитектура

```
┌─────────────┐     WebSocket      ┌─────────────┐
│  Telegram   │ ◄────────────────► │   Backend   │
│  Mini App   │                    │  (Node.js)  │
│  (React)    │                    │  Socket.IO  │
└─────────────┘                    └──────┬──────┘
                                          │
                                    ┌──────▼──────┐
                                    │  YouTube    │
                                    │  Data API   │
                                    └─────────────┘
```

## 📁 Структура проекта

```
buddy/
├── backend/
│   ├── server.js          # Express + Socket.IO сервер
│   ├── bot.js             # Telegram Bot handler
│   └── .env.example       # Пример конфигурации
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── LandingPage.tsx  # Главная страница
│   │   │   └── RoomPage.tsx     # Комната просмотра
│   │   ├── services/
│   │   │   ├── socket.ts        # Socket.IO клиент
│   │   │   ├── telegram.ts      # Telegram WebApp API
│   │   │   └── videoUtils.ts    # Парсинг видео ссылок
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── index.html
├── render.yaml           # Конфигурация Render
└── package.json
```

## 📝 Лицензия

MIT — основано на [BingeBuddy](https://github.com/kananjn45/BingeBuddy)