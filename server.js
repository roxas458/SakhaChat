const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// Превращает BigInt в Number
function toNum(row) {
  if (!row) return row;
  const out = {};
  for (const k in row) {
    out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
  }
  return out;
}
function toNumArr(rows) { return rows.map(toNum); }

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid token' });
  req.userId = Number(session.user_id);
  req.token = token;
  next();
}

// Register
app.post('/api/register', (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) return res.status(400).json({ error: 'All fields required' });
  if (username.length < 3 || password.length < 4) return res.status(400).json({ error: 'Too short' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)').run(username, hash, displayName);
    const newId = Number(result.lastInsertRowid);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, newId);
    res.json({ token, user: { id: newId, username, displayName, bio: '' } });
  } catch (e) { res.status(400).json({ error: 'Username taken' }); }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
  const token = crypto.randomBytes(32).toString('hex');
  const userId = Number(user.id);
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  res.json({ token, user: { id: userId, username: user.username, displayName: user.display_name, bio: user.bio || '' } });
});

// Logout
app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

// Свой профиль
app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, bio, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: Number(user.id), username: user.username, displayName: user.display_name, bio: user.bio || '', createdAt: user.created_at });
});

// Профиль другого пользователя
app.get('/api/user/:id', auth, (req, res) => {
  const otherId = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id, username, display_name, bio, created_at FROM users WHERE id = ?').get(otherId);
  if (!user) return res.status(404).json({ error: 'Not found' });

  const firstMsg = db.prepare(`
    SELECT created_at FROM messages 
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC LIMIT 1
  `).get(req.userId, otherId, otherId, req.userId);

  res.json({
    id: Number(user.id),
    username: user.username,
    displayName: user.display_name,
    bio: user.bio || '',
    createdAt: user.created_at,
    firstMessageAt: firstMsg ? firstMsg.created_at : null
  });
});

// Обновление профиля
app.post('/api/profile', auth, (req, res) => {
  const { displayName, bio, currentPassword, newPassword } = req.body || {};
  if (displayName !== undefined) {
    const name = String(displayName).trim();
    if (name.length < 1 || name.length > 40) return res.status(400).json({ error: 'Имя от 1 до 40 символов' });
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, req.userId);
  }
  if (bio !== undefined) {
    const bioText = String(bio).trim();
    if (bioText.length > 150) return res.status(400).json({ error: 'Описание не более 150 символов' });
    db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bioText, req.userId);
  }
  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Введите текущий пароль' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'Новый пароль от 4 символов' });
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.userId);
    if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(400).json({ error: 'Текущий пароль неверен' });
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.userId);
  }
  const updated = db.prepare('SELECT id, username, display_name, bio, created_at FROM users WHERE id = ?').get(req.userId);
  res.json({ id: Number(updated.id), username: updated.username, displayName: updated.display_name, bio: updated.bio || '', createdAt: updated.created_at });
});

// Поиск
app.get('/api/users', auth, (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q || q.length < 3) return res.json([]);
  const users = db.prepare('SELECT id, username, display_name FROM users WHERE LOWER(username) = ? AND id != ? LIMIT 1').all(q, req.userId);
  res.json(toNumArr(users).map(u => ({ id: u.id, username: u.username, displayName: u.display_name })));
});

// Список моих чатов
app.get('/api/chats', auth, (req, res) => {
  const chats = db.prepare(`
    SELECT 
      u.id, u.username, u.display_name, u.last_seen,
      MAX(m.created_at) as last_message_time
    FROM users u
    JOIN messages m ON (u.id = m.sender_id OR u.id = m.receiver_id)
    WHERE (m.sender_id = ? OR m.receiver_id = ?) AND u.id != ?
    GROUP BY u.id
    ORDER BY last_message_time DESC
  `).all(req.userId, req.userId, req.userId);

  res.json(toNumArr(chats).map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    lastSeen: u.last_seen,
    lastMessageTime: u.last_message_time
  })));
});

// Сообщения
app.get('/api/messages/:userId', auth, (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC LIMIT 200
  `).all(req.userId, otherId, otherId, req.userId);
  res.json(toNumArr(msgs));
});

// ============ РЕДАКТИРОВАНИЕ СООБЩЕНИЯ ============
app.post('/api/messages/:id/edit', auth, (req, res) => {
  const msgId = parseInt(req.params.id, 10);
  const { text } = req.body;
  if (!msgId) return res.status(400).json({ error: 'Invalid id' });
  if (!text || !text.trim()) return res.status(400).json({ error: 'Empty text' });

  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId);
  if (!msg) return res.status(404).json({ error: 'Not found' });
  if (Number(msg.sender_id) !== req.userId) return res.status(403).json({ error: 'Not yours' });

  db.prepare('UPDATE messages SET text = ?, edited_at = CURRENT_TIMESTAMP WHERE id = ?').run(text.trim(), msgId);
  const updated = toNum(db.prepare('SELECT * FROM messages WHERE id = ?').get(msgId));

  // Уведомляем получателя через Socket.IO
  const receiverSocket = onlineUsers.get(Number(msg.receiver_id));
  if (receiverSocket) {
    io.to(receiverSocket).emit('message_edited', updated);
  }
  // И себе (на случай других вкладок)
  const senderSocket = onlineUsers.get(req.userId);
  if (senderSocket) {
    io.to(senderSocket).emit('message_edited', updated);
  }

  res.json(updated);
});

// ============ ИЗБРАННОЕ ============

// Получить избранные сообщения (заметки себе)
app.get('/api/saved-messages', auth, (req, res) => {
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE sender_id = ? AND receiver_id = ?
    ORDER BY created_at ASC LIMIT 200
  `).all(req.userId, req.userId);
  res.json(toNumArr(msgs));
});

// Отправить сообщение в Избранное (себе)
app.post('/api/messages', auth, (req, res) => {
  const { text, replyToId } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Empty text' });

  const result = db.prepare(
    'INSERT INTO messages (sender_id, receiver_id, text, reply_to_id) VALUES (?, ?, ?, ?)'
  ).run(req.userId, req.userId, text.trim(), replyToId || null);

  const msg = toNum(db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid));
  res.json(msg);
});

// Socket.io
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return next(new Error('Unauthorized'));
  socket.userId = Number(session.user_id);
  next();
});

const onlineUsers = new Map();
const typingTimers = new Map(); // userId:toUserId -> setTimeout

io.on('connection', (socket) => {
  onlineUsers.set(socket.userId, socket.id);
  
  // Обновляем last_seen при входе
  db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(socket.userId);
  
  io.emit('online', Array.from(onlineUsers.keys()));

  // «Печатает...»
  socket.on('typing', ({ to, isTyping }) => {
    if (!to) return;
    const receiverSocket = onlineUsers.get(to);
    if (!receiverSocket) return;

    // Отправляем получателю
    io.to(receiverSocket).emit('user_typing', { from: socket.userId, isTyping: !!isTyping });

    // Сбрасываем старый таймаут
    const key = socket.userId + ':' + to;
    if (typingTimers.has(key)) {
      clearTimeout(typingTimers.get(key));
      typingTimers.delete(key);
    }

    // Если isTyping=true — ставим таймаут на 3 сек (защита от залипания)
    if (isTyping) {
      const timer = setTimeout(() => {
        io.to(receiverSocket).emit('user_typing', { from: socket.userId, isTyping: false });
        typingTimers.delete(key);
      }, 3000);
      typingTimers.set(key, timer);
    }
  });

  socket.on('send_message', ({ to, text, replyToId }, callback) => {
    if (!to || !text || !text.trim()) return;
    const result = db.prepare('INSERT INTO messages (sender_id, receiver_id, text, reply_to_id) VALUES (?, ?, ?, ?)').run(socket.userId, to, text.trim(), replyToId || null);
    const msg = toNum(db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid));
    const receiverSocket = onlineUsers.get(to);
    if (receiverSocket) io.to(receiverSocket).emit('new_message', msg);
    if (callback) callback(msg);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.userId);

    // Чистим все таймеры этого пользователя
    for (const [key, timer] of typingTimers.entries()) {
      if (key.startsWith(socket.userId + ':')) {
        clearTimeout(timer);
        typingTimers.delete(key);
      }
    }
    
    // Обновляем last_seen при выходе
    db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(socket.userId);
    
    io.emit('online', Array.from(onlineUsers.keys()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SakhaChat running on http://localhost:${PORT}`);
});