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
      linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
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

  // --- Execution module tables (mirrors server/db.js) ---

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_key_counters (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('epic','story','task')),
      last_key INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (project_id, entity_type)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_statuses (
      id INTEGER PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('todo','inprogress','done')),
      order_idx INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (project_id, name)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_transitions (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      from_status TEXT NOT NULL,
      to_status TEXT NOT NULL,
      PRIMARY KEY (project_id, from_status, to_status)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS epics (
      id INTEGER PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      milestone_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (project_id, key)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS epic_phases (
      epic_id INTEGER NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
      phase_id TEXT NOT NULL,
      PRIMARY KEY (epic_id, phase_id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      id INTEGER PRIMARY KEY,
      epic_id INTEGER NOT NULL REFERENCES epics(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      estimate_hours REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (epic_id, key)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY,
      story_id INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      assignee_id INTEGER REFERENCES resources(id) ON DELETE SET NULL,
      estimate_hours REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (story_id, key)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      hours REAL NOT NULL CHECK (hours > 0 AND hours <= 24),
      note TEXT,
      rate_hourly REAL NOT NULL,
      rate_role TEXT,
      rate_level TEXT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','timer')),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS active_timers (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS project_closed_periods (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      period TEXT NOT NULL,
      closed_at TEXT NOT NULL,
      closed_by_user INTEGER NOT NULL REFERENCES users(id),
      PRIMARY KEY (project_id, period)
    )
  `);

  // --- Indexes ---

  db.exec(`CREATE INDEX IF NOT EXISTS idx_resources_user ON resources(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assignments_resource_months ON resource_assignments(resource_id, start_month, end_month)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assignments_project ON resource_assignments(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_transition_plans_user ON transition_plans(user_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_epics_project ON epics(project_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_epics_milestone ON epics(milestone_id) WHERE milestone_id IS NOT NULL`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_epic_phases_phase ON epic_phases(phase_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_stories_epic ON stories(epic_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_story ON tasks(story_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id) WHERE assignee_id IS NOT NULL`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_time_task ON time_entries(task_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_time_resource_date ON time_entries(resource_id, date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_closed_project ON project_closed_periods(project_id, period)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_resources_linked_user ON resources(linked_user_id) WHERE linked_user_id IS NOT NULL`);
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
