const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Serve the built frontend in production
const path = require('path');
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendDist));

// In-memory data store for rooms and search cache
const rooms = new Map();
const searchCache = new Map();

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', rooms: rooms.size });
});

// YouTube Search Proxy Endpoint
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  const API_KEY = process.env.YOUTUBE_API_KEY;

  if (!q) return res.status(400).json({ error: 'Query is required' });
  if (!API_KEY || API_KEY === 'YOUR_YOUTUBE_API_KEY_HERE') {
    return res.status(500).json({ error: 'YouTube API Key not configured on server' });
  }

  // Check cache (TTL 24 hours)
  const cached = searchCache.get(q.toLowerCase());
  if (cached && (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000)) {
    console.log('Serving from cache:', q);
    return res.json(cached.data);
  }

  try {
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        maxResults: 12,
        q: q,
        type: 'video',
        key: API_KEY
      }
    });

    const formattedData = response.data.items.map(item => ({
      id: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.medium.url,
      channel: item.snippet.channelTitle
    }));

    // Save to cache
    searchCache.set(q.toLowerCase(), { data: formattedData, timestamp: Date.now() });

    res.json(formattedData);
  } catch (error) {
    console.error('YouTube API Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch from YouTube' });
  }
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // 1. Join Room
  socket.on('join_room', ({ roomId, username }) => {
    socket.join(roomId);

    try {
      let room = rooms.get(roomId);
      let role = 'Participant';

      if (!room) {
        // First user creates the room and becomes Host
        role = 'Host';
        room = {
          roomId,
          video: null,
          isPlaying: false,
          currentTime: 0,
          users: [{ socketId: socket.id, username, role }],
          reactions: {}
        };
        rooms.set(roomId, room);
      } else {
        if (room.users.length === 0) {
          role = 'Host';
        }

        // Initialize reactions if missing (for existing rooms)
        if (!room.reactions) room.reactions = {};

        // Check if user is already in the room (e.g., React Strict Mode double mount)
        const existingUserIndex = room.users.findIndex(u => u.socketId === socket.id);
        if (existingUserIndex !== -1) {
          room.users[existingUserIndex].username = username;
          role = room.users[existingUserIndex].role; // Retain their original role
        } else {
          room.users.push({ socketId: socket.id, username, role });
        }
      }

      // Send current state to the user who just joined
      socket.emit('room_state', {
        video: room.video,
        isPlaying: room.isPlaying,
        currentTime: room.currentTime,
        users: room.users,
        myRole: role
      });

      socket.emit('ALL_REACTIONS', { reactions: room.reactions || {} });

      // Broadcast to others that a user joined
      io.to(roomId).emit('user_joined', room.users);

      console.log(`User ${username} joined room ${roomId} as ${role}`);
    } catch (err) {
      console.error(err);
      socket.emit('error', 'Could not join room');
    }
  });

  // 2. Playback Sync
  socket.on('sync_action', ({ roomId, action, payload }) => {
    try {
      const room = rooms.get(roomId);
      if (!room) return;

      const user = room.users.find(u => u.socketId === socket.id);
      if (!user) return;

      // Role Based Access Control
      if (user.role === 'Participant') {
        return socket.emit('error', 'You do not have permission to control playback.');
      }

      // Update room state
      if (action === 'play') room.isPlaying = true;
      if (action === 'pause') room.isPlaying = false;
      if (action === 'seek') room.currentTime = payload.currentTime;
      if (action === 'change_video') {
        room.video = payload.video;
        room.isPlaying = false;
        room.currentTime = 0;
      }

      // Broadcast to everyone in the room
      io.to(roomId).emit('sync_state', { action, payload, state: room });
    } catch (err) {
      console.error(err);
    }
  });

  // 3. Role Management
  socket.on('promote_user', ({ roomId, targetSocketId, newRole }) => {
    try {
      const room = rooms.get(roomId);
      if (!room) return;

      const requester = room.users.find(u => u.socketId === socket.id);
      if (!requester || requester.role !== 'Host') {
        return socket.emit('error', 'Only the Host can promote users.');
      }

      const targetUser = room.users.find(u => u.socketId === targetSocketId);
      if (targetUser) {
        targetUser.role = newRole;
        io.to(roomId).emit('user_joined', room.users); // Re-broadcast user list
        console.log(`User ${targetUser.username} promoted to ${newRole}`);
      }
    } catch (err) {
      console.error(err);
    }
  });

  // 4. Chat System
  socket.on('send_message', ({ roomId, message, replyToId, replyToText, replyToSender }) => {
    try {
      const room = rooms.get(roomId);
      if (!room) return;

      const user = room.users.find(u => u.socketId === socket.id);
      if (!user) return;

      const chatMessage = {
        id: Math.random().toString(36).substring(2, 9),
        username: user.username,
        text: message,
        timestamp: Date.now() / 1000,
        role: user.role,
        socketId: socket.id,
        replyToId: replyToId || null,
        replyToText: replyToText || null,
        replyToSender: replyToSender || null
      };

      io.to(roomId).emit('new_message', chatMessage);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('send-message-reaction', ({ roomId, messageId, emoji, sender }) => {
    try {
      const room = rooms.get(roomId);
      if (!room) return;

      if (!room.reactions) room.reactions = {};
      if (!room.reactions[messageId]) room.reactions[messageId] = {};

      const userId = socket.id;
      if (!room.reactions[messageId][emoji]) {
        room.reactions[messageId][emoji] = [];
      }

      const userIndex = room.reactions[messageId][emoji].indexOf(userId);
      if (userIndex > -1) {
        room.reactions[messageId][emoji].splice(userIndex, 1);
        if (room.reactions[messageId][emoji].length === 0) {
          delete room.reactions[messageId][emoji];
        }
      } else {
        room.reactions[messageId][emoji].push(userId);
      }

      io.to(roomId).emit('message-reaction-updated', {
        messageId,
        emoji,
        userId,
        reactions: room.reactions[messageId]
      });
    } catch (err) {
      console.error(err);
    }
  });

  // Handle explicit leave
  socket.on('leave_room', ({ roomId }) => {
    try {
      const room = rooms.get(roomId);
      if (room) {
        room.users = room.users.filter(u => u.socketId !== socket.id);

        if (room.users.length > 0) {
          const hasHost = room.users.some(u => u.role === 'Host');
          if (!hasHost) {
            room.users[0].role = 'Host';
          }
          io.to(room.roomId).emit('user_left', room.users);
        } else {
          rooms.delete(roomId);
        }
      }
      socket.leave(roomId);
    } catch (err) {
      console.error(err);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    try {
      // Find room containing this user
      for (const [roomId, room] of rooms.entries()) {
        const userExists = room.users.some(u => u.socketId === socket.id);
        if (userExists) {
          room.users = room.users.filter(u => u.socketId !== socket.id);

          if (room.users.length > 0) {
            const hasHost = room.users.some(u => u.role === 'Host');
            if (!hasHost) {
              room.users[0].role = 'Host';
            }
            io.to(roomId).emit('user_left', room.users);
          } else {
            rooms.delete(roomId);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  });
});

const TelegramBot = require('./bot');

// Telegram Bot (optional - only if TELEGRAM_BOT_TOKEN is set)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 5000}`;

if (TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_TOKEN !== 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN);

  const miniAppUrl = `${PUBLIC_URL}`;

  // Установка команд
  bot.setCommands([
    { command: 'start', description: '🎬 Открыть WatchBuddy' },
    { command: 'create', description: '🎥 Создать комнату просмотра' },
    { command: 'join', description: '🚪 Присоединиться к комнате /join <код>' },
  ]);

  bot.on('/start', async (chatId) => {
    const startText = `🎬 <b>WatchBuddy</b> — смотрите видео вместе!

<b>Как пользоваться:</b>
1️⃣ Нажмите кнопку ниже, чтобы открыть приложение
2️⃣ Создайте комнату или введите код
3️⃣ Поделитесь кодом с партнёром
4️⃣ Наслаждайтесь совместным просмотром! 🍿

<b>Команды:</b>
/create — создать комнату
/join <код> — присоединиться к комнате`;

    await bot.sendMessage(chatId, startText, TelegramBot.miniAppButton('🎬 Открыть WatchBuddy', miniAppUrl));
  });

  bot.on('/create', async (chatId) => {
    const roomCode = Math.random().toString(36).substring(2, 9);
    const roomUrl = `${miniAppUrl}/room/${roomCode}?startapp=${roomCode}`;

    await bot.sendMessage(chatId, `🎥 <b>Комната создана!</b>\n\nКод комнаты: <code>${roomCode}</code>\n\nПоделитесь этим кодом с партнёром — она сможет присоединиться через <b>/join</b>`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎬 Открыть комнату', url: roomUrl }],
          [{ text: '📋 Скопировать код', callback_data: `copy_${roomCode}` }],
        ],
      },
    });
  });

  bot.on('/join', async (chatId, text) => {
    const parts = text.split(' ');
    const roomCode = parts[1];

    if (!roomCode) {
      await bot.sendMessage(chatId, 'ℹ️ Использование: <b>/join <код комнаты></b>\n\nПример: <code>/join abc1234</code>');
      return;
    }

    const roomUrl = `${miniAppUrl}/room/${roomCode}?startapp=${roomCode}`;
    await bot.sendMessage(chatId, `🚪 <b>Присоединяемся к комнате:</b> <code>${roomCode}</code>\n\nОткройте комнату кнопкой ниже:`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎬 Присоединиться', url: roomUrl }],
        ],
      },
    });
  });

  bot.on('default', async (chatId, text) => {
    // Если введён неизвестный текст — проверяем, похоже ли это на код комнаты
    const roomCode = text.trim();
    if (roomCode.length >= 4 && roomCode.length <= 12 && /^[a-z0-9]+$/i.test(roomCode)) {
      const roomUrl = `${miniAppUrl}/room/${roomCode}?startapp=${roomCode}`;
      await bot.sendMessage(chatId, `🎬 Открываю комнату <code>${roomCode}</code>:`, {
        reply_markup: {
          inline_keyboard: [[{ text: '🎬 Присоединиться', url: roomUrl }]],
        },
      });
    } else {
      await bot.sendMessage(chatId, `ℹ️ Отправьте /start чтобы открыть WatchBuddy, или /join <код> чтобы присоединиться.`);
    }
  });

  bot.start();
  console.log(`🤖 Telegram bot configured (${PUBLIC_URL})`);
} else {
  console.log('ℹ️ TELEGRAM_BOT_TOKEN не настроен — бот не запущен. Укажите TELEGRAM_BOT_TOKEN в .env');
}

// SPA fallback: serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendDist, 'index.html'));
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`WatchBuddy Telegram server is running on port ${PORT}`);
});
