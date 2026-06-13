/**
 * Authorization tests for the bulk sync endpoint (PUT /api/data) and
 * capacity assignment creation (POST /api/capacity/assignments).
 *
 * Covers the 2026-06-12 review findings:
 *  - B1: a submitted project id must only be written by its owner or an
 *        editor share — never by a viewer share or an unrelated user (IDOR).
 *  - B2: PUT /api/data must never delete projects absent from the payload
 *        (partial payloads from a second tab must be harmless).
 *  - B6: assignments cannot be created on a project the caller can't write to.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import dataRouter from '../data.js';
import capacityRouter from '../capacity.js';
import { db } from '../db.js';
import { JWT_SECRET } from '../middleware.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/data', dataRouter);
  app.use('/api/capacity', capacityRouter);
  return app;
}

// The server test suite shares one SQLite file across files and runs.
// resources.user_id → users has no ON DELETE CASCADE, so cleanup-by-DELETE
// breaks once a previous run linked resources to our users. Instead, every
// run works with brand-new identifiers and never deletes anything.
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
let userSeq = 0;

function seedUser(label) {
  const email = `authz-${RUN}-${userSeq}-${label}@test.com`;
  const r = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, 'T', 'x');
  const id = Number(r.lastInsertRowid);
  const token = jwt.sign({ id, email, name: 'T' }, JWT_SECRET);
  return { id, token };
}

function pid(label) {
  return `authz-${RUN}-${label}`;
}

function seedProject(idLabel, ownerId, name = 'Projet', data = {}) {
  const id = pid(idLabel);
  db.prepare(
    'INSERT INTO projects (id, owner_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  ).run(id, ownerId, name, JSON.stringify({ id, name, ...data }));
  return { id, ownerId, name };
}

function share(projectIdLabel, userId, role) {
  db.prepare(
    'INSERT OR REPLACE INTO project_shares (project_id, user_id, role, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)'
  ).run(pid(projectIdLabel), userId, role);
}

function getProject(idLabel) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(pid(idLabel));
}

let app, owner, editor, viewer, stranger;

beforeEach(() => {
  app = buildApp();
  userSeq += 1;
  owner = seedUser('owner');
  editor = seedUser('editor');
  viewer = seedUser('viewer');
  stranger = seedUser('stranger');
});

describe('PUT /api/data — per-project authorization (B1)', () => {
  it('rejects an unrelated user overwriting an existing project id (IDOR)', async () => {
    seedProject('p1', owner.id, 'Original');

    const r = await request(app)
      .put('/api/data').set('Authorization', `Bearer ${stranger.token}`)
      .send({ projects: [{ id: pid('p1'), name: 'Pwned' }], rates: null });

    expect(r.status).toBe(200);
    expect(r.body.skipped).toContain(pid('p1'));
    const row = getProject('p1');
    expect(row.name).toBe('Original');
    expect(row.owner_id).toBe(owner.id);
  });

  it('rejects a viewer share writing through the bulk save', async () => {
    seedProject('p2', owner.id, 'Original');
    share('p2', viewer.id, 'viewer');

    const r = await request(app)
      .put('/api/data').set('Authorization', `Bearer ${viewer.token}`)
      .send({ projects: [{ id: pid('p2'), name: 'Edited by viewer' }], rates: null });

    expect(r.status).toBe(200);
    expect(r.body.skipped).toContain(pid('p2'));
    expect(getProject('p2').name).toBe('Original');
  });

  it('allows an editor share to write, without reassigning ownership', async () => {
    seedProject('p3', owner.id, 'Original');
    share('p3', editor.id, 'editor');

    const r = await request(app)
      .put('/api/data').set('Authorization', `Bearer ${editor.token}`)
      .send({ projects: [{ id: pid('p3'), name: 'Edited by editor' }], rates: null });

    expect(r.status).toBe(200);
    expect(r.body.skipped).toEqual([]);
    const row = getProject('p3');
    expect(row.name).toBe('Edited by editor');
    expect(row.owner_id).toBe(owner.id); // ownership preserved
  });

  it('inserts a new id as owned by the caller', async () => {
    const r = await request(app)
      .put('/api/data').set('Authorization', `Bearer ${owner.token}`)
      .send({ projects: [{ id: pid('new'), name: 'Créé' }], rates: null });

    expect(r.status).toBe(200);
    const row = getProject('new');
    expect(row.owner_id).toBe(owner.id);
    expect(row.name).toBe('Créé');
  });
});

describe('PUT /api/data — no delete-by-absence (B2)', () => {
  it('keeps owned projects that are absent from the payload', async () => {
    seedProject('keep-1', owner.id, 'Gardé 1');
    seedProject('keep-2', owner.id, 'Gardé 2');

    // Partial payload: only one of the two owned projects (second-tab scenario).
    const r1 = await request(app)
      .put('/api/data').set('Authorization', `Bearer ${owner.token}`)
      .send({ projects: [{ id: pid('keep-1'), name: 'Gardé 1 modifié' }], rates: null });
    expect(r1.status).toBe(200);
    expect(getProject('keep-2')).toBeDefined();

    // Worst case: empty payload must not wipe anything.
    const r2 = await request(app)
      .put('/api/data').set('Authorization', `Bearer ${owner.token}`)
      .send({ projects: [], rates: null });
    expect(r2.status).toBe(200);
    expect(getProject('keep-1')).toBeDefined();
    expect(getProject('keep-2')).toBeDefined();
  });
});

describe('POST /api/capacity/assignments — project access (B6)', () => {
  function seedResource(userId, name) {
    // No pre-delete: users are unique per run, so UNIQUE(user_id, name) can't collide.
    const r = db.prepare(
      'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
    ).run(userId, name, 'Developer', 'Senior');
    return Number(r.lastInsertRowid);
  }

  const body = (resourceId, projectIdLabel) => ({
    resource_id: resourceId, project_id: pid(projectIdLabel), phase_id: 'phase-1',
    allocation: 50, start_month: '2026-01', end_month: '2026-03',
  });

  it("403 on a project the caller can't write to", async () => {
    seedProject('cap-foreign', owner.id);
    const resId = seedResource(stranger.id, 'ResStranger');

    const r = await request(app)
      .post('/api/capacity/assignments').set('Authorization', `Bearer ${stranger.token}`)
      .send(body(resId, 'cap-foreign'));
    expect(r.status).toBe(403);
  });

  it('403 with only a viewer share', async () => {
    seedProject('cap-viewer', owner.id);
    share('cap-viewer', viewer.id, 'viewer');
    const resId = seedResource(viewer.id, 'ResViewer');

    const r = await request(app)
      .post('/api/capacity/assignments').set('Authorization', `Bearer ${viewer.token}`)
      .send(body(resId, 'cap-viewer'));
    expect(r.status).toBe(403);
  });

  it('201 for the owner, 201 for an editor share', async () => {
    seedProject('cap-own', owner.id);
    const ownRes = seedResource(owner.id, 'ResOwner');
    const r1 = await request(app)
      .post('/api/capacity/assignments').set('Authorization', `Bearer ${owner.token}`)
      .send(body(ownRes, 'cap-own'));
    expect(r1.status).toBe(201);

    seedProject('cap-edit', owner.id);
    share('cap-edit', editor.id, 'editor');
    const editRes = seedResource(editor.id, 'ResEditor');
    const r2 = await request(app)
      .post('/api/capacity/assignments').set('Authorization', `Bearer ${editor.token}`)
      .send(body(editRes, 'cap-edit'));
    expect(r2.status).toBe(201);
  });
});
