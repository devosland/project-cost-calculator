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
