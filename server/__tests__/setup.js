import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Creates a test SQLite database (temp file on disk).
 * Returns { db, dbPath }.
 */
export function createTestDb() {
  const dir = mkdtempSync(join(tmpdir(), 'pcc-test-'));
  const dbPath = join(dir, 'test.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return { db, dbPath };
}

/**
 * Closes the database and removes the temp directory.
 */
export function destroyTestDb(db, dbPath) {
  try {
    db.close();
  } catch {
    // already closed
  }
  try {
    // Remove the temp directory and its contents
    const dir = join(dbPath, '..');
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
}

/**
 * Creates all application tables including the 3 capacity-management tables.
 * This is self-contained so tests don't depend on the production db.js module.
 */
export function seedSchema(db) {
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
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // --- Capacity management tables ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      level TEXT NOT NULL,
      max_capacity INTEGER DEFAULT 100,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, name)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS resource_assignments (
      id INTEGER PRIMARY KEY,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      phase_id TEXT NOT NULL,
      allocation INTEGER NOT NULL,
      start_month TEXT NOT NULL,
      end_month TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(resource_id, project_id, phase_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS transition_plans (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // --- Indexes ---

  db.exec(`CREATE INDEX IF NOT EXISTS idx_resources_user ON resources(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assignments_resource_months ON resource_assignments(resource_id, start_month, end_month)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assignments_project ON resource_assignments(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_transition_plans_user ON transition_plans(user_id)`);
}

/**
 * Inserts a test user and returns the user row.
 */
export function seedUser(db, options = {}) {
  const {
    email = 'test@example.com',
    name = 'Test User',
    passwordHash = '$2b$10$fakehashfortest',
  } = options;

  const stmt = db.prepare(
    'INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)'
  );
  const result = stmt.run(email, name, passwordHash);
  return { id: Number(result.lastInsertRowid), email, name };
}

/**
 * Inserts a test project and returns the project row.
 */
export function seedProject(db, userId, options = {}) {
  const {
    id = 'proj-' + Math.random().toString(36).slice(2, 10),
    name = 'Test Project',
    data = '{}',
  } = options;

  const stmt = db.prepare(
    'INSERT INTO projects (id, owner_id, name, data) VALUES (?, ?, ?, ?)'
  );
  stmt.run(id, userId, name, data);
  return { id, owner_id: userId, name, data };
}
