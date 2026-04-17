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
import publicApiRouter from './publicApi.js';
import { startScheduledBackups, createBackup, listBackups } from './backup.js';
import { authMiddleware } from './middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth/api-keys', apiKeysRouter);
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/capacity', capacityRouter);

// Public API v1 with CORS whitelist
const publicApiOrigins = (process.env.PUBLIC_API_ALLOWED_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const publicApiCors = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && publicApiOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

app.use('/api/v1', publicApiCors, publicApiRouter);

// Backup endpoints (authMiddlewared)
app.get('/api/backups', authMiddleware, (req, res) => {
  res.json(listBackups().map((b) => ({ name: b.name })));
});

app.post('/api/backups', authMiddleware, (req, res) => {
  const result = createBackup();
  if (result) {
    res.json({ success: true, message: 'Backup created' });
  } else {
    res.status(500).json({ error: 'Backup failed' });
  }
});

// Start scheduled backups
startScheduledBackups();

// Serve static files from the built frontend
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// SPA fallback - serve index.html for any non-API, non-static-file request
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
