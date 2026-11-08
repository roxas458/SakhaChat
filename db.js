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
`);

// Добавляем bio (описание профиля)
try {
  db.exec('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT "";');
} catch (e) { /* Колонка уже существует */ }

// Добавляем last_seen (время последнего визита)
try {
  db.exec('ALTER TABLE users ADD COLUMN last_seen DATETIME;');
} catch (e) { /* Колонка уже существует */ }

// Оставляем колонки для галочек (чтобы старый код не падал)
try {
  db.exec('ALTER TABLE messages ADD COLUMN delivered INTEGER DEFAULT 0;');
} catch (e) { /* Колонка уже существует */ }

try {
  db.exec('ALTER TABLE messages ADD COLUMN is_read INTEGER DEFAULT 0;');
} catch (e) { /* Колонка уже существует */ }

// Добавляем reply_to_id (ID сообщения, на которое отвечают)
try {
  db.exec('ALTER TABLE messages ADD COLUMN reply_to_id INTEGER;');
} catch (e) { /* Колонка уже существует */ }

// Добавляем edited_at (время последнего изменения сообщения)
try {
  db.exec('ALTER TABLE messages ADD COLUMN edited_at DATETIME;');
} catch (e) { /* Колонка уже существует */ }

module.exports = db;