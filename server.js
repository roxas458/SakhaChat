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
    res.json({ token, user: { id: newId, username, displayName, bio: '', status: '' } });
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
  res.json({ token, user: { id: userId, username: user.username, displayName: user.display_name, bio: user.bio || '', status: user.status || '' } });
});

// Logout
app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

// Свой профиль
app.get('/api/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, bio, status, created_at FROM users WHERE id = ?').get(req.userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ id: Number(user.id), username: user.username, displayName: user.display_name, bio: user.bio || '', status: user.status || '', createdAt: user.created_at });
});

// Профиль другого пользователя
app.get('/api/user/:id', auth, (req, res) => {
  const otherId = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id, username, display_name, bio, status, created_at FROM users WHERE id = ?').get(otherId);
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
    status: user.status || '',
    createdAt: user.created_at,
    firstMessageAt: firstMsg ? firstMsg.created_at : null
  });
});

// Обновление профиля
app.post('/api/profile', auth, (req, res) => {
  const { displayName, bio, status, currentPassword, newPassword } = req.body || {};
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
  if (status !== undefined) {
    const statusText = String(status).trim();
    if (statusText.length > 30) return res.status(400).json({ error: 'Статус не более 30 символов' });
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(statusText, req.userId);
  }
  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Введите текущий пароль' });
    if (newPassword.length < 4) return res.status(400).json({ error: 'Новый пароль от 4 символов' });
    const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.userId);
    if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(400).json({ error: 'Текущий пароль неверен' });
    const hash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.userId);
  }
  const updated = db.prepare('SELECT id, username, display_name, bio, status, created_at FROM users WHERE id = ?').get(req.userId);
  res.json({ id: Number(updated.id), username: updated.username, displayName: updated.display_name, bio: updated.bio || '', status: updated.status || '', createdAt: updated.created_at });
});

// Поиск
app.get('/api/users', auth, (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q || q.length < 3) return res.json([]);
  const users = db.prepare('SELECT id, username, display_name FROM users WHERE LOWER(username) = ? AND id != ? LIMIT 1').all(q, req.userId);
  res.json(toNumArr(users).map(u => ({ id: u.id, username: u.username, displayName: u.display_name })));
});

// Список моих чатов (личные)
app.get('/api/chats', auth, (req, res) => {
  const chats = db.prepare(`
    SELECT 
      u.id, u.username, u.display_name, u.last_seen, u.status,
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
    status: u.status || '',
    lastMessageTime: u.last_message_time
  })));
});

// Сообщения (личные)
app.get('/api/messages/:userId', auth, (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  const msgs = db.prepare(`
    SELECT id, sender_id, receiver_id, text, created_at FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC LIMIT 200
  `).all(req.userId, otherId, otherId, req.userId);
  res.json(toNumArr(msgs));
});

// ============ ИЗБРАННОЕ ============

app.get('/api/saved-messages', auth, (req, res) => {
  const msgs = db.prepare(`
    SELECT id, sender_id, receiver_id, text, created_at FROM messages
    WHERE sender_id = ? AND receiver_id = ?
    ORDER BY created_at ASC LIMIT 200
  `).all(req.userId, req.userId);
  res.json(toNumArr(msgs));
});

app.post('/api/messages', auth, (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Empty text' });
  if (text.trim().length > 5000) return res.status(400).json({ error: 'Слишком длинное сообщение' });

  const result = db.prepare(
    'INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)'
  ).run(req.userId, req.userId, text.trim());

  const msg = toNum(db.prepare('SELECT id, sender_id, receiver_id, text, created_at FROM messages WHERE id = ?').get(result.lastInsertRowid));
  res.json(msg);
});

// ============ ГРУППОВЫЕ ЧАТЫ ============

const MAX_GROUP_MEMBERS = 21; // 20 приглашённых + создатель

// Проверка: является ли пользователь участником группы
function isGroupMember(groupId, userId) {
  const row = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(groupId, userId);
  return !!row;
}

// Создать группу
app.post('/api/groups', auth, (req, res) => {
  const { name, memberIds } = req.body || {};
  const groupName = String(name || '').trim();
  if (!groupName) return res.status(400).json({ error: 'Введите название группы' });
  if (groupName.length > 40) return res.status(400).json({ error: 'Название не более 40 символов' });

  if (!Array.isArray(memberIds)) return res.status(400).json({ error: 'memberIds должен быть массивом' });

  // Очищаем: только числа, без создателя, без дублей
  const uniqueIds = [...new Set(
    memberIds
      .map(id => parseInt(id, 10))
      .filter(id => Number.isFinite(id) && id !== req.userId)
  )];

  if (uniqueIds.length === 0) return res.status(400).json({ error: 'Добавьте хотя бы одного участника' });
  if (uniqueIds.length + 1 > MAX_GROUP_MEMBERS) return res.status(400).json({ error: `Максимум ${MAX_GROUP_MEMBERS - 1} участников + вы` });

  // Проверяем, что все пользователи существуют
  const placeholders = uniqueIds.map(() => '?').join(',');
  const existing = db.prepare(`SELECT id FROM users WHERE id IN (${placeholders})`).all(...uniqueIds);
  if (existing.length !== uniqueIds.length) return res.status(400).json({ error: 'Некоторые пользователи не найдены' });

  try {
    const result = db.prepare('INSERT INTO groups (name, creator_id) VALUES (?, ?)').run(groupName, req.userId);
    const groupId = Number(result.lastInsertRowid);

    // Создатель + участники
    const insertMember = db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)');
    insertMember.run(groupId, req.userId);
    for (const uid of uniqueIds) insertMember.run(groupId, uid);

    res.json({ id: groupId, name: groupName, creatorId: req.userId, memberIds: [req.userId, ...uniqueIds] });
  } catch (e) {
    res.status(500).json({ error: 'Не удалось создать группу' });
  }
});

// Список моих групп
app.get('/api/groups', auth, (req, res) => {
  const groups = db.prepare(`
    SELECT 
      g.id, g.name, g.creator_id, g.created_at,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members_count,
      (SELECT MAX(created_at) FROM group_messages WHERE group_id = g.id) AS last_message_time
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY COALESCE(last_message_time, g.created_at) DESC
  `).all(req.userId);

  res.json(toNumArr(groups).map(g => ({
    id: g.id,
    name: g.name,
    creatorId: g.creator_id,
    createdAt: g.created_at,
    membersCount: g.members_count,
    lastMessageTime: g.last_message_time
  })));
});

// Инфо о группе + участники
app.get('/api/groups/:id', auth, (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  if (!isGroupMember(groupId, req.userId)) return res.status(403).json({ error: 'Нет доступа' });

  const group = db.prepare('SELECT id, name, creator_id, created_at FROM groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });

  const members = db.prepare(`
    SELECT u.id, u.username, u.display_name
    FROM users u
    JOIN group_members gm ON gm.user_id = u.id
    WHERE gm.group_id = ?
    ORDER BY u.display_name COLLATE NOCASE
  `).all(groupId);

  res.json({
    id: Number(group.id),
    name: group.name,
    creatorId: Number(group.creator_id),
    createdAt: group.created_at,
    members: toNumArr(members).map(m => ({ id: m.id, username: m.username, displayName: m.display_name }))
  });
});

// История сообщений группы
app.get('/api/groups/:id/messages', auth, (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  if (!isGroupMember(groupId, req.userId)) return res.status(403).json({ error: 'Нет доступа' });

  const msgs = db.prepare(`
    SELECT 
      gm.id, gm.group_id, gm.sender_id, gm.text, gm.created_at,
      u.display_name AS sender_name
    FROM group_messages gm
    JOIN users u ON u.id = gm.sender_id
    WHERE gm.group_id = ?
    ORDER BY gm.created_at ASC LIMIT 200
  `).all(groupId);

  res.json(toNumArr(msgs));
});

// Добавить участника (только создатель)
app.post('/api/groups/:id/members', auth, (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const { userId } = req.body || {};
  const newUserId = parseInt(userId, 10);

  const group = db.prepare('SELECT creator_id FROM groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (Number(group.creator_id) !== req.userId) return res.status(403).json({ error: 'Только создатель может добавлять' });

  if (!Number.isFinite(newUserId)) return res.status(400).json({ error: 'Некорректный userId' });
  if (isGroupMember(groupId, newUserId)) return res.status(400).json({ error: 'Уже в группе' });

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(newUserId);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  const count = db.prepare('SELECT COUNT(*) AS c FROM group_members WHERE group_id = ?').get(groupId);
  if (Number(count.c) >= MAX_GROUP_MEMBERS) return res.status(400).json({ error: `Максимум ${MAX_GROUP_MEMBERS} участников` });

  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(groupId, newUserId);
  res.json({ ok: true });
});

// Удалить участника / выйти (создатель может любого, участник — только себя)
app.delete('/api/groups/:id/members/:userId', auth, (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const targetId = parseInt(req.params.userId, 10);

  const group = db.prepare('SELECT creator_id FROM groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });

  const isCreator = Number(group.creator_id) === req.userId;
  const isSelf = targetId === req.userId;

  if (!isCreator && !isSelf) return res.status(403).json({ error: 'Нет прав' });
  if (!isGroupMember(groupId, targetId)) return res.status(404).json({ error: 'Не участник' });

  // Создатель не может выйти сам — только удалить группу
  if (isSelf && isCreator) return res.status(400).json({ error: 'Создатель не может выйти. Удалите группу.' });

  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, targetId);
  res.json({ ok: true });
});

// Удалить группу (только создатель)
app.delete('/api/groups/:id', auth, (req, res) => {
  const groupId = parseInt(req.params.id, 10);
  const group = db.prepare('SELECT creator_id FROM groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: 'Группа не найдена' });
  if (Number(group.creator_id) !== req.userId) return res.status(403).json({ error: 'Только создатель может удалить' });

  db.prepare('DELETE FROM group_messages WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
  res.json({ ok: true });
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
const typingTimers = new Map();

io.on('connection', (socket) => {
  onlineUsers.set(socket.userId, socket.id);
  
  db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(socket.userId);
  io.emit('online', Array.from(onlineUsers.keys()));

  // Подписываем на все группы пользователя
  const userGroups = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?').all(socket.userId);
  for (const g of userGroups) {
    socket.join('group_' + Number(g.group_id));
  }

  // Клиент может попросить подписаться на новую группу (после создания)
  socket.on('join_group', ({ groupId }) => {
    const gid = parseInt(groupId, 10);
    if (!Number.isFinite(gid)) return;
    if (isGroupMember(gid, socket.userId)) socket.join('group_' + gid);
  });

  // «Печатает...» (личные)
  socket.on('typing', ({ to, isTyping }) => {
    if (!to) return;
    const receiverSocket = onlineUsers.get(to);
    if (!receiverSocket) return;

    io.to(receiverSocket).emit('user_typing', { from: socket.userId, isTyping: !!isTyping });

    const key = socket.userId + ':' + to;
    if (typingTimers.has(key)) {
      clearTimeout(typingTimers.get(key));
      typingTimers.delete(key);
    }
    if (isTyping) {
      const timer = setTimeout(() => {
        io.to(receiverSocket).emit('user_typing', { from: socket.userId, isTyping: false });
        typingTimers.delete(key);
      }, 3000);
      typingTimers.set(key, timer);
    }
  });

  // Личное сообщение
  socket.on('send_message', ({ to, text }, callback) => {
    if (!to || !text || !text.trim()) return;
    if (text.trim().length > 5000) return;
    const result = db.prepare('INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)').run(socket.userId, to, text.trim());
    const msg = toNum(db.prepare('SELECT id, sender_id, receiver_id, text, created_at FROM messages WHERE id = ?').get(result.lastInsertRowid));
    const receiverSocket = onlineUsers.get(to);
    if (receiverSocket) io.to(receiverSocket).emit('new_message', msg);
    if (callback) callback(msg);
  });

  // Групповое сообщение
  socket.on('send_group_message', ({ groupId, text }, callback) => {
    const gid = parseInt(groupId, 10);
    if (!Number.isFinite(gid) || !text || !text.trim()) return;
    if (text.trim().length > 5000) return;
    if (!isGroupMember(gid, socket.userId)) return;

    const result = db.prepare('INSERT INTO group_messages (group_id, sender_id, text) VALUES (?, ?, ?)').run(gid, socket.userId, text.trim());
    const row = db.prepare(`
      SELECT gm.id, gm.group_id, gm.sender_id, gm.text, gm.created_at, u.display_name AS sender_name
      FROM group_messages gm JOIN users u ON u.id = gm.sender_id
      WHERE gm.id = ?
    `).get(result.lastInsertRowid);
    const msg = toNum(row);

    io.to('group_' + gid).emit('new_group_message', msg);
    if (callback) callback(msg);
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.userId);

    for (const [key, timer] of typingTimers.entries()) {
      if (key.startsWith(socket.userId + ':')) {
        clearTimeout(timer);
        typingTimers.delete(key);
      }
    }
    
    db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(socket.userId);
    io.emit('online', Array.from(onlineUsers.keys()));
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`SakhaChat running on http://localhost:${PORT}`);
});