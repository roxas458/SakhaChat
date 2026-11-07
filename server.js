const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, initDatabase } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static('public'));

// Auth middleware
async function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const session = await db.get('SELECT user_id FROM sessions WHERE token = $1', [token]);
    if (!session) return res.status(401).json({ error: 'Invalid token' });
    req.userId = Number(session.user_id);
    req.token = token;
    next();
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
}

// Register
app.post('/api/register', async (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) return res.status(400).json({ error: 'All fields required' });
  if (username.length < 3 || password.length < 4) return res.status(400).json({ error: 'Too short' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password, display_name) VALUES ($1, $2, $3) RETURNING id',
      [username.toLowerCase(), hash, displayName]
    );
    const newId = Number(result.lastInsertRowid);
    const token = crypto.randomBytes(32).toString('hex');
    await db.run('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, newId]);
    res.json({ token, user: { id: newId, username, displayName, bio: '' } });
  } catch (e) {
    res.status(400).json({ error: 'Username taken' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await db.get('SELECT * FROM users WHERE username = $1', [(username || '').toLowerCase()]);
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(401).json({ error: 'Invalid credentials' });
    const token = crypto.randomBytes(32).toString('hex');
    const userId = Number(user.id);
    await db.run('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId]);
    res.json({ token, user: { id: userId, username: user.username, displayName: user.display_name, bio: user.bio || '' } });
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Logout
app.post('/api/logout', auth, async (req, res) => {
  try {
    await db.run('DELETE FROM sessions WHERE token = $1', [req.token]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Свой профиль
app.get('/api/me', auth, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, display_name, bio, created_at FROM users WHERE id = $1', [req.userId]);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json({ id: Number(user.id), username: user.username, displayName: user.display_name, bio: user.bio || '', createdAt: user.created_at });
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Профиль другого пользователя
app.get('/api/user/:id', auth, async (req, res) => {
  const otherId = parseInt(req.params.id, 10);
  try {
    const user = await db.get('SELECT id, username, display_name, bio, created_at FROM users WHERE id = $1', [otherId]);
    if (!user) return res.status(404).json({ error: 'Not found' });

    const firstMsg = await db.get(`
      SELECT created_at FROM messages 
      WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at ASC LIMIT 1
    `, [req.userId, otherId]);

    res.json({
      id: Number(user.id),
      username: user.username,
      displayName: user.display_name,
      bio: user.bio || '',
      createdAt: user.created_at,
      firstMessageAt: firstMsg ? firstMsg.created_at : null
    });
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Обновление профиля
app.post('/api/profile', auth, async (req, res) => {
  const { displayName, bio, currentPassword, newPassword } = req.body || {};
  try {
    if (displayName !== undefined) {
      const name = String(displayName).trim();
      if (name.length < 1 || name.length > 40) return res.status(400).json({ error: 'Имя от 1 до 40 символов' });
      await db.run('UPDATE users SET display_name = $1 WHERE id = $2', [name, req.userId]);
    }
    if (bio !== undefined) {
      const bioText = String(bio).trim();
      if (bioText.length > 150) return res.status(400).json({ error: 'Описание не более 150 символов' });
      await db.run('UPDATE users SET bio = $1 WHERE id = $2', [bioText, req.userId]);
    }
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Введите текущий пароль' });
      if (newPassword.length < 4) return res.status(400).json({ error: 'Новый пароль от 4 символов' });
      const user = await db.get('SELECT password FROM users WHERE id = $1', [req.userId]);
      if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(400).json({ error: 'Текущий пароль неверен' });
      const hash = bcrypt.hashSync(newPassword, 10);
      await db.run('UPDATE users SET password = $1 WHERE id = $2', [hash, req.userId]);
    }
    const updated = await db.get('SELECT id, username, display_name, bio, created_at FROM users WHERE id = $1', [req.userId]);
    res.json({ id: Number(updated.id), username: updated.username, displayName: updated.display_name, bio: updated.bio || '', createdAt: updated.created_at });
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Поиск
app.get('/api/users', auth, async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q || q.length < 3) return res.json([]);
  try {
    const users = await db.all(
      'SELECT id, username, display_name FROM users WHERE LOWER(username) = $1 AND id != $2 LIMIT 1',
      [q, req.userId]
    );
    res.json(users.map(u => ({ id: Number(u.id), username: u.username, displayName: u.display_name })));
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Список моих чатов
app.get('/api/chats', auth, async (req, res) => {
  try {
    const chats = await db.all(`
      SELECT 
        u.id, u.username, u.display_name, u.last_seen,
        MAX(m.created_at) as last_message_time
      FROM users u
      JOIN messages m ON (u.id = m.sender_id OR u.id = m.receiver_id)
      WHERE (m.sender_id = $1 OR m.receiver_id = $1) AND u.id != $1
      GROUP BY u.id
      ORDER BY last_message_time DESC
    `, [req.userId]);

    res.json(chats.map(u => ({
      id: Number(u.id),
      username: u.username,
      displayName: u.display_name,
      lastSeen: u.last_seen,
      lastMessageTime: u.last_message_time
    })));
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Сообщения
app.get('/api/messages/:userId', auth, async (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  try {
    const msgs = await db.all(`
      SELECT * FROM messages
      WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
      ORDER BY created_at ASC LIMIT 200
    `, [req.userId, otherId]);
    res.json(msgs.map(m => ({
      id: Number(m.id),
      sender_id: Number(m.sender_id),
      receiver_id: Number(m.receiver_id),
      text: m.text,
      created_at: m.created_at
    })));
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Избранное
app.get('/api/saved-messages', auth, async (req, res) => {
  try {
    const msgs = await db.all(`
      SELECT * FROM messages
      WHERE sender_id = $1 AND receiver_id = $1
      ORDER BY created_at ASC LIMIT 200
    `, [req.userId]);
    res.json(msgs.map(m => ({
      id: Number(m.id),
      sender_id: Number(m.sender_id),
      receiver_id: Number(m.receiver_id),
      text: m.text,
      created_at: m.created_at
    })));
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/messages', auth, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Empty text' });
  try {
    const result = await db.run(
      'INSERT INTO messages (sender_id, receiver_id, text) VALUES ($1, $2, $3) RETURNING id',
      [req.userId, req.userId, text.trim()]
    );
    const msg = await db.get('SELECT * FROM messages WHERE id = $1', [result.lastInsertRowid]);
    res.json({
      id: Number(msg.id),
      sender_id: Number(msg.sender_id),
      receiver_id: Number(msg.receiver_id),
      text: msg.text,
      created_at: msg.created_at
    });
  } catch (e) {
    res.status(500).json({ error: 'DB error' });
  }
});

// Socket.io
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const session = await db.get('SELECT user_id FROM sessions WHERE token = $1', [token]);
    if (!session) return next(new Error('Unauthorized'));
    socket.userId = Number(session.user_id);
    next();
  } catch (e) {
    next(new Error('DB error'));
  }
});

const onlineUsers = new Map();

io.on('connection', async (socket) => {
  onlineUsers.set(socket.userId, socket.id);
  
  try {
    await db.run('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1', [socket.userId]);
  } catch (e) { /* ignore */ }
  
  io.emit('online', Array.from(onlineUsers.keys()));

  socket.on('send_message', async ({ to, text }, callback) => {
    if (!to || !text || !text.trim()) return;
    try {
      const result = await db.run(
        'INSERT INTO messages (sender_id, receiver_id, text) VALUES ($1, $2, $3) RETURNING id',
        [socket.userId, to, text.trim()]
      );
      const msg = await db.get('SELECT * FROM messages WHERE id = $1', [result.lastInsertRowid]);
      const msgObj = {
        id: Number(msg.id),
        sender_id: Number(msg.sender_id),
        receiver_id: Number(msg.receiver_id),
        text: msg.text,
        created_at: msg.created_at
      };
      const receiverSocket = onlineUsers.get(to);
      if (receiverSocket) io.to(receiverSocket).emit('new_message', msgObj);
      if (callback) callback(msgObj);
    } catch (e) { /* ignore */ }
  });

  socket.on('disconnect', async () => {
    onlineUsers.delete(socket.userId);
    try {
      await db.run('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = $1', [socket.userId]);
    } catch (e) { /* ignore */ }
    io.emit('online', Array.from(onlineUsers.keys()));
  });
});

// Старт
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`SakhaChat running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('❌ Ошибка инициализации БД:', err);
  process.exit(1);
});