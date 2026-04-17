# Public API — Roadmap Import (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exposer une API publique sécurisée (`/api/v1/roadmap/import`) permettant à un outil tiers de créer un projet avec phases + timing + dépendances, authentifiée par clé d'API scopée.

**Architecture:** Clés d'API scopées (distinctes du JWT utilisateur), middleware dédié, rate limiting par clé, validation Zod à la frontière, mapping roadmap → modèle interne projet. Surface publique minimale (2 endpoints), infrastructure de sécurité complète (scopes, audit, CORS whitelist) pour supporter les intégrations futures sans refactor.

**Tech Stack:** Express 4, better-sqlite3, crypto (Node built-in), zod 3.x, express-rate-limit (déjà installé), Vitest + supertest, React/Tailwind pour l'UI de gestion des clés.

**Contrat cible:** Voir `docs/integration-api-roadmap.md` (documentation externe partagée avec l'intégrateur).

---

## File Structure

### Backend

| Fichier | Responsabilité |
|---|---|
| `server/db.js` (modifier) | Ajouter tables `api_keys`, `api_key_usage`. Helpers CRUD. Helper `findProjectByExternalId`. |
| `server/apiKeys.js` (créer) | Génération / hachage SHA-256 / vérification des clés. |
| `server/apiKeyAuth.js` (créer) | Middleware `apiKeyAuth({ requiredScope })` — parse header, valide hash, vérifie scope, log usage. |
| `server/publicApi.js` (créer) | Router `/api/v1/*`. Monte `roadmap/import` + `roadmap/import/:externalId/status`. Rate limit par clé. |
| `server/schemas/roadmapImport.js` (créer) | Schéma Zod + validation graphe (cycles, dangling refs, root). |
| `server/mapping/roadmapToProject.js` (créer) | Pure function mapping payload roadmap → structure `project.data`. |
| `server/apiKeysRoutes.js` (créer) | Router CRUD `/api/auth/api-keys/*` (JWT-protégé) pour gérer ses clés. |
| `server/index.js` (modifier) | Monter `apiKeysRouter` et `publicApiRouter`. CORS whitelist pour v1. |
| `server/__tests__/apiKeys.test.js` | Tests génération/vérification de clé. |
| `server/__tests__/apiKeyAuth.test.js` | Tests middleware. |
| `server/__tests__/roadmapImport.schema.test.js` | Tests validation payload + graphe. |
| `server/__tests__/roadmapToProject.test.js` | Tests mapping. |
| `server/__tests__/publicApi.roadmap.test.js` | Tests endpoint complet (intégration HTTP). |
| `server/__tests__/apiKeysRoutes.test.js` | Tests CRUD clés. |

### Frontend

| Fichier | Responsabilité |
|---|---|
| `src/lib/apiKeysApi.js` (créer) | Client HTTP. |
| `src/components/ApiKeysView.jsx` (créer) | Liste + création + révocation. |
| `src/components/ProfileView.jsx` (modifier) | Ajouter section "Clés d'API". |
| `src/lib/i18n.jsx` (modifier) | Clés `apiKeys.*` (FR + EN). |

### Docs

| Fichier | Responsabilité |
|---|---|
| `docs/integration-api-roadmap.md` | **Déjà créé** — contrat externe. |
| `README.md` (modifier) | Section "Public API" référençant le guide. |

---

## Tasks

### Task 1 : Migration DB — tables `api_keys` et `api_key_usage`

**Files:**
- Modify: `server/db.js`

- [ ] **Step 1 : Ajouter les tables**

Dans `server/db.js`, suivre le pattern existant (les blocs DDL sont passés au moteur better-sqlite3 via la même méthode que pour `resources`, `resource_assignments`, etc. — voir lignes 94-133). Insérer après le bloc `transition_plans` (ligne ~133) et avant les indexes :

```sql
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
);

CREATE TABLE IF NOT EXISTS api_key_usage (
  id INTEGER PRIMARY KEY,
  api_key_id INTEGER NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  ip TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_key_usage_key ON api_key_usage(api_key_id, created_at);
```

Chaque statement doit être appliqué individuellement en suivant le pattern existant du fichier (les lignes 94, 108, 123, 136-139 montrent exactement comment).

- [ ] **Step 2 : Ajouter les helpers DB**

Avant le bloc `export {` en fin de fichier, ajouter les helpers suivants en utilisant `db.prepare(...).run()` / `.get()` / `.all()` (pattern existant dans le fichier — voir `createProjectRecord` ligne 259) :

```js
function createApiKeyRecord(userId, name, keyPrefix, keyHash, scopes, rateLimit) {
  const stmt = db.prepare(
    'INSERT INTO api_keys (user_id, name, key_prefix, key_hash, scopes, rate_limit_per_min) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(userId, name, keyPrefix, keyHash, JSON.stringify(scopes), rateLimit);
  return Number(result.lastInsertRowid);
}

function findApiKeyByHash(keyHash) {
  return db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL').get(keyHash);
}

function getApiKeysByUser(userId) {
  return db.prepare(
    'SELECT id, name, key_prefix, scopes, rate_limit_per_min, last_used_at, created_at, revoked_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC'
  ).all(userId);
}

function revokeApiKey(keyId, userId) {
  return db.prepare(
    "UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND revoked_at IS NULL"
  ).run(keyId, userId);
}

function touchApiKey(keyId) {
  db.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(keyId);
}

function logApiKeyUsage(keyId, endpoint, method, statusCode, ip) {
  db.prepare(
    'INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, ip) VALUES (?, ?, ?, ?, ?)'
  ).run(keyId, endpoint, method, statusCode, ip);
}

function findProjectByExternalId(userId, externalId) {
  return db.prepare(`
    SELECT * FROM projects
    WHERE owner_id = ?
      AND json_extract(data, '$.externalId') = ?
    LIMIT 1
  `).get(userId, externalId);
}
```

Ajouter à la liste des exports :
```js
createApiKeyRecord,
findApiKeyByHash,
getApiKeysByUser,
revokeApiKey,
touchApiKey,
logApiKeyUsage,
findProjectByExternalId,
```

- [ ] **Step 3 : Vérifier la création des tables**

Run (depuis la racine du projet) :
```bash
node -e "import('./server/db.js').then(m => console.log(m.db.prepare('SELECT name FROM sqlite_master WHERE type=\"table\"').all()))"
```

Expected : la liste inclut `api_keys` et `api_key_usage`.

- [ ] **Step 4 : Commit**

```bash
git add server/db.js
git commit -m "feat(api): add api_keys and api_key_usage tables with CRUD helpers"
```

---

### Task 2 : Installer Zod

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1** : `npm install zod@^3.23.0`
- [ ] **Step 2** : Vérifier `node -e "console.log(require('zod').z.string().parse('hello'))"` → `hello`
- [ ] **Step 3** : Commit — `chore: add zod for API schema validation`

---

### Task 3 : Utilitaires clé d'API (TDD)

**Files:**
- Create: `server/apiKeys.js`
- Create: `server/__tests__/apiKeys.test.js`

- [ ] **Step 1 : Tests**

Créer `server/__tests__/apiKeys.test.js` :

```js
import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey, verifyApiKey } from '../apiKeys.js';

describe('api key generation', () => {
  it('generates a key with prefix ckc_live_', () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^ckc_live_[a-zA-Z0-9_-]{32}$/);
    expect(prefix).toBe(key.slice(0, 16));
    expect(hash).not.toBe(key);
  });

  it('generates distinct keys each call', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).not.toBe(b.key);
    expect(a.hash).not.toBe(b.hash);
  });

  it('hashApiKey produces a deterministic SHA-256 hash', () => {
    const h1 = hashApiKey('ckc_live_test123');
    const h2 = hashApiKey('ckc_live_test123');
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('verifyApiKey matches generated key against stored hash', () => {
    const { key, hash } = generateApiKey();
    expect(verifyApiKey(key, hash)).toBe(true);
    expect(verifyApiKey('ckc_live_wrong', hash)).toBe(false);
  });
});
```

- [ ] **Step 2 : Run to verify failure** — `cd server && npx vitest run __tests__/apiKeys.test.js` → FAIL

- [ ] **Step 3 : Implémentation**

Créer `server/apiKeys.js` :

```js
import crypto from 'crypto';

const KEY_PREFIX = 'ckc_live_';
const KEY_BODY_LENGTH = 32;

export function generateApiKey() {
  const body = crypto.randomBytes(24).toString('base64url').slice(0, KEY_BODY_LENGTH);
  const key = `${KEY_PREFIX}${body}`;
  const prefix = key.slice(0, 16);
  const hash = hashApiKey(key);
  return { key, prefix, hash };
}

export function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export function verifyApiKey(key, storedHash) {
  const computed = hashApiKey(key);
  if (computed.length !== storedHash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(storedHash));
}
```

**Design note** : SHA-256 (pas bcrypt) pour permettre la lookup directe `WHERE key_hash = ?`. La clé a 192 bits d'entropie, ce qui rend les attaques brute-force inutiles — pattern standard (Stripe, GitHub). Bcrypt est pour les mots de passe faibles, pas pour les clés cryptographiques aléatoires.

- [ ] **Step 4 : Run tests** → 4 PASS
- [ ] **Step 5 : Commit** — `feat(api): add API key generation and verification`

---

### Task 4 : Middleware apiKeyAuth (TDD)

**Files:**
- Create: `server/apiKeyAuth.js`
- Create: `server/__tests__/apiKeyAuth.test.js`

- [ ] **Step 1 : Tests**

Créer `server/__tests__/apiKeyAuth.test.js` :

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiKeyAuth } from '../apiKeyAuth.js';
import { db, createApiKeyRecord } from '../db.js';
import { generateApiKey } from '../apiKeys.js';

function mockReqRes(headers = {}) {
  const req = { headers, ip: '1.2.3.4', originalUrl: '/api/v1/test', method: 'POST' };
  const res = {
    statusCode: 200,
    status: vi.fn(function (c) { this.statusCode = c; return this; }),
    json: vi.fn().mockReturnThis(),
    on: vi.fn(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('apiKeyAuth middleware', () => {
  let userId, validKey, keyId;

  beforeEach(() => {
    db.prepare('DELETE FROM api_keys').run();
    db.prepare('DELETE FROM users WHERE email = ?').run('apiauth@test.com');
    const u = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
      .run('apiauth@test.com', 'T', 'x');
    userId = Number(u.lastInsertRowid);
    const { key, prefix, hash } = generateApiKey();
    keyId = createApiKeyRecord(userId, 'test', prefix, hash, ['roadmap:import'], 60);
    validKey = key;
  });

  it('401 when header missing', () => {
    const { req, res, next } = mockReqRes();
    apiKeyAuth({ requiredScope: 'roadmap:import' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401 when key unknown', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': 'ckc_live_notfound' });
    apiKeyAuth({ requiredScope: 'roadmap:import' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('403 when scope insufficient', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': validKey });
    apiKeyAuth({ requiredScope: 'roadmap:admin' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('401 when key revoked', () => {
    db.prepare('UPDATE api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?').run(keyId);
    const { req, res, next } = mockReqRes({ 'x-api-key': validKey });
    apiKeyAuth({ requiredScope: 'roadmap:import' })(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('attaches req.apiKey + req.user and calls next on success', () => {
    const { req, res, next } = mockReqRes({ 'x-api-key': validKey });
    apiKeyAuth({ requiredScope: 'roadmap:import' })(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.apiKey.id).toBe(keyId);
    expect(req.user.id).toBe(userId);
  });
});
```

- [ ] **Step 2 : Run to verify failure** → FAIL

- [ ] **Step 3 : Implémentation**

Créer `server/apiKeyAuth.js` :

```js
import { hashApiKey } from './apiKeys.js';
import { findApiKeyByHash, findUserById, touchApiKey, logApiKeyUsage } from './db.js';

export function apiKeyAuth({ requiredScope }) {
  return (req, res, next) => {
    const rawKey = req.headers['x-api-key'];
    if (!rawKey || typeof rawKey !== 'string' || !rawKey.startsWith('ckc_live_')) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }

    const hash = hashApiKey(rawKey);
    const record = findApiKeyByHash(hash);
    if (!record) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }

    let scopes = [];
    try { scopes = JSON.parse(record.scopes); } catch {}
    if (requiredScope && !scopes.includes(requiredScope)) {
      return res.status(403).json({ error: 'insufficient_scope', required: requiredScope });
    }

    const user = findUserById(record.user_id);
    if (!user) {
      return res.status(401).json({ error: 'invalid_api_key' });
    }

    req.apiKey = { id: record.id, scopes, rateLimit: record.rate_limit_per_min };
    req.user = { id: user.id, email: user.email, name: user.name };

    touchApiKey(record.id);

    res.on('finish', () => {
      try {
        logApiKeyUsage(record.id, req.originalUrl, req.method, res.statusCode, req.ip || null);
      } catch (e) {
        console.error('usage log failed:', e);
      }
    });

    next();
  };
}
```

- [ ] **Step 4 : Run tests** → 5 PASS
- [ ] **Step 5 : Commit** — `feat(api): add apiKeyAuth middleware with scope enforcement`

---

### Task 5 : Schéma Zod + validation graphe (TDD)

**Files:**
- Create: `server/schemas/roadmapImport.js`
- Create: `server/__tests__/roadmapImport.schema.test.js`

- [ ] **Step 1 : Tests**

```js
import { describe, it, expect } from 'vitest';
import { validateRoadmapImport } from '../schemas/roadmapImport.js';

const valid = {
  project: { name: 'Test', externalId: 'RM-1', startDate: '2026-06-01' },
  phases: [
    { id: 'a', name: 'A', order: 1, durationMonths: 2 },
    { id: 'b', name: 'B', order: 2, durationMonths: 3, dependsOn: ['a'] },
  ],
};

describe('roadmap import schema', () => {
  it('accepts minimal valid payload', () => {
    expect(validateRoadmapImport(valid).ok).toBe(true);
  });

  it('rejects missing project.name', () => {
    const r = validateRoadmapImport({ ...valid, project: { externalId: 'x', startDate: '2026-06-01' } });
    expect(r.ok).toBe(false);
  });

  it('rejects invalid startDate format', () => {
    const r = validateRoadmapImport({ ...valid, project: { ...valid.project, startDate: '06/01/2026' } });
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate phase ids', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [
        { id: 'a', name: 'A', order: 1, durationMonths: 1 },
        { id: 'a', name: 'B', order: 2, durationMonths: 1 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.message.includes('duplicate'))).toBe(true);
  });

  it('rejects dangling dependency', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1, dependsOn: ['ghost'] }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects cycles', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [
        { id: 'a', name: 'A', order: 1, durationMonths: 1, dependsOn: ['b'] },
        { id: 'b', name: 'B', order: 2, durationMonths: 1, dependsOn: ['a'] },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.message.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('rejects endDate before startDate', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1, startDate: '2026-06-10', endDate: '2026-06-01' }],
    });
    expect(r.ok).toBe(false);
  });

  it('accepts explicit dates', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1, startDate: '2026-06-01', endDate: '2026-07-01' }],
    });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2 : Run to verify failure** → FAIL

- [ ] **Step 3 : Implémentation**

Créer `server/schemas/roadmapImport.js` :

```js
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid ISO 8601 date (YYYY-MM-DD expected)');

const phaseSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-_]*$/i, 'id must be slug-like'),
  name: z.string().min(1).max(100),
  order: z.number().int().positive(),
  durationMonths: z.number().positive(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  dependsOn: z.array(z.string()).optional(),
  description: z.string().max(1000).optional(),
}).refine(
  p => !(p.startDate && p.endDate) || p.endDate > p.startDate,
  { message: 'endDate must be after startDate', path: ['endDate'] }
);

const payloadSchema = z.object({
  project: z.object({
    name: z.string().min(1).max(200),
    externalId: z.string().min(1).max(100),
    startDate: isoDate,
    description: z.string().max(2000).optional(),
  }),
  phases: z.array(phaseSchema).min(1),
});

function detectCycles(phases) {
  const adj = new Map(phases.map(p => [p.id, p.dependsOn || []]));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(phases.map(p => [p.id, WHITE]));

  function dfs(node) {
    color.set(node, GRAY);
    for (const next of adj.get(node) || []) {
      const c = color.get(next);
      if (c === GRAY) return true;
      if (c === WHITE && dfs(next)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const p of phases) {
    if (color.get(p.id) === WHITE && dfs(p.id)) return true;
  }
  return false;
}

export function validateRoadmapImport(input) {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    };
  }

  const { phases } = parsed.data;
  const issues = [];
  const ids = new Set();

  for (let i = 0; i < phases.length; i++) {
    if (ids.has(phases[i].id)) {
      issues.push({ path: `phases.${i}.id`, message: `duplicate id "${phases[i].id}"` });
    }
    ids.add(phases[i].id);
  }

  for (let i = 0; i < phases.length; i++) {
    for (let j = 0; j < (phases[i].dependsOn || []).length; j++) {
      const ref = phases[i].dependsOn[j];
      if (!ids.has(ref)) {
        issues.push({ path: `phases.${i}.dependsOn.${j}`, message: `References unknown phase id "${ref}"` });
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  if (detectCycles(phases)) {
    return { ok: false, issues: [{ path: 'phases', message: 'Dependency cycle detected' }] };
  }

  const hasRoot = phases.some(p => !p.dependsOn || p.dependsOn.length === 0);
  if (!hasRoot) {
    return { ok: false, issues: [{ path: 'phases', message: 'At least one phase without dependsOn is required' }] };
  }

  return { ok: true, data: parsed.data };
}
```

- [ ] **Step 4 : Run tests** → 8 PASS
- [ ] **Step 5 : Commit** — `feat(api): add zod schema + graph validation for roadmap import`

---

### Task 6 : Mapping roadmap → project (TDD)

**Files:**
- Create: `server/mapping/roadmapToProject.js`
- Create: `server/__tests__/roadmapToProject.test.js`

- [ ] **Step 1 : Tests**

```js
import { describe, it, expect } from 'vitest';
import { mapRoadmapToProject } from '../mapping/roadmapToProject.js';

describe('mapRoadmapToProject', () => {
  it('converts durationMonths to durationWeeks (4.33 factor)', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 3 }],
    });
    expect(r.phases[0].durationWeeks).toBe(13);
  });

  it('preserves externalId and startDate', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-42', startDate: '2026-06-01', description: 'hi' },
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1 }],
    });
    expect(r.externalId).toBe('RM-42');
    expect(r.settings.startDate).toBe('2026-06-01');
    expect(r.description).toBe('hi');
  });

  it('stores dependsOn on each phase', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [
        { id: 'a', name: 'A', order: 1, durationMonths: 1 },
        { id: 'b', name: 'B', order: 2, durationMonths: 1, dependsOn: ['a'] },
      ],
    });
    expect(r.phases[0].dependsOn).toEqual([]);
    expect(r.phases[1].dependsOn).toEqual(['a']);
  });

  it('uses explicit dates to compute durationWeeks when both provided', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [{
        id: 'a', name: 'A', order: 1, durationMonths: 1,
        startDate: '2026-06-01', endDate: '2026-09-01',
      }],
    });
    expect(r.phases[0].durationWeeks).toBe(13);
  });

  it('sorts phases by order', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [
        { id: 'b', name: 'B', order: 2, durationMonths: 1 },
        { id: 'a', name: 'A', order: 1, durationMonths: 1 },
      ],
    });
    expect(r.phases.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('initializes empty teamMembers per phase', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1 }],
    });
    expect(r.phases[0].teamMembers).toEqual([]);
  });
});
```

- [ ] **Step 2 : Run to verify failure** → FAIL

- [ ] **Step 3 : Implémentation**

Créer `server/mapping/roadmapToProject.js` :

```js
const WEEKS_PER_MONTH = 4.33;

function monthsToWeeks(months) {
  return Math.round(months * WEEKS_PER_MONTH);
}

function datesToWeeks(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round(diffDays / 7);
}

export function mapRoadmapToProject(payload) {
  const { project, phases } = payload;
  const sorted = [...phases].sort((a, b) => a.order - b.order);

  const mapped = sorted.map(p => ({
    id: p.id,
    name: p.name,
    order: p.order,
    durationWeeks: (p.startDate && p.endDate)
      ? datesToWeeks(p.startDate, p.endDate)
      : monthsToWeeks(p.durationMonths),
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    dependsOn: p.dependsOn ?? [],
    description: p.description ?? null,
    teamMembers: [],
  }));

  return {
    externalId: project.externalId,
    description: project.description ?? null,
    settings: { startDate: project.startDate },
    phases: mapped,
    budget: null,
  };
}
```

- [ ] **Step 4 : Run tests** → 6 PASS
- [ ] **Step 5 : Commit** — `feat(api): add roadmap payload to project mapping`

---

### Task 7 : Endpoint POST /api/v1/roadmap/import + GET status (TDD)

**Files:**
- Create: `server/publicApi.js`
- Create: `server/__tests__/publicApi.roadmap.test.js`
- Modify: `server/index.js`

- [ ] **Step 1 : Installer supertest**

`npm install -D supertest` (si pas déjà installé).

- [ ] **Step 2 : Tests**

Créer `server/__tests__/publicApi.roadmap.test.js` :

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import publicApiRouter from '../publicApi.js';
import { db, createApiKeyRecord } from '../db.js';
import { generateApiKey } from '../apiKeys.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', publicApiRouter);
  return app;
}

function seedUserAndKey(scopes = ['roadmap:import']) {
  db.prepare('DELETE FROM users WHERE email = ?').run('pubapi@test.com');
  const u = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
    .run('pubapi@test.com', 'T', 'x');
  const userId = Number(u.lastInsertRowid);
  const { key, prefix, hash } = generateApiKey();
  createApiKeyRecord(userId, 'test', prefix, hash, scopes, 60);
  return { userId, key };
}

const validBody = {
  project: { name: 'Test Project', externalId: 'RM-TEST-1', startDate: '2026-06-01' },
  phases: [
    { id: 'a', name: 'Découverte', order: 1, durationMonths: 2 },
    { id: 'b', name: 'Conception', order: 2, durationMonths: 3, dependsOn: ['a'] },
  ],
};

describe('POST /api/v1/roadmap/import', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
    db.prepare('DELETE FROM api_keys').run();
    db.prepare("DELETE FROM projects WHERE json_extract(data, '$.externalId') LIKE 'RM-TEST-%'").run();
  });

  it('401 without api key', async () => {
    const r = await request(app).post('/api/v1/roadmap/import').send(validBody);
    expect(r.status).toBe(401);
  });

  it('403 with wrong scope', async () => {
    const { key } = seedUserAndKey(['roadmap:read']);
    const r = await request(app).post('/api/v1/roadmap/import').set('X-API-Key', key).send(validBody);
    expect(r.status).toBe(403);
  });

  it('422 with invalid payload', async () => {
    const { key } = seedUserAndKey();
    const r = await request(app).post('/api/v1/roadmap/import').set('X-API-Key', key).send({ project: {}, phases: [] });
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('validation_error');
  });

  it('201 creates project on valid payload', async () => {
    const { userId, key } = seedUserAndKey();
    const r = await request(app).post('/api/v1/roadmap/import').set('X-API-Key', key).send(validBody);
    expect(r.status).toBe(201);
    expect(r.body.id).toBeDefined();
    expect(r.body.externalId).toBe('RM-TEST-1');
    expect(r.body.phasesCreated).toBe(2);

    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(r.body.id);
    expect(row.owner_id).toBe(userId);
  });

  it('409 on duplicate externalId without upsert', async () => {
    const { key } = seedUserAndKey();
    await request(app).post('/api/v1/roadmap/import').set('X-API-Key', key).send(validBody);
    const r = await request(app).post('/api/v1/roadmap/import').set('X-API-Key', key).send(validBody);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('duplicate_external_id');
    expect(r.body.existing.id).toBeDefined();
  });

  it('200 updates on upsert=true', async () => {
    const { key } = seedUserAndKey();
    await request(app).post('/api/v1/roadmap/import').set('X-API-Key', key).send(validBody);
    const updated = { ...validBody, project: { ...validBody.project, name: 'Renamed' } };
    const r = await request(app).post('/api/v1/roadmap/import?upsert=true').set('X-API-Key', key).send(updated);
    expect(r.status).toBe(200);
    expect(r.body.name).toBe('Renamed');
  });
});

describe('GET /api/v1/roadmap/import/:externalId/status', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
    db.prepare('DELETE FROM api_keys').run();
    db.prepare("DELETE FROM projects WHERE json_extract(data, '$.externalId') LIKE 'RM-TEST-%'").run();
  });

  it('200 exists=false when no project', async () => {
    const { key } = seedUserAndKey();
    const r = await request(app).get('/api/v1/roadmap/import/RM-TEST-NONE/status').set('X-API-Key', key);
    expect(r.status).toBe(200);
    expect(r.body.exists).toBe(false);
  });

  it('200 exists=true after creation', async () => {
    const { key } = seedUserAndKey();
    const body = { project: { name: 'x', externalId: 'RM-TEST-STATUS', startDate: '2026-06-01' }, phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1 }] };
    await request(app).post('/api/v1/roadmap/import').set('X-API-Key', key).send(body);
    const r = await request(app).get('/api/v1/roadmap/import/RM-TEST-STATUS/status').set('X-API-Key', key);
    expect(r.body.exists).toBe(true);
    expect(r.body.project.externalId).toBe('RM-TEST-STATUS');
  });
});
```

- [ ] **Step 3 : Run to verify failure** → FAIL

- [ ] **Step 4 : Implémentation du router**

Créer `server/publicApi.js` :

```js
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import { apiKeyAuth } from './apiKeyAuth.js';
import { validateRoadmapImport } from './schemas/roadmapImport.js';
import { mapRoadmapToProject } from './mapping/roadmapToProject.js';
import {
  createProjectRecord, updateProjectRecord, findProjectByExternalId, createSnapshot,
} from './db.js';

const router = Router();

const perKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => req.apiKey?.rateLimit ?? 60,
  keyGenerator: (req) => req.apiKey?.id?.toString() ?? req.ip,
  handler: (req, res) => res.status(429).json({ error: 'rate_limit_exceeded', retryAfter: 60 }),
});

function baseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function projectUrl(req, id) {
  return `${baseUrl(req)}/#/projects/${id}/phases`;
}

function newProjectId() {
  return 'rm_' + randomBytes(12).toString('hex');
}

router.post(
  '/roadmap/import',
  apiKeyAuth({ requiredScope: 'roadmap:import' }),
  perKeyLimiter,
  (req, res) => {
    const validation = validateRoadmapImport(req.body);
    if (!validation.ok) {
      return res.status(422).json({ error: 'validation_error', issues: validation.issues });
    }

    const payload = validation.data;
    const projectData = mapRoadmapToProject(payload);
    const upsert = req.query.upsert === 'true';
    const existing = findProjectByExternalId(req.user.id, payload.project.externalId);

    if (existing && !upsert) {
      return res.status(409).json({
        error: 'duplicate_external_id',
        message: `A project with externalId '${payload.project.externalId}' already exists for this account.`,
        existing: { id: existing.id, url: projectUrl(req, existing.id) },
      });
    }

    try {
      if (existing && upsert) {
        let existingData = {};
        try { existingData = JSON.parse(existing.data); } catch {}
        const existingPhases = new Map((existingData.phases || []).map(p => [p.id, p]));
        projectData.phases = projectData.phases.map(p => ({
          ...p,
          teamMembers: existingPhases.get(p.id)?.teamMembers ?? [],
        }));
        projectData.id = existing.id;

        const dataStr = JSON.stringify(projectData);
        updateProjectRecord(existing.id, payload.project.name, dataStr);
        createSnapshot(existing.id, req.user.id, dataStr, 'roadmap-upsert');

        return res.status(200).json({
          id: existing.id,
          name: payload.project.name,
          externalId: payload.project.externalId,
          url: projectUrl(req, existing.id),
          phasesCreated: projectData.phases.length,
          updatedAt: new Date().toISOString(),
        });
      }

      const id = newProjectId();
      projectData.id = id;
      const dataStr = JSON.stringify(projectData);
      createProjectRecord(id, req.user.id, payload.project.name, dataStr);
      createSnapshot(id, req.user.id, dataStr, 'roadmap-import');

      return res.status(201).json({
        id,
        name: payload.project.name,
        externalId: payload.project.externalId,
        url: projectUrl(req, id),
        phasesCreated: projectData.phases.length,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('roadmap import error:', err);
      return res.status(500).json({ error: 'internal_error' });
    }
  }
);

router.get(
  '/roadmap/import/:externalId/status',
  apiKeyAuth({ requiredScope: 'roadmap:import' }),
  perKeyLimiter,
  (req, res) => {
    const existing = findProjectByExternalId(req.user.id, req.params.externalId);
    if (!existing) return res.json({ exists: false });
    res.json({
      exists: true,
      project: {
        id: existing.id,
        name: existing.name,
        externalId: req.params.externalId,
        url: projectUrl(req, existing.id),
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      },
    });
  }
);

export default router;
```

- [ ] **Step 5 : Monter dans server/index.js**

Ajouter l'import (ligne ~9) : `import publicApiRouter from './publicApi.js';`
Ajouter la route après la ligne `app.use('/api/capacity', capacityRouter);` : `app.use('/api/v1', publicApiRouter);`

- [ ] **Step 6 : Run tests** → 8 PASS
- [ ] **Step 7 : Commit** — `feat(api): add public v1 roadmap import endpoint with upsert support`

---

### Task 8 : Routes CRUD clés d'API (TDD)

**Files:**
- Create: `server/apiKeysRoutes.js`
- Create: `server/__tests__/apiKeysRoutes.test.js`
- Modify: `server/index.js`

- [ ] **Step 1 : Tests**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import apiKeysRouter from '../apiKeysRoutes.js';
import { db } from '../db.js';
import { JWT_SECRET } from '../middleware.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth/api-keys', apiKeysRouter);
  return app;
}

function seedUser() {
  db.prepare('DELETE FROM users WHERE email = ?').run('keys@test.com');
  const r = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run('keys@test.com', 'K', 'x');
  const id = Number(r.lastInsertRowid);
  const token = jwt.sign({ id, email: 'keys@test.com', name: 'K' }, JWT_SECRET);
  return { id, token };
}

describe('api keys CRUD', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
    db.prepare('DELETE FROM api_keys').run();
  });

  it('401 without JWT', async () => {
    const r = await request(app).get('/api/auth/api-keys');
    expect(r.status).toBe(401);
  });

  it('creates key and returns plaintext once', async () => {
    const { token } = seedUser();
    const r = await request(app)
      .post('/api/auth/api-keys').set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Roadmap Tool', scopes: ['roadmap:import'] });
    expect(r.status).toBe(201);
    expect(r.body.key).toMatch(/^ckc_live_/);
    expect(r.body.id).toBeDefined();
  });

  it('lists keys without plaintext', async () => {
    const { token } = seedUser();
    await request(app).post('/api/auth/api-keys').set('Authorization', `Bearer ${token}`).send({ name: 'A', scopes: ['roadmap:import'] });
    const r = await request(app).get('/api/auth/api-keys').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body[0].prefix || r.body[0].key_prefix).toMatch(/^ckc_live_/);
    expect(r.body[0].key).toBeUndefined();
  });

  it('revokes a key', async () => {
    const { token } = seedUser();
    const created = await request(app).post('/api/auth/api-keys').set('Authorization', `Bearer ${token}`).send({ name: 'A', scopes: ['roadmap:import'] });
    const r = await request(app).delete(`/api/auth/api-keys/${created.body.id}`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    const list = await request(app).get('/api/auth/api-keys').set('Authorization', `Bearer ${token}`);
    expect(list.body[0].revoked_at).not.toBeNull();
  });

  it('rejects invalid scopes', async () => {
    const { token } = seedUser();
    const r = await request(app).post('/api/auth/api-keys').set('Authorization', `Bearer ${token}`).send({ name: 'X', scopes: ['admin:all'] });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2 : Run to verify failure** → FAIL

- [ ] **Step 3 : Implémentation**

Créer `server/apiKeysRoutes.js` :

```js
import { Router } from 'express';
import { authMiddleware } from './middleware.js';
import { generateApiKey } from './apiKeys.js';
import { createApiKeyRecord, getApiKeysByUser, revokeApiKey } from './db.js';

const ALLOWED_SCOPES = ['roadmap:import', 'roadmap:read'];

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  const keys = getApiKeysByUser(req.user.id).map(k => ({
    ...k,
    scopes: safeJson(k.scopes, []),
  }));
  res.json(keys);
});

router.post('/', (req, res) => {
  const { name, scopes } = req.body;
  if (!name || typeof name !== 'string' || name.length === 0 || name.length > 100) {
    return res.status(400).json({ error: 'invalid_name' });
  }
  if (!Array.isArray(scopes) || scopes.length === 0 || scopes.some(s => !ALLOWED_SCOPES.includes(s))) {
    return res.status(400).json({ error: 'invalid_scopes', allowed: ALLOWED_SCOPES });
  }

  const { key, prefix, hash } = generateApiKey();
  const id = createApiKeyRecord(req.user.id, name, prefix, hash, scopes, 60);
  res.status(201).json({ id, name, scopes, key, prefix, created_at: new Date().toISOString() });
});

router.delete('/:id', (req, res) => {
  const result = revokeApiKey(parseInt(req.params.id, 10), req.user.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export default router;
```

- [ ] **Step 4 : Monter dans server/index.js**

Import : `import apiKeysRouter from './apiKeysRoutes.js';`
Route (après `app.use('/api/auth', authRoutes);`) : `app.use('/api/auth/api-keys', apiKeysRouter);`

- [ ] **Step 5 : Run tests** → 5 PASS
- [ ] **Step 6 : Commit** — `feat(api): add CRUD endpoints for API keys management`

---

### Task 9 : UI — Gestion des clés d'API

**Files:**
- Create: `src/lib/apiKeysApi.js`
- Create: `src/components/ApiKeysView.jsx`
- Modify: `src/components/ProfileView.jsx`
- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1 : Client**

Créer `src/lib/apiKeysApi.js` :

```js
import { api } from './api';

export const apiKeysApi = {
  list: () => api.request('/auth/api-keys'),
  create: (name, scopes) => api.request('/auth/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes }) }),
  revoke: (id) => api.request(`/auth/api-keys/${id}`, { method: 'DELETE' }),
};
```

- [ ] **Step 2 : i18n**

Ajouter dans `src/lib/i18n.jsx`, côté FR et EN (traduire les valeurs EN) :

```js
apiKeys: {
  title: 'Clés d\'API',
  subtitle: 'Gérez les clés d\'API pour permettre à des outils externes d\'intégrer votre compte',
  create: 'Créer une clé',
  keyName: 'Nom',
  keyNamePlaceholder: 'ex: Intégration Roadmap',
  scopes: 'Permissions',
  scopeRoadmapImport: 'Importer des projets depuis une roadmap',
  scopeRoadmapRead: 'Lire l\'état d\'imports roadmap',
  copyOnce: 'Copiez cette clé maintenant — elle ne sera plus affichée.',
  copy: 'Copier',
  copied: 'Copiée',
  revoke: 'Révoquer',
  revokeConfirm: 'Révoquer cette clé ? Les intégrations qui l\'utilisent cesseront immédiatement de fonctionner.',
  lastUsed: 'Dernière utilisation',
  never: 'Jamais',
  active: 'Active',
  revoked: 'Révoquée',
  noKeys: 'Aucune clé. Cliquez sur « Créer une clé » pour en générer une.',
},
```

- [ ] **Step 3 : Composant**

Créer `src/components/ApiKeysView.jsx` (voir code dans la section "UI — Code complet" en fin de document).

- [ ] **Step 4 : Intégrer dans ProfileView**

Lire `src/components/ProfileView.jsx` pour repérer la structure des onglets/sections. Ajouter une nouvelle section ou onglet "Clés d'API" qui rend `<ApiKeysView />`.

- [ ] **Step 5 : Test visuel**

`npm run dev` → Profil → Clés d'API. Créer, copier, révoquer. Vérifier dark mode + FR/EN.

- [ ] **Step 6 : Commit** — `feat(ui): add API keys management in profile`

---

### Task 10 : CORS whitelist + variables d'environnement

**Files:**
- Modify: `server/index.js`
- Create: `.env.example`

- [ ] **Step 1 : CORS spécifique à /api/v1**

Dans `server/index.js`, avant le montage de `publicApiRouter` :

```js
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
```

(Retirer la ligne précédente qui montait `publicApiRouter` sans CORS.)

- [ ] **Step 2 : .env.example**

Créer `.env.example` :
```
JWT_SECRET=change-this-in-production
PUBLIC_API_ALLOWED_ORIGINS=https://roadmap.example.com,https://another.example.com
PUBLIC_BASE_URL=https://calculateur.danielvaliquette.com
```

- [ ] **Step 3 : Commit** — `feat(api): add CORS whitelist for /api/v1 + document env vars`

---

### Task 11 : README

**Files:**
- Modify: `README.md`

- [ ] **Step 1** : Ajouter section "Public API (v1)" après "Capacity Management" référençant `docs/integration-api-roadmap.md`, listant les deux endpoints, décrivant l'auth par clé et les variables d'env requises.

- [ ] **Step 2 : Commit** — `docs: add Public API v1 section to README`

---

### Task 12 : Revue finale + déploiement

- [ ] **Step 1** : `npm test` (root + server) → tous PASS (40 existants + ~30 nouveaux)

- [ ] **Step 2** : Test manuel local

1. `npm run dev`
2. Se connecter → Profil → Clés d'API → Créer avec `roadmap:import`
3. Copier la clé
4. Tester avec curl :

```bash
curl -X POST http://localhost:3000/api/v1/roadmap/import \
  -H "X-API-Key: ckc_live_..." \
  -H "Content-Type: application/json" \
  -d '{"project":{"name":"Test","externalId":"RM-DEV-1","startDate":"2026-06-01"},"phases":[{"id":"a","name":"Découverte","order":1,"durationMonths":2},{"id":"b","name":"Conception","order":2,"durationMonths":3,"dependsOn":["a"]}]}'
```

5. Vérifier 201 + URL retournée
6. Ouvrir l'URL → projet avec 2 phases
7. Retenter même requête → 409
8. `?upsert=true` → 200 + update
9. Révoquer → retenter → 401

- [ ] **Step 3 : Déployer**

```bash
ssh ubuntu@51.178.80.50 -p 51422
cd /home/ubuntu/project-cost-calculator
git pull
# Ajouter PUBLIC_API_ALLOWED_ORIGINS et PUBLIC_BASE_URL dans le .env
docker compose up -d --build
```

(Rappel : port mapping à ré-ajouter après rebuild — voir `memory/feedback_deployment.md`.)

- [ ] **Step 4** : Re-test curl contre `https://calculateur.danielvaliquette.com/api/v1/roadmap/import`

- [ ] **Step 5** : PR + partage doc avec l'ami

```bash
git push origin feature/public-api-v1
gh pr create --title "feat: public API v1 — roadmap import" \
  --body "Implements /api/v1/roadmap/import with API key auth, Zod validation, graph checks, upsert. See docs/integration-api-roadmap.md."
```

Partager `docs/integration-api-roadmap.md` avec l'ami pour feedback. Itérer sur le contrat avant publication officielle.

---

## UI — Code complet de `ApiKeysView.jsx`

```jsx
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Copy, Check, Trash2, KeyRound } from 'lucide-react';
import { apiKeysApi } from '../lib/apiKeysApi';
import { useLocale } from '../lib/i18n';

const SCOPES = [
  { id: 'roadmap:import', labelKey: 'apiKeys.scopeRoadmapImport' },
  { id: 'roadmap:read', labelKey: 'apiKeys.scopeRoadmapRead' },
];

export default function ApiKeysView() {
  const { t } = useLocale();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState(['roadmap:import']);
  const [plaintextKey, setPlaintextKey] = useState(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true);
    const data = await apiKeysApi.list();
    setKeys(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate() {
    const result = await apiKeysApi.create(newName, newScopes);
    if (result?.key) {
      setPlaintextKey(result);
      setCreating(false);
      setNewName('');
      await refresh();
    }
  }

  async function handleRevoke(id) {
    if (!window.confirm(t('apiKeys.revokeConfirm'))) return;
    await apiKeysApi.revoke(id);
    await refresh();
  }

  function copyKey() {
    navigator.clipboard.writeText(plaintextKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div>Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-xl font-bold">{t('apiKeys.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('apiKeys.subtitle')}</p>
        </div>
        {!creating && !plaintextKey && (
          <Button onClick={() => setCreating(true)}>{t('apiKeys.create')}</Button>
        )}
      </div>

      {plaintextKey && (
        <Card className="border-amber-400 bg-amber-50 dark:bg-amber-900/10">
          <CardContent className="py-4 space-y-3">
            <p className="text-sm font-medium">{t('apiKeys.copyOnce')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-white dark:bg-gray-900 rounded font-mono text-xs break-all">
                {plaintextKey.key}
              </code>
              <Button size="sm" onClick={copyKey}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? t('apiKeys.copied') : t('apiKeys.copy')}
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPlaintextKey(null)}>OK</Button>
          </CardContent>
        </Card>
      )}

      {creating && (
        <Card>
          <CardContent className="py-4 space-y-3">
            <input
              className="input-field w-full"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t('apiKeys.keyNamePlaceholder')}
              maxLength={100}
            />
            <div>
              <div className="text-sm font-medium mb-2">{t('apiKeys.scopes')}</div>
              {SCOPES.map(s => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newScopes.includes(s.id)}
                    onChange={e => {
                      if (e.target.checked) setNewScopes([...newScopes, s.id]);
                      else setNewScopes(newScopes.filter(x => x !== s.id));
                    }}
                  />
                  {t(s.labelKey)}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCreate} disabled={!newName || newScopes.length === 0}>
                {t('apiKeys.create')}
              </Button>
              <Button variant="outline" onClick={() => { setCreating(false); setNewName(''); }}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {keys.length === 0 && !creating && !plaintextKey && (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t('apiKeys.noKeys')}</CardContent></Card>
      )}

      <div className="space-y-2">
        {keys.map(k => (
          <Card key={k.id}>
            <CardContent className="py-3 flex items-center gap-3">
              <KeyRound className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{k.name}</div>
                <div className="text-xs text-muted-foreground font-mono">{k.key_prefix}…</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t('apiKeys.scopes')}: {k.scopes.join(', ')} · {t('apiKeys.lastUsed')}: {k.last_used_at || t('apiKeys.never')}
                </div>
              </div>
              <div className="text-xs shrink-0">
                {k.revoked_at ? (
                  <span className="text-red-600">{t('apiKeys.revoked')}</span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => handleRevoke(k.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

## Self-Review — couverture des exigences

| Exigence | Tâche |
|---|---|
| Clés d'API scopées distinctes du JWT | 1, 3, 4, 8 |
| Révocation immédiate | 1 (revokeApiKey), 8 (DELETE) |
| Rate limiting par clé | 7 (perKeyLimiter) |
| Validation Zod frontière publique | 5 |
| Cycles + dangling + root phase | 5 |
| Mapping mois → semaines (4.33) | 6 |
| Dates explicites > durationMonths | 6 |
| Dépendances store-only | 6 |
| `externalId` unique par user | 7 (findProjectByExternalId) |
| 409 par défaut + upsert=true | 7 |
| Préservation teamMembers en upsert | 7 |
| Audit log par clé | 4 (logApiKeyUsage) |
| CORS whitelist | 10 |
| Versioning `/api/v1` | 7, 10 |
| UI création/révocation | 9 |
| Doc externe | `docs/integration-api-roadmap.md` ✅ |

## Tâches reportées (volontairement)

- **HMAC webhooks sortants** — à faire si on ajoute des notifications automatiques vers la roadmap (post-MVP)
- **OpenAPI spec** — peut être généré depuis Zod avec `zod-to-openapi` plus tard (~30 min)
- **Dashboard usage** — la table `api_key_usage` est alimentée mais non exposée en UI (à faire si besoin debug)

---

## Execution Handoff

Plan sauvegardé à `docs/superpowers/plans/2026-04-17-public-api-roadmap-import.md`. Deux options :

**1. Subagent-Driven (recommandé)** — Dispatch un subagent frais par tâche, revue entre tâches, itération rapide.
**2. Inline Execution** — Exécution dans cette session avec `executing-plans`, batch + checkpoints.

Quelle approche ?
