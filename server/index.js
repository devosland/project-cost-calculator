/**
 * Application entry point: wires Express middleware, mounts all routers,
 * configures CORS (permissive for internal routes, origin-whitelisted for /api/v1),
 * serves the built Vite frontend as a SPA, and starts the HTTP server.
 *
 * Route registration order matters — Express matches routes in declaration order:
 *   /api/auth/api-keys must be mounted BEFORE /api/auth so the more-specific
 *   prefix is matched first (otherwise /api/auth would swallow api-key requests).
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './auth.js';
import apiKeysRouter from './apiKeysRoutes.js';
import dataRoutes from './data.js';
import projectRoutes from './projects.js';
import templateRoutes from './templates.js';
import capacityRouter from './capacity.js';
import executionRouter from './execution/index.js';
import publicApiRouter from './publicApi.js';
import { startScheduledBackups, createBackup, listBackups } from './backup.js';
import { authMiddleware } from './middleware.js';

// ESM equivalent of __dirname — not available natively in ES modules.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Global middleware: allow all origins for the internal API (frontend is same-origin
// in production; this permissive CORS only matters during local development).
app.use(cors());
app.use(express.json());

// --- Internal API routes (JWT-protected, permissive CORS) ---
// IMPORTANT: /api/auth/api-keys MUST be registered before /api/auth — Express matches
// the first prefix that fits, so reversing this order would route api-key requests
// to the auth router, which has no /api-keys path and would return 404.
app.use('/api/auth/api-keys', apiKeysRouter);
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/capacity', capacityRouter);
app.use('/api/execution', executionRouter);

// --- Public API v1 (API-key-protected, origin-whitelisted CORS) ---
// Only origins listed in PUBLIC_API_ALLOWED_ORIGINS receive CORS headers.
// Requests from unlisted origins still reach the router — they just won't pass
// browser CORS preflight — so the API remains accessible to server-to-server callers.
const publicApiOrigins = (process.env.PUBLIC_API_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const publicApiCors = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && publicApiOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    // Vary: Origin prevents CDNs from caching the wrong CORS headers across origins.
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

app.use('/api/v1', publicApiCors, publicApiRouter);

// --- Backup endpoints (JWT-protected) ---

/**
 * GET /api/backups
 * Lists available database backup files (names only — paths are not exposed).
 * Returns: 200 [{ name: string }]
 */
app.get('/api/backups', authMiddleware, (req, res) => {
  res.json(listBackups().map((b) => ({ name: b.name })));
});

/**
 * POST /api/backups
 * Triggers an immediate backup of the database.
 * Returns: 200 { success, message } | 500 on failure
 */
app.post('/api/backups', authMiddleware, (req, res) => {
  const result = createBackup();
  if (result) {
    res.json({ success: true, message: 'Backup created' });
  } else {
    res.status(500).json({ error: 'Backup failed' });
  }
});

// Kick off the recurring backup scheduler (runs on a setInterval internally).
startScheduledBackups();

// --- Static file serving & SPA fallback ---
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Catch-all for client-side routes: any request that didn't match an API route
// or a static file gets index.html so the React router can handle it.
// Express 5 requires named wildcards — `/{*splat}` matches both `/` and any
// deeper path (the braces make the wildcard optional).
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
