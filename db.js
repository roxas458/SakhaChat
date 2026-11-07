const { Pool } = require('pg');

// Строка подключения из Render (Шаг 1)
// ⚠️ ЗАМЕНИ на свою строку!
const connectionString = process.env.DATABASE_URL || 'postgresql://sakhachat_user:9i45TEyar3BWnlbwE3ELo6KEZlZsLahi@dpg-dbnh6iqjnfac73ccantg-a/sakhachat';

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Обёртка, чтобы API был похож на старый (SQLite)
// В SQLite: db.prepare('SELECT ...').get(a, b) — синхронно
// В PostgreSQL: async, поэтому методы возвращают Promise
const db = {
  // Выполнить запрос (INSERT, UPDATE, DELETE) — вернёт { lastInsertRowid }
  async run(sql, params = []) {
    // Преобразуем "?" в "$1, $2, ..." для PostgreSQL
    const pgSql = convertPlaceholders(sql);
    const result = await pool.query(pgSql, params);
    return { lastInsertRowid: result.rows[0]?.id || null, changes: result.rowCount };
  },

  // Получить одну строку
  async get(sql, params = []) {
    const pgSql = convertPlaceholders(sql);
    const result = await pool.query(pgSql, params);
    return result.rows[0] || null;
  },

  // Получить все строки
  async all(sql, params = []) {
    const pgSql = convertPlaceholders(sql);
    const result = await pool.query(pgSql, params);
    return result.rows;
  }
};

// Превращает "?" в "$1, $2, ..." для PostgreSQL
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Создаём таблицы (выполняется при старте сервера)
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL,
      bio TEXT DEFAULT '',
      last_seen TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  console.log('✅ База данных PostgreSQL инициализирована');
}

// Экспортируем всё
module.exports = db;
module.exports.initDatabase = initDatabase;
module.exports.pool = pool;