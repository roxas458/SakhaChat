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

// Превращает BigInt в Number (node:sqlite возвращает BigInt для id)
function toNum(row) {
  if (!row) return row;
  const out = {};
  for (const k in row) {
    out[k] = typeof row[k] === 'bigint' ? Number(row[k]) : row[k];
  }
  return out;
}
function toNumArr(rows) {
  return rows.map(toNum);
}

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
  if (!username || !password || !displayName) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Too short' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)'
    ).run(username, hash, displayName);
    const newId = Number(result.lastInsertRowid);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, newId);
    res.json({ token, user: { id: newId, username, displayName } });
  } catch (e) {
    res.status(400).json({ error: 'Username taken' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  const userId = Number(user.id);
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, userId);
  res.json({
    token,
    user: { id: userId, username: user.username, displayName: user.display_name }
  });
});

// Logout
app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

// ============ ПРОФИЛЬ ============

// Получить свой профиль
app.get('/api/me', auth, (req, res) => {
  const user = db.prepare(
    'SELECT id, username, display_name, created_at FROM users WHERE id = ?'
  ).get(req.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: Number(user.id),
    username: user.username,
    displayName: user.display_name,
    createdAt: user.created_at
  });
});

// Обновить профиль (имя и/или пароль)
app.post('/api/profile', auth, (req, res) => {
  const { displayName, currentPassword, newPassword } = req.body || {};

  // Смена отображаемого имени
  if (displayName !== undefined) {
    const name = String(displayName).trim();
    if (name.length < 1 || name.length > 40) {
      return res.status(400).json({ error: 'Имя от 1 до 40 символов' });
    }
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, req.userId);
  }

  // Смена пароля
  if (newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'Введите текущий пароль' });
    }
    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'Новый пароль от 4 символов' });
    }
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.userId);
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(400).json({ error: 'Текущий пароль неверен' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.userId);
  }

  // Возвращаем обновлённый профиль
  const updated = db.prepare(
    'SELECT id, username, display_name, created_at FROM users WHERE id = ?'
  ).get(req.userId);
  res.json({
    id: Number(updated.id),
    username: updated.username,
    displayName: updated.display_name,
    createdAt: updated.created_at
  });
});

// ============ USERS ============

// Search users (строго по точному логину)
app.get('/api/users', auth, (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  
  // Если строка пустая или слишком короткая — никого не показываем
  if (!q || q.length < 3) {
    return res.json([]);
  }

  // Ищем строго по совпадению логина (username)
  const users = db.prepare(
    'SELECT id, username, display_name FROM users WHERE LOWER(username) = ? AND id != ? LIMIT 1'
  ).all(q, req.userId);
  
  res.json(toNumArr(users).map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name
  })));
});

// ============ МОИ ЧАТЫ ============

// Получить список моих активных чатов (с кем была переписка)
app.get('/api/chats', auth, (req, res) => {
  // Ищем последнее сообщение с каждым уникальным пользователем
  const chats = db.prepare(`
    SELECT 
      u.id, u.username, u.display_name,
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
    lastMessageTime: u.last_message_time
  })));
});

// Get messages with user
app.get('/api/messages/:userId', auth, (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
    LIMIT 200
  `).all(req.userId, otherId, otherId, req.userId);
  res.json(toNumArr(msgs));
});

// Socket.io with auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return next(new Error('Unauthorized'));
  socket.userId = Number(session.user_id);
  next();
});

const onlineUsers = new Map();

io.on('connection', (socket) => {
  onlineUsers.set(socket.userId, socket.id);

  // Broadcast online status
  io.emit('online', Array.from(onlineUsers.keys()));

  socket.on('send_message', ({ to, text }, callback) => {
    if (!to || !text || !text.trim()) return;
    const result = db.prepare(
      'INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)'
    ).run(socket.userId, to, text.trim());
    const msg = toNum(db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid));

    // Send to receiver
    const receiverSocket = onlineUsers.get(to);
    if (receiverSocket) {
      io.to(receiverSocket).emit('new_message', msg);
    }

    if (callback) callback(msg);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.userId);
    io.emit('online', Array.from(onlineUsers.keys()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SakhaChat running on http://localhost:${PORT}`);
});