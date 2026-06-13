import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

/**
 * Per-worker SQLite isolation.
 *
 * Every server test imports the same db.js singleton, which opens
 * `${DATA_DIR}/app.db` at import time. Without isolation, all vitest workers
 * share one database file, so files running in parallel write to it
 * simultaneously — the cause of intermittent failures (SQLite contention,
 * cross-file pollution, and async usage-logging FK violations) that only
 * surface under load and never when a file runs alone.
 *
 * Giving each worker its own DATA_DIR removes all concurrent access to a shared
 * file. setupFiles run before the test module's imports, so this assignment
 * lands before db.js reads DATA_DIR. Frontend (jsdom) tests don't touch the DB,
 * so the extra env var is harmless for them.
 */
const workerId = process.env.VITEST_WORKER_ID || '1';
const dir = path.join(os.tmpdir(), `pcc-vitest-${process.pid}-${workerId}`);
fs.mkdirSync(dir, { recursive: true });
process.env.DATA_DIR = dir;
