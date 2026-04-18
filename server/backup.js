/**
 * Scheduled SQLite backup module.
 * Copies app.db to a timestamped file under data/backups/ at a configurable interval
 * (default 24 h) and retains only the N most recent backups (default 7).
 * Backup operations are best-effort: failures are logged but never crash the server.
 */
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { copyFileSync } from 'fs';
import path from 'path';

const dataDir = process.env.DATA_DIR || './data';
const backupDir = path.join(dataDir, 'backups');
const MAX_BACKUPS = parseInt(process.env.BACKUP_MAX_COUNT || '7', 10);
const BACKUP_INTERVAL_HOURS = parseInt(process.env.BACKUP_INTERVAL_HOURS || '24', 10);

/** Ensures the backup directory exists, creating it recursively if needed. */
function ensureBackupDir() {
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
}

/**
 * Creates a timestamped copy of app.db in the backups directory, then prunes
 * old backups so only MAX_BACKUPS are retained.
 * @returns {string|null} Absolute path to the new backup file, or null on failure.
 */
function createBackup() {
  const dbPath = path.join(dataDir, 'app.db');
  if (!existsSync(dbPath)) {
    console.log('[backup] No database file found, skipping backup');
    return null;
  }

  ensureBackupDir();

  // ISO timestamp with colons/dots replaced so the filename is valid on all OSes.
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `app-${timestamp}.db`;
  const backupPath = path.join(backupDir, backupName);

  try {
    copyFileSync(dbPath, backupPath);
    console.log(`[backup] Created backup: ${backupName}`);
    pruneOldBackups();
    return backupPath;
  } catch (err) {
    console.error('[backup] Failed to create backup:', err.message);
    return null;
  }
}

/**
 * Deletes the oldest backup files when the count exceeds MAX_BACKUPS.
 * Files are sorted lexicographically descending (ISO timestamps sort correctly),
 * so the tail of the reversed array are always the oldest.
 */
function pruneOldBackups() {
  try {
    const files = readdirSync(backupDir)
      .filter((f) => f.startsWith('app-') && f.endsWith('.db'))
      .sort()
      .reverse();

    if (files.length > MAX_BACKUPS) {
      for (const old of files.slice(MAX_BACKUPS)) {
        unlinkSync(path.join(backupDir, old));
        console.log(`[backup] Pruned old backup: ${old}`);
      }
    }
  } catch (err) {
    console.error('[backup] Failed to prune backups:', err.message);
  }
}

/**
 * Lists all backup files ordered newest-first.
 * @returns {{ name: string, path: string }[]}
 */
function listBackups() {
  ensureBackupDir();
  try {
    return readdirSync(backupDir)
      .filter((f) => f.startsWith('app-') && f.endsWith('.db'))
      .sort()
      .reverse()
      .map((name) => ({ name, path: path.join(backupDir, name) }));
  } catch {
    return [];
  }
}

/**
 * Registers the recurring backup schedule and runs an initial backup shortly
 * after startup (5 s delay gives the database time to finish initialising).
 * Should be called once when the server starts.
 */
function startScheduledBackups() {
  // Run initial backup on startup (after a short delay to let DB init)
  setTimeout(() => {
    console.log(`[backup] Starting scheduled backups every ${BACKUP_INTERVAL_HOURS}h (keeping last ${MAX_BACKUPS})`);
    createBackup();
  }, 5000);

  // Schedule recurring backups
  setInterval(() => {
    createBackup();
  }, BACKUP_INTERVAL_HOURS * 60 * 60 * 1000);
}

export { createBackup, listBackups, startScheduledBackups };
