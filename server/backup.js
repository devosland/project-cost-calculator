import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { copyFileSync } from 'fs';
import path from 'path';

const dataDir = process.env.DATA_DIR || './data';
const backupDir = path.join(dataDir, 'backups');
const MAX_BACKUPS = parseInt(process.env.BACKUP_MAX_COUNT || '7', 10);
const BACKUP_INTERVAL_HOURS = parseInt(process.env.BACKUP_INTERVAL_HOURS || '24', 10);

function ensureBackupDir() {
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }
}

function createBackup() {
  const dbPath = path.join(dataDir, 'app.db');
  if (!existsSync(dbPath)) {
    console.log('[backup] No database file found, skipping backup');
    return null;
  }

  ensureBackupDir();

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
