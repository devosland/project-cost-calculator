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

db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
  )
`);

// New tables for per-project storage, sharing, snapshots, templates
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

db.exec(`
  CREATE TABLE IF NOT EXISTS project_shares (
    id INTEGER PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project_id, user_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS project_snapshots (
    id INTEGER PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    data TEXT NOT NULL,
    label TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration: move project data from user_data.projects into the projects table
function migrateUserDataToProjects() {
  try {
    const rows = db.prepare("SELECT user_id, projects FROM user_data WHERE projects IS NOT NULL AND projects != '[]'").all();
    if (rows.length === 0) return;

    const insertProject = db.prepare(
      'INSERT OR IGNORE INTO projects (id, owner_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
    );
    const clearProjects = db.prepare("UPDATE user_data SET projects = '[]' WHERE user_id = ?");

    const migrate = db.transaction(() => {
      for (const row of rows) {
        let projects;
        try {
          projects = JSON.parse(row.projects);
        } catch {
          continue;
        }
        if (!Array.isArray(projects) || projects.length === 0) continue;

        for (const project of projects) {
          if (!project.id) continue;
          insertProject.run(
            project.id,
            row.user_id,
            project.name || 'Sans titre',
            JSON.stringify(project)
          );
        }
        clearProjects.run(row.user_id);
      }
    });

    migrate();
    console.log(`Migration: processed ${rows.length} user_data rows`);
  } catch (err) {
    console.error('Migration error (non-fatal):', err);
  }
}

migrateUserDataToProjects();

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

function createPasswordReset(userId, token, expiresAt) {
  const stmt = db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)');
  stmt.run(userId, token, expiresAt);
}

function findValidReset(token) {
  const stmt = db.prepare("SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')");
  return stmt.get(token);
}

function markResetUsed(token) {
  const stmt = db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?');
  stmt.run(token);
}

function updateUserPassword(userId, passwordHash) {
  const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  stmt.run(passwordHash, userId);
}

// Project helpers
function getProjectsByUser(userId) {
  const stmt = db.prepare(`
    SELECT p.id, p.name, p.data, 'owner' AS role, p.owner_id, u.name AS owner_name
    FROM projects p
    JOIN users u ON u.id = p.owner_id
    WHERE p.owner_id = ?
    UNION
    SELECT p.id, p.name, p.data, ps.role, p.owner_id, u.name AS owner_name
    FROM projects p
    JOIN project_shares ps ON ps.project_id = p.id
    JOIN users u ON u.id = p.owner_id
    WHERE ps.user_id = ?
  `);
  return stmt.all(userId, userId);
}

function getProjectById(projectId) {
  const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
  return stmt.get(projectId);
}

function createProjectRecord(id, ownerId, name, data) {
  const stmt = db.prepare(
    'INSERT INTO projects (id, owner_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  );
  stmt.run(id, ownerId, name, data);
}

function updateProjectRecord(projectId, name, data) {
  const stmt = db.prepare(
    'UPDATE projects SET name = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  stmt.run(name, data, projectId);
}

function deleteProjectRecord(projectId) {
  const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
  stmt.run(projectId);
}

function shareProject(projectId, userId, role) {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO project_shares (project_id, user_id, role, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
  );
  stmt.run(projectId, userId, role);
}

function unshareProject(projectId, userId) {
  const stmt = db.prepare('DELETE FROM project_shares WHERE project_id = ? AND user_id = ?');
  stmt.run(projectId, userId);
}

function getProjectShares(projectId) {
  const stmt = db.prepare(`
    SELECT ps.id, ps.user_id, ps.role, ps.created_at, u.email, u.name
    FROM project_shares ps
    JOIN users u ON u.id = ps.user_id
    WHERE ps.project_id = ?
  `);
  return stmt.all(projectId);
}

function createSnapshot(projectId, userId, data, label) {
  const stmt = db.prepare(
    'INSERT INTO project_snapshots (project_id, user_id, data, label, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
  );
  const result = stmt.run(projectId, userId, data, label);
  return { id: result.lastInsertRowid, project_id: projectId, user_id: userId, data, label };
}

function getSnapshots(projectId) {
  const stmt = db.prepare(
    'SELECT id, project_id, user_id, label, created_at FROM project_snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT 50'
  );
  return stmt.all(projectId);
}

function getSnapshotById(snapshotId) {
  const stmt = db.prepare('SELECT * FROM project_snapshots WHERE id = ?');
  return stmt.get(snapshotId);
}

function createTemplate(userId, name, data) {
  const stmt = db.prepare(
    'INSERT INTO templates (user_id, name, data, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
  );
  const result = stmt.run(userId, name, data);
  return { id: result.lastInsertRowid, user_id: userId, name, data, created_at: new Date().toISOString() };
}

function getTemplatesByUser(userId) {
  const stmt = db.prepare('SELECT * FROM templates WHERE user_id = ?');
  return stmt.all(userId);
}

function deleteTemplate(templateId, userId) {
  const stmt = db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?');
  return stmt.run(templateId, userId);
}

function findUserById(userId) {
  const stmt = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?');
  return stmt.get(userId);
}

function upsertProjectRecord(id, ownerId, name, data) {
  const stmt = db.prepare(`
    INSERT INTO projects (id, owner_id, name, data, created_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      data = excluded.data,
      updated_at = CURRENT_TIMESTAMP
  `);
  stmt.run(id, ownerId, name, data);
}

export {
  db,
  createUser,
  findUserByEmail,
  findUserById,
  getUserData,
  saveUserData,
  createPasswordReset,
  findValidReset,
  markResetUsed,
  updateUserPassword,
  getProjectsByUser,
  getProjectById,
  createProjectRecord,
  updateProjectRecord,
  deleteProjectRecord,
  upsertProjectRecord,
  shareProject,
  unshareProject,
  getProjectShares,
  createSnapshot,
  getSnapshots,
  getSnapshotById,
  createTemplate,
  getTemplatesByUser,
  deleteTemplate
};
