import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const dataDir = process.env.DATA_DIR || './data';

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_data (
    id INTEGER PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id),
    projects TEXT DEFAULT '[]',
    rates TEXT DEFAULT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Helper functions
function createUser(email, name, passwordHash) {
  const stmt = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)');
  const result = stmt.run(email, name, passwordHash);
  return { id: result.lastInsertRowid, email, name };
}

function findUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email);
}

function getUserData(userId) {
  const stmt = db.prepare('SELECT projects, rates, updated_at FROM user_data WHERE user_id = ?');
  const row = stmt.get(userId);
  if (!row) {
    return { projects: '[]', rates: null, updated_at: null };
  }
  return row;
}

function saveUserData(userId, projects, rates) {
  const stmt = db.prepare(`
    INSERT INTO user_data (user_id, projects, rates, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET
      projects = excluded.projects,
      rates = excluded.rates,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(userId, projects, rates);
}

export { db, createUser, findUserByEmail, getUserData, saveUserData };
