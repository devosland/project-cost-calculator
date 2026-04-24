/**
 * Tests for period-lock routes (PR 5 of the execution MVP, Decision 8).
 *
 * Covers:
 *   - GET returns a 12-month window with correct open/closed status
 *   - POST closes a period idempotently
 *   - DELETE reopens a period; is a safe no-op on an already-open period
 *   - 400 on a malformed YYYY-MM param
 *   - 400 on attempting to close a future period
 *   - 403 when a viewer tries to close or reopen
 *   - 404 when the project is unshared (no existence leak)
 *   - Once a period is closed, POST /tasks/:id/time on a date in that
 *     period returns 423 (integration sanity — already covered in PR 3
 *     but re-exercised here to confirm the close endpoint actually
 *     activates the lock).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import executionRouter from '../execution/index.js';
import { db } from '../db.js';
import { JWT_SECRET } from '../middleware.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/execution', executionRouter);
  return app;
}

const EMAILS = {
  owner: 'period-owner@test.local',
  viewer: 'period-viewer@test.local',
  outsider: 'period-outsider@test.local',
};

function resetFixtures() {
  const rows = db.prepare('SELECT id FROM users WHERE email IN (?, ?, ?)').all(
    EMAILS.owner, EMAILS.viewer, EMAILS.outsider
  );
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return;
  const p = ids.map(() => '?').join(',');
  db.prepare(`DELETE FROM project_shares WHERE user_id IN (${p})`).run(...ids);
  db.prepare(`DELETE FROM projects WHERE owner_id IN (${p})`).run(...ids);
  db.prepare(`DELETE FROM resources WHERE user_id IN (${p})`).run(...ids);
  db.prepare(`DELETE FROM user_data WHERE user_id IN (${p})`).run(...ids);
  db.prepare(`DELETE FROM users WHERE id IN (${p})`).run(...ids);
}

function seedUser(email) {
  const r = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, email, 'x');
  const id = Number(r.lastInsertRowid);
  return { id, email, token: jwt.sign({ id, email, name: email }, JWT_SECRET) };
}

function seedProject(ownerId, id = 'period-p1') {
  db.prepare('INSERT INTO projects (id, owner_id, name, data) VALUES (?, ?, ?, ?)').run(id, ownerId, 'Period', '{}');
  const s = db.prepare('INSERT INTO project_statuses (project_id, name, category, order_idx) VALUES (?, ?, ?, ?)');
  s.run(id, 'To Do', 'todo', 0);
  return id;
}

/** Oldest month in the 12-month window returned by GET /periods. */
function oldestPastPeriod() {
  const d = new Date();
  d.setMonth(d.getMonth() - 11);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** First day of the oldest month, `YYYY-MM-DD`. */
function oldestPastDate() {
  return `${oldestPastPeriod()}-01`;
}

let app;
beforeEach(() => { resetFixtures(); app = buildApp(); });
afterAll(resetFixtures);

describe('GET /periods', () => {
  it('returns exactly 12 rows, all open initially', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    const r = await request(app).get(`/api/execution/projects/${pid}/periods`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(12);
    expect(r.body.every((x) => x.closed_at === null)).toBe(true);
  });

  it('marks closed periods with who and when', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    const period = oldestPastPeriod();
    db.prepare(
      'INSERT INTO project_closed_periods (project_id, period, closed_at, closed_by_user) VALUES (?, ?, CURRENT_TIMESTAMP, ?)'
    ).run(pid, period, owner.id);
    const r = await request(app).get(`/api/execution/projects/${pid}/periods`)
      .set('Authorization', `Bearer ${owner.token}`);
    const row = r.body.find((x) => x.period === period);
    expect(row.closed_at).not.toBeNull();
    expect(row.closed_by_email).toBe(EMAILS.owner);
  });

  it('404 to an unshared user (no existence leak)', async () => {
    const owner = seedUser(EMAILS.owner);
    const outsider = seedUser(EMAILS.outsider);
    const pid = seedProject(owner.id);
    const r = await request(app).get(`/api/execution/projects/${pid}/periods`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(r.status).toBe(404);
  });
});

describe('POST /periods/:yyyyMM', () => {
  it('closes a past period and is idempotent on a second call', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    const p = oldestPastPeriod();
    const r1 = await request(app).post(`/api/execution/projects/${pid}/periods/${p}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r1.status).toBe(201);
    expect(r1.body.closed_by_email).toBe(EMAILS.owner);

    // Second call: no-op, same row returned.
    const r2 = await request(app).post(`/api/execution/projects/${pid}/periods/${p}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r2.status).toBe(201);
    expect(r2.body.closed_at).toBe(r1.body.closed_at);
  });

  it('400 on an invalid format', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    const r = await request(app).post(`/api/execution/projects/${pid}/periods/2026-4`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_period_format');
  });

  it('400 when closing a future period', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    const future = '2099-01';
    const r = await request(app).post(`/api/execution/projects/${pid}/periods/${future}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('cannot_close_future_period');
  });

  it('403 when a viewer tries to close', async () => {
    const owner = seedUser(EMAILS.owner);
    const viewer = seedUser(EMAILS.viewer);
    const pid = seedProject(owner.id);
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, viewer.id, 'viewer');
    const r = await request(app).post(`/api/execution/projects/${pid}/periods/${oldestPastPeriod()}`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(r.status).toBe(403);
  });
});

describe('DELETE /periods/:yyyyMM (reopen)', () => {
  it('removes the close row', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    const p = oldestPastPeriod();
    db.prepare(
      'INSERT INTO project_closed_periods (project_id, period, closed_at, closed_by_user) VALUES (?, ?, CURRENT_TIMESTAMP, ?)'
    ).run(pid, p, owner.id);
    const r = await request(app).delete(`/api/execution/projects/${pid}/periods/${p}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(200);
    const count = db.prepare('SELECT COUNT(*) AS n FROM project_closed_periods WHERE project_id = ? AND period = ?').get(pid, p).n;
    expect(count).toBe(0);
  });

  it('is a no-op on an already-open period (still 200)', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    const r = await request(app).delete(`/api/execution/projects/${pid}/periods/${oldestPastPeriod()}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(200);
  });

  it('403 for viewer', async () => {
    const owner = seedUser(EMAILS.owner);
    const viewer = seedUser(EMAILS.viewer);
    const pid = seedProject(owner.id);
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, viewer.id, 'viewer');
    const r = await request(app).delete(`/api/execution/projects/${pid}/periods/${oldestPastPeriod()}`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(r.status).toBe(403);
  });
});

describe('integration — close activates the write lock', () => {
  it('POST /tasks/:id/time is rejected 423 once the period is closed', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    // Set up a minimal graph with a logged-in resource.
    const rid = Number(db.prepare(
      'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
    ).run(owner.id, 'Alice', 'Dev', 'Senior').lastInsertRowid);
    db.prepare(`
      INSERT INTO user_data (user_id, projects, rates, updated_at)
      VALUES (?, '[]', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET rates = excluded.rates
    `).run(owner.id, JSON.stringify({ INTERNAL_RATE: 85, CONSULTANT_RATES: { Dev: { Senior: 120 } } }));
    const e = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'E', status: 'To Do' });
    const s = await request(app).post(`/api/execution/epics/${e.body.id}/stories`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'S', status: 'To Do' });
    const t = await request(app).post(`/api/execution/stories/${s.body.id}/tasks`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'T', status: 'To Do', assignee_id: rid });

    const date = oldestPastDate();
    // Before close: the log is accepted.
    const preLog = await request(app).post(`/api/execution/tasks/${t.body.id}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date, hours: 1 });
    expect(preLog.status).toBe(201);

    // Close the period via the new endpoint.
    const closeRes = await request(app).post(`/api/execution/projects/${pid}/periods/${oldestPastPeriod()}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(closeRes.status).toBe(201);

    // Now writes on that date are rejected with 423.
    const postLog = await request(app).post(`/api/execution/tasks/${t.body.id}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date, hours: 1 });
    expect(postLog.status).toBe(423);
    expect(postLog.body.error).toBe('period_closed');
  });
});
