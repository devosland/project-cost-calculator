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
