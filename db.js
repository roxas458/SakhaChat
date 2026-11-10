const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('sakhachat.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id),
    FOREIGN KEY(receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_msg_pair ON messages(sender_id, receiver_id);

  -- ==================== ГРУППОВЫЕ ЧАТЫ ====================

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    creator_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(creator_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY(group_id) REFERENCES groups(id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS group_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(group_id) REFERENCES groups(id),
    FOREIGN KEY(sender_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_group_msg ON group_messages(group_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
`);

// Добавляем bio (описание профиля)
try {
  db.exec('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT "";');
} catch (e) { /* Колонка уже существует */ }

// Добавляем last_seen (время последнего визита)
try {
  db.exec('ALTER TABLE users ADD COLUMN last_seen DATETIME;');
} catch (e) { /* Колонка уже существует */ }

// Добавляем status (короткий статус пользователя)
try {
  db.exec('ALTER TABLE users ADD COLUMN status TEXT DEFAULT "";');
} catch (e) { /* Колонка уже существует */ }

// Добавляем avatar (base64-картинка, ресайз 128x128 JPEG)
try {
  db.exec('ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT "";');
} catch (e) { /* Колонка уже существует */ }

// ==================== ФОТО И ГОЛОСОВЫЕ В ЛИЧНЫХ СООБЩЕНИЯХ ====================
try {
  db.exec('ALTER TABLE messages ADD COLUMN photo TEXT DEFAULT "";');
} catch (e) { /* Колонка уже существует */ }
try {
  db.exec('ALTER TABLE messages ADD COLUMN voice TEXT DEFAULT "";');
} catch (e) { /* Колонка уже существует */ }
try {
  db.exec('ALTER TABLE messages ADD COLUMN voice_duration INTEGER DEFAULT 0;');
} catch (e) { /* Колонка уже существует */ }

// ==================== ФОТО И ГОЛОСОВЫЕ В ГРУППОВЫХ СООБЩЕНИЯХ ====================
try {
  db.exec('ALTER TABLE group_messages ADD COLUMN photo TEXT DEFAULT "";');
} catch (e) { /* Колонка уже существует */ }
try {
  db.exec('ALTER TABLE group_messages ADD COLUMN voice TEXT DEFAULT "";');
} catch (e) { /* Колонка уже существует */ }
try {
  db.exec('ALTER TABLE group_messages ADD COLUMN voice_duration INTEGER DEFAULT 0;');
} catch (e) { /* Колонка уже существует */ }

// ==================== УСТАРЕВШИЕ КОЛОНКИ (наследие отката «галочек прочитано») ====================
// Эти колонки больше НЕ используются ни в server.js, ни в app.js.
// Оставлены только чтобы не ломать существующую sakhachat.db (SQLite DROP COLUMN рискован).
// При следующей чистовой миграции БД — можно удалить.
try {
  db.exec('ALTER TABLE messages ADD COLUMN delivered INTEGER DEFAULT 0;');
} catch (e) { /* Колонка уже существует */ }

try {
  db.exec('ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0;');
} catch (e) { /* Колонка уже существует */ }

module.exports = db;