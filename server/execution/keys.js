/**
 * Human-readable key generation for Epics / Stories / Tasks.
 *
 * Each (project, entity_type) pair has one row in `project_key_counters`
 * holding `last_key`. A POST creates a new entity by bumping that counter in
 * a transaction and formatting as `<letter><n>` (e.g. E1, S42, T123).
 *
 * The `PRISM-` prefix mentioned in the spec was dropped at implementation
 * time: the letter alone is enough to disambiguate within a project, and
 * per-project prefixes (Jira-style) would require a new field on `projects`
 * that we do not otherwise need. Easy to layer on later if desired.
 */

const LETTER_BY_TYPE = { epic: 'E', story: 'S', task: 'T' };

/**
 * Atomically increment the counter for (projectId, entityType) and return the
 * new key. Called inside a transaction by the route handler that creates the
 * entity, so key generation and row insertion commit together.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} projectId
 * @param {'epic'|'story'|'task'} entityType
 * @returns {string} The new key (e.g. `E42`).
 */
export function nextKey(db, projectId, entityType) {
  const letter = LETTER_BY_TYPE[entityType];
  if (!letter) throw new Error(`Unknown entity_type: ${entityType}`);

  // INSERT OR IGNORE guarantees a row exists. Then UPDATE bumps it.
  // Two statements, but both run inside the caller's transaction.
  db.prepare(
    'INSERT OR IGNORE INTO project_key_counters (project_id, entity_type, last_key) VALUES (?, ?, 0)'
  ).run(projectId, entityType);
  const row = db.prepare(
    'UPDATE project_key_counters SET last_key = last_key + 1 WHERE project_id = ? AND entity_type = ? RETURNING last_key'
  ).get(projectId, entityType);
  return `${letter}${row.last_key}`;
}
