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

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return res.status(401).json({ error: 'Invalid token' });
  req.userId = session.user_id;
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
    const result = db.prepare('INSERT INTO users (username, password, display_name) VALUES (?, ?, ?)').run(username, hash, displayName);
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, result.lastInsertRowid);
    res.json({ token, user: { id: result.lastInsertRowid, username, displayName } });
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
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  res.json({ token, user: { id: user.id, username: user.username, displayName: user.display_name } });
});

// Logout
app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

// Search users
app.get('/api/users', auth, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const users = db.prepare(
    'SELECT id, username, display_name FROM users WHERE (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?) AND id != ? LIMIT 20'
  ).all(`%${q}%`, `%${q}%`, req.userId);
  res.json(users.map(u => ({ id: u.id, username: u.username, displayName: u.display_name })));
});

// Get messages with user
app.get('/api/messages/:userId', auth, (req, res) => {
  const otherId = parseInt(req.params.userId);
  const msgs = db.prepare(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
    ORDER BY created_at ASC
    LIMIT 200
  `).all(req.userId, otherId, otherId, req.userId);
  res.json(msgs);
});

// Socket.io with auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
  if (!session) return next(new Error('Unauthorized'));
  socket.userId = session.user_id;
  next();
});

const onlineUsers = new Map();

io.on('connection', (socket) => {
  onlineUsers.set(socket.userId, socket.id);
  
  // Broadcast online status
  io.emit('online', Array.from(onlineUsers.keys()));

  socket.on('send_message', ({ to, text }, callback) => {
    if (!to || !text || !text.trim()) return;
    const result = db.prepare('INSERT INTO messages (sender_id, receiver_id, text) VALUES (?, ?, ?)').run(socket.userId, to, text.trim());
    const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
    
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