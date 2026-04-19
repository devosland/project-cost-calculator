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

describe('api keys usage', () => {
  let app;
  beforeEach(() => {
    app = buildApp();
    db.prepare('DELETE FROM api_keys').run();
    db.prepare('DELETE FROM api_key_usage').run();
  });

  it('returns 404 for invalid keyId', async () => {
    const { token } = seedUser();
    const r = await request(app).get('/api/auth/api-keys/99999/usage').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(404);
  });

  it('returns 404 if key belongs to another user', async () => {
    // Create a key owned by user1
    const { token: token1 } = seedUser();
    const created = await request(app)
      .post('/api/auth/api-keys').set('Authorization', `Bearer ${token1}`)
      .send({ name: 'Other', scopes: ['roadmap:import'] });
    const keyId = created.body.id;

    // Create user2 and try to access user1's key
    db.prepare('DELETE FROM users WHERE email = ?').run('other@test.com');
    const r2 = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run('other@test.com', 'O', 'x');
    const token2 = jwt.sign({ id: Number(r2.lastInsertRowid), email: 'other@test.com', name: 'O' }, JWT_SECRET);

    const r = await request(app).get(`/api/auth/api-keys/${keyId}/usage`).set('Authorization', `Bearer ${token2}`);
    expect(r.status).toBe(404);
  });

  it('returns stats/recent/daily for owned key', async () => {
    const { token, id: userId } = seedUser();
    const created = await request(app)
      .post('/api/auth/api-keys').set('Authorization', `Bearer ${token}`)
      .send({ name: 'MyKey', scopes: ['roadmap:import'] });
    const keyId = created.body.id;

    // Seed some usage rows directly
    db.prepare('INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, ip) VALUES (?, ?, ?, ?, ?)').run(keyId, '/api/v1/projects', 'GET', 200, '127.0.0.1');
    db.prepare('INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, ip) VALUES (?, ?, ?, ?, ?)').run(keyId, '/api/v1/projects', 'GET', 404, '127.0.0.1');

    const r = await request(app).get(`/api/auth/api-keys/${keyId}/usage`).set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('stats');
    expect(r.body).toHaveProperty('recent');
    expect(r.body).toHaveProperty('daily');
    expect(r.body.stats.total).toBe(2);
    expect(r.body.stats.success).toBe(1);
    expect(r.body.stats.clientError).toBe(1);
    expect(r.body.stats.topEndpoint).toBe('/api/v1/projects');
    expect(r.body.recent).toHaveLength(2);
  });

  it('respects days query param', async () => {
    const { token } = seedUser();
    const created = await request(app)
      .post('/api/auth/api-keys').set('Authorization', `Bearer ${token}`)
      .send({ name: 'DayTest', scopes: ['roadmap:import'] });
    const keyId = created.body.id;

    // Insert an old row (90 days ago) and a recent row
    db.prepare("INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, ip, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', '-90 days'))").run(keyId, '/old', 'GET', 200, null);
    db.prepare('INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, ip) VALUES (?, ?, ?, ?, ?)').run(keyId, '/new', 'GET', 200, null);

    // With days=7, only the recent row should count
    const r7 = await request(app).get(`/api/auth/api-keys/${keyId}/usage?days=7`).set('Authorization', `Bearer ${token}`);
    expect(r7.body.stats.total).toBe(1);

    // With days=365, both rows count
    const r365 = await request(app).get(`/api/auth/api-keys/${keyId}/usage?days=365`).set('Authorization', `Bearer ${token}`);
    expect(r365.body.stats.total).toBe(2);
  });
});
