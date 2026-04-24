/**
 * Tests for the Resource ↔ User linkage feature (PR 4 of the execution MVP).
 *
 * Covers:
 *   - GET /capacity/share-candidates returns self + project-shared users,
 *     with linked_resource_id flagged for already-linked candidates.
 *   - GET /capacity/resources joins users for linked_user_email convenience.
 *   - PUT /capacity/resources/:id/user accepts a valid candidate, a null
 *     unlink, 400s on an invalid user, 409s on an already-linked one, 403s
 *     when the caller does not own the resource.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import capacityRouter from '../capacity.js';
import { db } from '../db.js';
import { JWT_SECRET } from '../middleware.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/capacity', capacityRouter);
  return app;
}

const EMAILS = {
  owner: 'link-owner@test.local',
  member: 'link-member@test.local',
  stranger: 'link-stranger@test.local',
};

function resetFixtures() {
  const userRows = db.prepare('SELECT id FROM users WHERE email IN (?, ?, ?)').all(
    EMAILS.owner, EMAILS.member, EMAILS.stranger
  );
  const userIds = userRows.map((r) => r.id);
  if (userIds.length === 0) return;
  const p = userIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM project_shares WHERE user_id IN (${p})`).run(...userIds);
  db.prepare(`DELETE FROM projects WHERE owner_id IN (${p})`).run(...userIds);
  db.prepare(`DELETE FROM resources WHERE user_id IN (${p})`).run(...userIds);
  db.prepare(`DELETE FROM user_data WHERE user_id IN (${p})`).run(...userIds);
  db.prepare(`DELETE FROM users WHERE id IN (${p})`).run(...userIds);
}

function seedUser(email) {
  const r = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, email, 'x');
  const id = Number(r.lastInsertRowid);
  return { id, email, token: jwt.sign({ id, email, name: email }, JWT_SECRET) };
}

function seedProject(ownerId, id = 'link-p1') {
  db.prepare('INSERT INTO projects (id, owner_id, name, data) VALUES (?, ?, ?, ?)').run(id, ownerId, 'Link Test', '{}');
  return id;
}

function seedResource(ownerId, name = 'Alice') {
  const r = db.prepare(
    'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
  ).run(ownerId, name, 'Dev', 'Senior');
  return Number(r.lastInsertRowid);
}

let app;
beforeEach(() => { resetFixtures(); app = buildApp(); });
afterAll(resetFixtures);

describe('GET /capacity/share-candidates', () => {
  it('returns the caller even with no shares', async () => {
    const owner = seedUser(EMAILS.owner);
    const r = await request(app).get('/api/capacity/share-candidates')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0].id).toBe(owner.id);
    expect(r.body[0].linked_resource_id).toBeNull();
  });

  it('includes users shared on any of the caller\'s projects', async () => {
    const owner = seedUser(EMAILS.owner);
    const member = seedUser(EMAILS.member);
    const pid = seedProject(owner.id);
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, member.id, 'editor');

    const r = await request(app).get('/api/capacity/share-candidates')
      .set('Authorization', `Bearer ${owner.token}`);
    const ids = r.body.map((u) => u.id).sort();
    expect(ids).toEqual([owner.id, member.id].sort((a, b) => a - b));
  });

  it('excludes users not shared on any project owned by the caller', async () => {
    const owner = seedUser(EMAILS.owner);
    /* stranger intentionally unused — just confirms they do NOT appear. */
    seedUser(EMAILS.stranger);
    const r = await request(app).get('/api/capacity/share-candidates')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.body.map((u) => u.email)).toEqual([EMAILS.owner]);
  });

  it('flags linked_resource_id when a candidate is already linked', async () => {
    const owner = seedUser(EMAILS.owner);
    const member = seedUser(EMAILS.member);
    const pid = seedProject(owner.id);
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, member.id, 'editor');
    const rid = seedResource(owner.id);
    db.prepare('UPDATE resources SET linked_user_id = ? WHERE id = ?').run(member.id, rid);

    const r = await request(app).get('/api/capacity/share-candidates')
      .set('Authorization', `Bearer ${owner.token}`);
    const memberRow = r.body.find((u) => u.id === member.id);
    expect(memberRow.linked_resource_id).toBe(rid);
    const ownerRow = r.body.find((u) => u.id === owner.id);
    expect(ownerRow.linked_resource_id).toBeNull();
  });
});

describe('GET /capacity/resources exposes linkage fields', () => {
  it('returns linked_user_email when a user is linked', async () => {
    const owner = seedUser(EMAILS.owner);
    const member = seedUser(EMAILS.member);
    const rid = seedResource(owner.id);
    db.prepare('UPDATE resources SET linked_user_id = ? WHERE id = ?').run(member.id, rid);

    const r = await request(app).get('/api/capacity/resources')
      .set('Authorization', `Bearer ${owner.token}`);
    const row = r.body.find((x) => x.id === rid);
    expect(row.linked_user_id).toBe(member.id);
    expect(row.linked_user_email).toBe(member.email);
  });

  it('returns null for unlinked resources', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const r = await request(app).get('/api/capacity/resources')
      .set('Authorization', `Bearer ${owner.token}`);
    const row = r.body.find((x) => x.id === rid);
    expect(row.linked_user_id).toBeNull();
    expect(row.linked_user_email).toBeNull();
  });
});

describe('PUT /capacity/resources/:id/user', () => {
  it('links a valid share candidate', async () => {
    const owner = seedUser(EMAILS.owner);
    const member = seedUser(EMAILS.member);
    const pid = seedProject(owner.id);
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, member.id, 'editor');
    const rid = seedResource(owner.id);

    const r = await request(app).put(`/api/capacity/resources/${rid}/user`)
      .set('Authorization', `Bearer ${owner.token}`).send({ user_id: member.id });
    expect(r.status).toBe(200);
    expect(r.body.linked_user_id).toBe(member.id);
    expect(r.body.linked_user_email).toBe(member.email);
  });

  it('unlinks when user_id is null', async () => {
    const owner = seedUser(EMAILS.owner);
    const member = seedUser(EMAILS.member);
    const pid = seedProject(owner.id);
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, member.id, 'editor');
    const rid = seedResource(owner.id);
    db.prepare('UPDATE resources SET linked_user_id = ? WHERE id = ?').run(member.id, rid);

    const r = await request(app).put(`/api/capacity/resources/${rid}/user`)
      .set('Authorization', `Bearer ${owner.token}`).send({ user_id: null });
    expect(r.status).toBe(200);
    expect(r.body.linked_user_id).toBeNull();
  });

  it('rejects a user not shared on any of the owner\'s projects', async () => {
    const owner = seedUser(EMAILS.owner);
    const stranger = seedUser(EMAILS.stranger);
    const rid = seedResource(owner.id);

    const r = await request(app).put(`/api/capacity/resources/${rid}/user`)
      .set('Authorization', `Bearer ${owner.token}`).send({ user_id: stranger.id });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_user');
  });

  it('returns 409 when the user is already linked to another resource', async () => {
    const owner = seedUser(EMAILS.owner);
    const member = seedUser(EMAILS.member);
    const pid = seedProject(owner.id);
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, member.id, 'editor');
    const r1 = seedResource(owner.id, 'Alice');
    const r2 = seedResource(owner.id, 'Bob');
    db.prepare('UPDATE resources SET linked_user_id = ? WHERE id = ?').run(member.id, r1);

    const r = await request(app).put(`/api/capacity/resources/${r2}/user`)
      .set('Authorization', `Bearer ${owner.token}`).send({ user_id: member.id });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe('already_linked');
    expect(r.body.resource_id).toBe(r1);
  });

  it('403 when the caller does not own the resource', async () => {
    const owner = seedUser(EMAILS.owner);
    const stranger = seedUser(EMAILS.stranger);
    const rid = seedResource(owner.id);

    const r = await request(app).put(`/api/capacity/resources/${rid}/user`)
      .set('Authorization', `Bearer ${stranger.token}`).send({ user_id: stranger.id });
    expect(r.status).toBe(403);
  });

  it('rejects non-integer user_id with 400', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const r = await request(app).put(`/api/capacity/resources/${rid}/user`)
      .set('Authorization', `Bearer ${owner.token}`).send({ user_id: 'abc' });
    expect(r.status).toBe(400);
  });
});
