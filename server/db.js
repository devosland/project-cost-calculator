/**
 * SQLite database layer — schema initialisation, migration, and CRUD helpers.
 *
 * Database structure (tables and relations):
 *   users                  — registered accounts (email unique)
 *   user_data              — legacy bulk storage (projects JSON + rates JSON), one row per user.
 *                            The `projects` column is kept as '[]' post-migration; rates are still live.
 *   password_resets        — single-use tokens for the forgot-password flow (expires_at, used flag)
 *   projects               — per-project records (id TEXT PK, owner_id → users, data JSON)
 *   project_shares         — many-to-many: projects ↔ users with a role ('viewer'|'editor')
 *   project_snapshots      — point-in-time copies of project data for history/restore
 *   templates              — reusable project structures owned by a user
 *   resources              — capacity pool: people with role/level/max_capacity (unique per user+name)
 *   resource_assignments   — links resource → project phase with allocation% and date range (YYYY-MM)
 *                            UNIQUE(resource_id, project_id, phase_id)
 *   transition_plans       — consultant-to-permanent transition plans, status: draft|applied
 *   api_keys               — hashed API keys with scopes and rate limits (revoked_at for soft-delete)
 *   api_key_usage          — per-request log: endpoint, method, status code, IP
 *
 * WAL mode is enabled for better read concurrency under the single-writer SQLite model.
 * Foreign keys are ON so cascade deletes work (e.g. deleting a resource cascades to assignments).
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';

const dataDir = process.env.DATA_DIR || './data';

if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new Database(dbPath);

// WAL mode reduces write contention; foreign keys enforce referential integrity.
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---

// Core user accounts table.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Legacy bulk data store: rates column is active; projects column is kept as '[]'
// post-migration (projects now live in the dedicated `projects` table).
db.exec(`
  CREATE TABLE IF NOT EXISTS user_data (
    id INTEGER PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id),
    projects TEXT DEFAULT '[]',
    rates TEXT DEFAULT NULL,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Single-use, time-limited tokens for the forgot-password flow.
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    token TEXT UNIQUE NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
  )
`);

// Per-project records with a TEXT primary key (client-generated UUIDs or "rm_..." prefixes).
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

// Access control for project sharing; UNIQUE(project_id, user_id) ensures one role per user.
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

// Immutable point-in-time copies of project JSON for history and restore operations.
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

// Reusable project scaffolds owned by individual users.
db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// Capacity resource pool: one row per person; UNIQUE(user_id, name) prevents duplicates.
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

// Links a resource to a project phase for a date range (YYYY-MM).
// UNIQUE(resource_id, project_id, phase_id) prevents double-booking the same resource on the same phase.
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

// Consultant-to-permanent transition plans; status moves draft → applied on execution.
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

// API keys: plaintext key is never stored — only key_prefix (display) and key_hash (lookup).
// revoked_at is a soft-delete so usage logs remain queryable after revocation.
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '[]',
    rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
    last_used_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT,
    UNIQUE(key_hash)
  )
`);

// Append-only usage log written after each API key request (endpoint, method, status, IP).
db.exec(`
  CREATE TABLE IF NOT EXISTS api_key_usage (
    id INTEGER PRIMARY KEY,
    api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    ip TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// --- Indexes ---

db.exec(`CREATE INDEX IF NOT EXISTS idx_resources_user ON resources(user_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_assignments_resource_months ON resource_assignments(resource_id, start_month, end_month)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_assignments_project ON resource_assignments(project_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_transition_plans_user ON transition_plans(user_id)`);
// Partial index: only index active (non-revoked) keys for fast authentication lookups.
db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id) WHERE revoked_at IS NULL`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_api_key_usage_key ON api_key_usage(api_key_id, created_at)`);

// --- Migration ---

/**
 * One-time migration: moves projects from the legacy user_data.projects JSON blob
 * into the dedicated `projects` table. Runs on every startup but is effectively a no-op
 * once user_data.projects has been cleared to '[]'.
 * Uses INSERT OR IGNORE so partially-migrated data is handled safely.
 */
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
    // Migration is non-fatal: the server starts normally and can be re-run on next restart.
    console.error('Migration error (non-fatal):', err);
  }
}

migrateUserDataToProjects();

// --- Helper functions ---

// User helpers

/**
 * Creates a new user account. Expects the password to already be hashed.
 * @param {string} email - Normalised (lowercase, trimmed) email address.
 * @param {string} name
 * @param {string} passwordHash - bcrypt hash of the user's password.
 * @returns {{ id: number, email: string, name: string }}
 */
function createUser(email, name, passwordHash) {
  const stmt = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)');
  const result = stmt.run(email, name, passwordHash);
  return { id: result.lastInsertRowid, email, name };
}

/**
 * Finds a user by their email address. Returns the full row including password_hash
 * so callers can verify credentials. Returns undefined if not found.
 * @param {string} email
 * @returns {object|undefined}
 */
function findUserByEmail(email) {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
  return stmt.get(email);
}

/**
 * Finds a user by ID, excluding password_hash for safe use in auth context.
 * @param {number} userId
 * @returns {{ id, email, name, created_at }|undefined}
 */
function findUserById(userId) {
  const stmt = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?');
  return stmt.get(userId);
}

/**
 * Returns the user_data row for a user (rates + legacy projects column).
 * Returns safe defaults when no row exists yet (new users before first save).
 * @param {number} userId
 * @returns {{ projects: string, rates: string|null, updated_at: string|null }}
 */
function getUserData(userId) {
  const stmt = db.prepare('SELECT projects, rates, updated_at FROM user_data WHERE user_id = ?');
  const row = stmt.get(userId);
  if (!row) {
    return { projects: '[]', rates: null, updated_at: null };
  }
  return row;
}

/**
 * Upserts the user_data row for a user (INSERT OR UPDATE on conflict).
 * The `projects` column should always be passed as '[]' post-migration.
 * @param {number} userId
 * @param {string} projects - JSON string (kept for schema compat; always '[]' now).
 * @param {string|null} rates - JSON string of the rates object, or null to clear.
 */
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

// Password reset helpers

/**
 * Inserts a new password reset token. Does not expire existing tokens — they are
 * invalidated by their expires_at timestamp and the used flag.
 * @param {number} userId
 * @param {string} token - UUID v4 random token.
 * @param {string} expiresAt - ISO 8601 datetime string (1 hour from now).
 */
function createPasswordReset(userId, token, expiresAt) {
  const stmt = db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)');
  stmt.run(userId, token, expiresAt);
}

/**
 * Finds a valid (unused and not expired) reset token.
 * @param {string} token
 * @returns {object|undefined} The reset row including user_id, or undefined if invalid.
 */
function findValidReset(token) {
  const stmt = db.prepare("SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime('now')");
  return stmt.get(token);
}

/**
 * Marks a reset token as used so it cannot be replayed.
 * @param {string} token
 */
function markResetUsed(token) {
  const stmt = db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?');
  stmt.run(token);
}

/**
 * Updates a user's password hash. Called after a successful reset.
 * @param {number} userId
 * @param {string} passwordHash - New bcrypt hash.
 */
function updateUserPassword(userId, passwordHash) {
  const stmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  stmt.run(passwordHash, userId);
}

// Project helpers

/**
 * Returns all projects accessible to a user — owned projects via direct ownership,
 * plus shared projects via project_shares. The UNION ensures there is no duplication.
 * @param {number} userId
 * @returns {{ id, name, data, role, owner_id, owner_name }[]}
 */
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

/**
 * Fetches a single project by ID (all columns).
 * @param {string} projectId
 * @returns {object|undefined}
 */
function getProjectById(projectId) {
  const stmt = db.prepare('SELECT * FROM projects WHERE id = ?');
  return stmt.get(projectId);
}

/**
 * Inserts a new project record. Caller is responsible for generating a unique ID.
 * @param {string} id
 * @param {number} ownerId
 * @param {string} name
 * @param {string} data - JSON string of the full project object.
 */
function createProjectRecord(id, ownerId, name, data) {
  const stmt = db.prepare(
    'INSERT INTO projects (id, owner_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  );
  stmt.run(id, ownerId, name, data);
}

/**
 * Updates a project's name and data. Touches updated_at automatically.
 * @param {string} projectId
 * @param {string} name
 * @param {string} data - JSON string.
 */
function updateProjectRecord(projectId, name, data) {
  const stmt = db.prepare(
    'UPDATE projects SET name = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  stmt.run(name, data, projectId);
}

/**
 * Hard-deletes a project. Cascades to project_shares and project_snapshots.
 * @param {string} projectId
 */
function deleteProjectRecord(projectId) {
  const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
  stmt.run(projectId);
}

/**
 * Inserts or updates a project record (used by the bulk PUT /api/data endpoint).
 * On conflict (same id), updates name, data, and updated_at.
 * @param {string} id
 * @param {number} ownerId
 * @param {string} name
 * @param {string} data - JSON string.
 */
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

// Project sharing helpers

/**
 * Grants or updates a user's access to a project (INSERT OR REPLACE).
 * @param {string} projectId
 * @param {number} userId - The user being granted access.
 * @param {'viewer'|'editor'} role
 */
function shareProject(projectId, userId, role) {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO project_shares (project_id, user_id, role, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
  );
  stmt.run(projectId, userId, role);
}

/**
 * Removes a user's access to a project.
 * @param {string} projectId
 * @param {number} userId
 */
function unshareProject(projectId, userId) {
  const stmt = db.prepare('DELETE FROM project_shares WHERE project_id = ? AND user_id = ?');
  stmt.run(projectId, userId);
}

/**
 * Returns all share records for a project including the shared user's email and name.
 * @param {string} projectId
 * @returns {{ id, user_id, role, created_at, email, name }[]}
 */
function getProjectShares(projectId) {
  const stmt = db.prepare(`
    SELECT ps.id, ps.user_id, ps.role, ps.created_at, u.email, u.name
    FROM project_shares ps
    JOIN users u ON u.id = ps.user_id
    WHERE ps.project_id = ?
  `);
  return stmt.all(projectId);
}

// Snapshot helpers

/**
 * Creates a new snapshot of a project's data at the current moment.
 * @param {string} projectId
 * @param {number} userId - The user triggering the snapshot.
 * @param {string} data - JSON string of project data.
 * @param {string|null} label - Human-readable label (e.g. 'creation', 'roadmap-import').
 * @returns {{ id, project_id, user_id, data, label }}
 */
function createSnapshot(projectId, userId, data, label) {
  const stmt = db.prepare(
    'INSERT INTO project_snapshots (project_id, user_id, data, label, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)'
  );
  const result = stmt.run(projectId, userId, data, label);
  return { id: result.lastInsertRowid, project_id: projectId, user_id: userId, data, label };
}

/**
 * Lists up to 50 snapshots for a project, newest first (data column excluded for performance).
 * @param {string} projectId
 * @returns {{ id, project_id, user_id, label, created_at }[]}
 */
function getSnapshots(projectId) {
  const stmt = db.prepare(
    'SELECT id, project_id, user_id, label, created_at FROM project_snapshots WHERE project_id = ? ORDER BY created_at DESC LIMIT 50'
  );
  return stmt.all(projectId);
}

/**
 * Fetches a single snapshot by ID including the full data column (used for restore).
 * @param {number} snapshotId
 * @returns {object|undefined}
 */
function getSnapshotById(snapshotId) {
  const stmt = db.prepare('SELECT * FROM project_snapshots WHERE id = ?');
  return stmt.get(snapshotId);
}

// Template helpers

/**
 * Creates a new template for a user.
 * @param {number} userId
 * @param {string} name
 * @param {string} data - JSON string of the template structure.
 * @returns {{ id, user_id, name, data, created_at }}
 */
function createTemplate(userId, name, data) {
  const stmt = db.prepare(
    'INSERT INTO templates (user_id, name, data, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
  );
  const result = stmt.run(userId, name, data);
  return { id: result.lastInsertRowid, user_id: userId, name, data, created_at: new Date().toISOString() };
}

/**
 * Returns all templates owned by a user.
 * @param {number} userId
 * @returns {object[]}
 */
function getTemplatesByUser(userId) {
  const stmt = db.prepare('SELECT * FROM templates WHERE user_id = ?');
  return stmt.all(userId);
}

/**
 * Deletes a template. The user_id check prevents cross-user deletion.
 * @param {number} templateId
 * @param {number} userId
 * @returns {import('better-sqlite3').RunResult}
 */
function deleteTemplate(templateId, userId) {
  const stmt = db.prepare('DELETE FROM templates WHERE id = ? AND user_id = ?');
  return stmt.run(templateId, userId);
}

// Resource helpers

/**
 * Returns all resources in a user's pool, ordered by name.
 * @param {number} userId
 * @returns {object[]}
 */
function getResourcesByUser(userId) {
  const stmt = db.prepare('SELECT * FROM resources WHERE user_id = ? ORDER BY name');
  return stmt.all(userId);
}

/**
 * Fetches a single resource by its integer ID (all columns).
 * @param {number} resourceId
 * @returns {object|undefined}
 */
function getResourceById(resourceId) {
  const stmt = db.prepare('SELECT * FROM resources WHERE id = ?');
  return stmt.get(resourceId);
}

/**
 * Creates a new resource in a user's pool.
 * @param {number} userId
 * @param {string} name
 * @param {string} role
 * @param {string} level
 * @param {number} [maxCapacity=100] - Percentage of time available (0–100).
 * @returns {{ id, user_id, name, role, level, max_capacity }}
 * @throws {Error} If a resource with the same name already exists for this user (UNIQUE constraint).
 */
function createResource(userId, name, role, level, maxCapacity = 100) {
  const stmt = db.prepare(
    'INSERT INTO resources (user_id, name, role, level, max_capacity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  );
  const result = stmt.run(userId, name, role, level, maxCapacity);
  return { id: Number(result.lastInsertRowid), user_id: userId, name, role, level, max_capacity: maxCapacity };
}

/**
 * Updates all editable fields of a resource.
 * @param {number} resourceId
 * @param {string} name
 * @param {string} role
 * @param {string} level
 * @param {number} maxCapacity
 * @returns {import('better-sqlite3').RunResult}
 */
function updateResource(resourceId, name, role, level, maxCapacity) {
  const stmt = db.prepare(
    'UPDATE resources SET name = ?, role = ?, level = ?, max_capacity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  return stmt.run(name, role, level, maxCapacity, resourceId);
}

/**
 * Deletes a resource. ON DELETE CASCADE removes all assignments for this resource.
 * @param {number} resourceId
 * @returns {import('better-sqlite3').RunResult}
 */
function deleteResource(resourceId) {
  const stmt = db.prepare('DELETE FROM resources WHERE id = ?');
  return stmt.run(resourceId);
}

// Assignment helpers

/**
 * Returns all assignments for a user's resources with enriched resource and project names.
 * @param {number} userId
 * @returns {{ id, resource_id, project_id, phase_id, allocation, start_month, end_month,
 *             resource_name, resource_role, project_name }[]}
 */
function getAssignmentsByUser(userId) {
  const stmt = db.prepare(`
    SELECT ra.*, r.name AS resource_name, r.role AS resource_role, p.name AS project_name
    FROM resource_assignments ra
    JOIN resources r ON r.id = ra.resource_id
    JOIN projects p ON p.id = ra.project_id
    WHERE r.user_id = ?
    ORDER BY ra.start_month
  `);
  return stmt.all(userId);
}

/**
 * Returns all assignments for a specific resource, ordered by start month.
 * @param {number} resourceId
 * @returns {object[]}
 */
function getAssignmentsByResource(resourceId) {
  const stmt = db.prepare('SELECT * FROM resource_assignments WHERE resource_id = ? ORDER BY start_month');
  return stmt.all(resourceId);
}

/**
 * Returns all assignments on a specific project, ordered by start month.
 * @param {string} projectId
 * @returns {object[]}
 */
function getAssignmentsByProject(projectId) {
  const stmt = db.prepare('SELECT * FROM resource_assignments WHERE project_id = ? ORDER BY start_month');
  return stmt.all(projectId);
}

/**
 * Creates a new resource assignment.
 * @param {number} resourceId
 * @param {string} projectId
 * @param {string} phaseId
 * @param {number} allocation - Percentage (0–100).
 * @param {string} startMonth - YYYY-MM
 * @param {string} endMonth   - YYYY-MM
 * @returns {{ id, resource_id, project_id, phase_id, allocation, start_month, end_month }}
 * @throws {Error} On UNIQUE constraint violation (same resource/project/phase).
 */
function createAssignment(resourceId, projectId, phaseId, allocation, startMonth, endMonth) {
  const stmt = db.prepare(
    'INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  );
  const result = stmt.run(resourceId, projectId, phaseId, allocation, startMonth, endMonth);
  return { id: Number(result.lastInsertRowid), resource_id: resourceId, project_id: projectId, phase_id: phaseId, allocation, start_month: startMonth, end_month: endMonth };
}

/**
 * Updates an assignment's allocation and date range.
 * @param {number} assignmentId
 * @param {number} allocation
 * @param {string} startMonth - YYYY-MM
 * @param {string} endMonth   - YYYY-MM
 * @returns {import('better-sqlite3').RunResult}
 */
function updateAssignment(assignmentId, allocation, startMonth, endMonth) {
  const stmt = db.prepare(
    'UPDATE resource_assignments SET allocation = ?, start_month = ?, end_month = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  return stmt.run(allocation, startMonth, endMonth, assignmentId);
}

/**
 * Deletes an assignment by ID.
 * @param {number} assignmentId
 * @returns {import('better-sqlite3').RunResult}
 */
function deleteAssignment(assignmentId) {
  const stmt = db.prepare('DELETE FROM resource_assignments WHERE id = ?');
  return stmt.run(assignmentId);
}

// Transition plan helpers

/**
 * Returns all transition plans for a user, ordered by most recently updated.
 * @param {number} userId
 * @returns {object[]}
 */
function getTransitionPlansByUser(userId) {
  const stmt = db.prepare('SELECT * FROM transition_plans WHERE user_id = ? ORDER BY updated_at DESC');
  return stmt.all(userId);
}

/**
 * Fetches a single transition plan by ID.
 * @param {number} planId
 * @returns {object|undefined}
 */
function getTransitionPlanById(planId) {
  const stmt = db.prepare('SELECT * FROM transition_plans WHERE id = ?');
  return stmt.get(planId);
}

/**
 * Creates a new transition plan in 'draft' status.
 * @param {number} userId
 * @param {string} name
 * @param {string} [data='{}'] - JSON string of the plan payload.
 * @returns {{ id, user_id, name, status: 'draft', data }}
 */
function createTransitionPlan(userId, name, data = '{}') {
  const stmt = db.prepare(
    'INSERT INTO transition_plans (user_id, name, data, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  );
  const result = stmt.run(userId, name, data);
  return { id: Number(result.lastInsertRowid), user_id: userId, name, status: 'draft', data };
}

/**
 * Updates a transition plan's name, status, and data.
 * @param {number} planId
 * @param {string} name
 * @param {string} status - e.g. 'draft' | 'applied'
 * @param {string} data - JSON string.
 * @returns {import('better-sqlite3').RunResult}
 */
function updateTransitionPlan(planId, name, status, data) {
  const stmt = db.prepare(
    'UPDATE transition_plans SET name = ?, status = ?, data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  );
  return stmt.run(name, status, data, planId);
}

/**
 * Permanently deletes a transition plan.
 * @param {number} planId
 * @returns {import('better-sqlite3').RunResult}
 */
function deleteTransitionPlan(planId) {
  const stmt = db.prepare('DELETE FROM transition_plans WHERE id = ?');
  return stmt.run(planId);
}

// API key helpers

/**
 * Inserts a new API key record. The plaintext key must NOT be passed here —
 * only the prefix (for display) and hash (for lookup) are stored.
 * @param {number} userId
 * @param {string} name - Human-readable label for the key.
 * @param {string} keyPrefix - First 16 chars of the key for display purposes.
 * @param {string} keyHash - SHA-256 hex digest of the full key.
 * @param {string[]} scopes - Array of scope strings (stored as JSON).
 * @param {number} rateLimit - Max requests per minute for this key.
 * @returns {number} The new key's integer ID.
 */
function createApiKeyRecord(userId, name, keyPrefix, keyHash, scopes, rateLimit) {
  const stmt = db.prepare(
    'INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes, rate_limit_per_min) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(userId, name, keyPrefix, keyHash, JSON.stringify(scopes), rateLimit);
  return Number(result.lastInsertRowid);
}

/**
 * Looks up an active (non-revoked) API key by its SHA-256 hash.
 * Used in the authentication hot path — the partial index on (user_id WHERE revoked_at IS NULL)
 * makes this fast even with many revoked keys in the table.
 * @param {string} keyHash - SHA-256 hex digest.
 * @returns {object|undefined}
 */
function findApiKeyByHash(keyHash) {
  return db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL').get(keyHash);
}

/**
 * Returns all API keys for a user (active and revoked), newest first.
 * The key_hash column is intentionally excluded from this projection.
 * @param {number} userId
 * @returns {{ id, name, key_prefix, scopes, rate_limit_per_min, last_used_at, created_at, revoked_at }[]}
 */
function getApiKeysByUser(userId) {
  return db.prepare(
    'SELECT id, name, key_prefix, scopes, rate_limit_per_min, last_used_at, created_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);
}

/**
 * Soft-deletes an API key by setting revoked_at. The key_hash remains in the table so
 * the usage log (which references api_key_id) stays intact for audit purposes.
 * The user_id check prevents one user from revoking another user's key.
 * @param {number} keyId
 * @param {number} userId
 * @returns {import('better-sqlite3').RunResult} — check .changes to detect not-found (0 rows).
 */
function revokeApiKey(keyId, userId) {
  return db.prepare(
    "UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
  ).run(keyId, userId);
}

/**
 * Bumps last_used_at for an API key to the current timestamp.
 * Called synchronously on every authenticated request — the write is cheap (single row, indexed PK).
 * @param {number} keyId
 */
function touchApiKey(keyId) {
  db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(keyId);
}

/**
 * Appends a usage log entry for an API key request. Called after the response is sent
 * (via the 'finish' event) so the actual status code is captured.
 * @param {number} keyId
 * @param {string} endpoint - The full request path.
 * @param {string} method   - HTTP method.
 * @param {number} statusCode
 * @param {string|null} ip  - Client IP address.
 */
function logApiKeyUsage(keyId, endpoint, method, statusCode, ip) {
  db.prepare(
    'INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, ip) VALUES (?, ?, ?, ?, ?)'
  ).run(keyId, endpoint, method, statusCode, ip);
}

/**
 * Retourne les stats agrégées d'une clé sur une fenêtre de N jours.
 * @param {number} keyId
 * @param {number} days - fenêtre en jours (défaut 7)
 * @returns {{total: number, success: number, clientError: number, serverError: number,
 *            lastUsedAt: string|null, topEndpoint: string|null}}
 */
function getApiKeyUsageStats(keyId, days = 7) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status_code BETWEEN 200 AND 399 THEN 1 ELSE 0 END) AS success,
      SUM(CASE WHEN status_code BETWEEN 400 AND 499 THEN 1 ELSE 0 END) AS clientError,
      SUM(CASE WHEN status_code >= 500 THEN 1 ELSE 0 END) AS serverError,
      MAX(created_at) AS lastUsedAt
    FROM api_key_usage
    WHERE api_key_id = ? AND created_at >= datetime('now', ?)
  `).get(keyId, `-${days} days`);

  const top = db.prepare(`
    SELECT endpoint, COUNT(*) AS c
    FROM api_key_usage
    WHERE api_key_id = ? AND created_at >= datetime('now', ?)
    GROUP BY endpoint ORDER BY c DESC LIMIT 1
  `).get(keyId, `-${days} days`);

  return {
    total: row?.total ?? 0,
    success: row?.success ?? 0,
    clientError: row?.clientError ?? 0,
    serverError: row?.serverError ?? 0,
    lastUsedAt: row?.lastUsedAt ?? null,
    topEndpoint: top?.endpoint ?? null,
  };
}

/**
 * Retourne les N derniers appels d'une clé (tri desc par created_at).
 * @param {number} keyId
 * @param {number} limit
 * @returns {Array<{id, endpoint, method, status_code, ip, created_at}>}
 */
function getApiKeyRecentUsage(keyId, limit = 20) {
  return db.prepare(`
    SELECT id, endpoint, method, status_code, ip, created_at
    FROM api_key_usage
    WHERE api_key_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(keyId, limit);
}

/**
 * Retourne le nombre d'appels par jour sur une fenêtre, pour la sparkline.
 * @param {number} keyId
 * @param {number} days
 * @returns {Array<{day: string, count: number}>} - day en YYYY-MM-DD, triée asc
 */
function getApiKeyDailyUsage(keyId, days = 30) {
  return db.prepare(`
    SELECT DATE(created_at) AS day, COUNT(*) AS count
    FROM api_key_usage
    WHERE api_key_id = ? AND created_at >= datetime('now', ?)
    GROUP BY day
    ORDER BY day ASC
  `).all(keyId, `-${days} days`);
}

/**
 * Verifies that an API key belongs to a specific user.
 * Lightweight ownership check — avoids loading all of a user's keys.
 * @param {number} keyId
 * @param {number} userId
 * @returns {boolean}
 */
function userOwnsApiKey(keyId, userId) {
  const row = db.prepare(
    'SELECT 1 FROM api_keys WHERE id = ? AND user_id = ?'
  ).get(keyId, userId);
  return !!row;
}

/**
 * Returns a summary of 7-day usage stats for all active API keys of a user.
 * Used by the inline summary shown in the collapsed key list (avoids N+1 per-key fetches).
 * @param {number} userId
 * @returns {Array<{api_key_id: number, total: number, success: number}>}
 */
function getApiKeyUsageSummaryByUser(userId) {
  return db.prepare(`
    SELECT
      ak.id AS api_key_id,
      COUNT(aku.id) AS total,
      SUM(CASE WHEN aku.status_code BETWEEN 200 AND 399 THEN 1 ELSE 0 END) AS success
    FROM api_keys ak
    LEFT JOIN api_key_usage aku
      ON aku.api_key_id = ak.id
      AND aku.created_at >= datetime('now', '-7 days')
    WHERE ak.user_id = ? AND ak.revoked_at IS NULL
    GROUP BY ak.id
  `).all(userId);
}

/**
 * Finds a project by its externalId field stored inside the data JSON column.
 * Uses SQLite's json_extract() so no separate indexed column is needed.
 * This is intentional: externalId is an external API concept, not a core schema field,
 * and json_extract on a small projects table is fast enough without a generated column.
 * @param {number} userId  - Only searches projects owned by this user.
 * @param {string} externalId
 * @returns {object|undefined}
 */
function findProjectByExternalId(userId, externalId) {
  return db.prepare(`
    SELECT * FROM projects
    WHERE owner_id = ?
      AND json_extract(data, '$.externalId') = ?
    LIMIT 1
  `).get(userId, externalId);
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
  deleteTemplate,
  getResourcesByUser,
  getResourceById,
  createResource,
  updateResource,
  deleteResource,
  getAssignmentsByUser,
  getAssignmentsByResource,
  getAssignmentsByProject,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getTransitionPlansByUser,
  getTransitionPlanById,
  createTransitionPlan,
  updateTransitionPlan,
  deleteTransitionPlan,
  createApiKeyRecord,
  findApiKeyByHash,
  getApiKeysByUser,
  revokeApiKey,
  touchApiKey,
  logApiKeyUsage,
  getApiKeyUsageStats,
  getApiKeyRecentUsage,
  getApiKeyDailyUsage,
  userOwnsApiKey,
  getApiKeyUsageSummaryByUser,
  findProjectByExternalId
};
