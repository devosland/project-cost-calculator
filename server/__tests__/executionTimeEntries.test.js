/**
 * Tests for the execution module time-entry + rollup routes (PR 3 of the
 * execution MVP).
 *
 * Covers:
 *   - Rate snapshotting (the IPC May use case): bumping rates after a log
 *     does not re-price the existing entry.
 *   - Own-tasks-only enforcement (Decision 9), with owner override.
 *   - Period lock refuses writes dated in a closed month (infrastructure
 *     active in PR 3 even though the close/reopen UI lands in PR 5).
 *   - Future-date rejection.
 *   - Update: only the author can edit their own entries; owner can edit any.
 *   - Update: old and new date must both be in open periods.
 *   - Rollups: by_month, by_phase equal-split, totals, zero-cost epics.
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
  owner: 'exec-te-owner@test.local',
  editor: 'exec-te-editor@test.local',
  outsider: 'exec-te-outsider@test.local',
};

function resetFixtures() {
  const userRows = db.prepare('SELECT id FROM users WHERE email IN (?, ?, ?)').all(
    EMAILS.owner, EMAILS.editor, EMAILS.outsider
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

function seedProject(ownerId, id = 'exec-te-p1') {
  db.prepare('INSERT INTO projects (id, owner_id, name, data) VALUES (?, ?, ?, ?)').run(id, ownerId, 'Exec TE', '{}');
  const s = db.prepare('INSERT INTO project_statuses (project_id, name, category, order_idx) VALUES (?, ?, ?, ?)');
  s.run(id, 'To Do', 'todo', 0);
  s.run(id, 'In Progress', 'inprogress', 1);
  s.run(id, 'Done', 'done', 2);
  return id;
}

function seedRates(userId, overrides = {}) {
  const rates = JSON.stringify({
    INTERNAL_RATE: 85,
    CONSULTANT_RATES: { Dev: { Senior: 120, Junior: 80 } },
    ...overrides,
  });
  db.prepare(`
    INSERT INTO user_data (user_id, projects, rates, updated_at)
    VALUES (?, '[]', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET rates = excluded.rates
  `).run(userId, rates);
}

function seedResource(ownerId, overrides = {}) {
  const { name = 'Alice', role = 'Dev', level = 'Senior', linked_user_id = null } = overrides;
  const r = db.prepare(
    'INSERT INTO resources (user_id, name, role, level, linked_user_id) VALUES (?, ?, ?, ?, ?)'
  ).run(ownerId, name, role, level, linked_user_id);
  return Number(r.lastInsertRowid);
}

/** Build a full project graph: project + status + epic + story + one task. */
async function setupGraph(app, owner, { assigneeId = null } = {}) {
  const pid = seedProject(owner.id);
  seedRates(owner.id);
  const e = await request(app).post(`/api/execution/projects/${pid}/epics`)
    .set('Authorization', `Bearer ${owner.token}`).send({ title: 'E', status: 'To Do' });
  const s = await request(app).post(`/api/execution/epics/${e.body.id}/stories`)
    .set('Authorization', `Bearer ${owner.token}`).send({ title: 'S', status: 'To Do' });
  const t = await request(app).post(`/api/execution/stories/${s.body.id}/tasks`)
    .set('Authorization', `Bearer ${owner.token}`).send({ title: 'T', status: 'To Do', assignee_id: assigneeId });
  return { pid, epicId: e.body.id, storyId: s.body.id, taskId: t.body.id };
}

let app;
beforeEach(() => { resetFixtures(); app = buildApp(); });
afterAll(resetFixtures);

// ---------------------------------------------------------------------------
// POST /time — creation, rate snapshot, validation, period lock
// ---------------------------------------------------------------------------

describe('time_entries POST', () => {
  it('snapshots the rate at insert time — bumping rates later does not re-price', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id, { role: 'Dev', level: 'Senior' });
    const { taskId } = await setupGraph(app, owner, { assigneeId: rid });

    const first = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ date: '2026-03-15', hours: 2 });
    expect(first.status).toBe(201);
    expect(first.body.rate_hourly).toBe(120);

    // IPC bump — Senior now 130.
    seedRates(owner.id, { CONSULTANT_RATES: { Dev: { Senior: 130, Junior: 80 } } });

    const second = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ date: '2026-04-05', hours: 1 });
    expect(second.body.rate_hourly).toBe(130);

    // The March entry is frozen at 120 even though the rate bumped in April.
    const entries = db.prepare('SELECT date, rate_hourly FROM time_entries WHERE task_id = ? ORDER BY date').all(taskId);
    expect(entries).toEqual([
      { date: '2026-03-15', rate_hourly: 120 },
      { date: '2026-04-05', rate_hourly: 130 },
    ]);
  });

  it('defaults source to "manual"', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const { taskId } = await setupGraph(app, owner, { assigneeId: rid });
    const r = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 1 });
    expect(r.body.source).toBe('manual');
  });

  it('rejects hours > 24 at the zod layer', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const { taskId } = await setupGraph(app, owner, { assigneeId: rid });
    const r = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 25 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation_error');
  });

  it('rejects a future date', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const { taskId } = await setupGraph(app, owner, { assigneeId: rid });
    const future = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const r = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: future, hours: 1 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('future_date');
  });

  it('returns 423 when the period is closed', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const { pid, taskId } = await setupGraph(app, owner, { assigneeId: rid });
    db.prepare(
      'INSERT INTO project_closed_periods (project_id, period, closed_at, closed_by_user) VALUES (?, ?, ?, ?)'
    ).run(pid, '2026-04', '2026-05-01T00:00:00Z', owner.id);
    const r = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 1 });
    expect(r.status).toBe(423);
    expect(r.body.error).toBe('period_closed');
    expect(r.body.period).toBe('2026-04');
  });
});

// ---------------------------------------------------------------------------
// Decision 9: own-tasks-only with owner override
// ---------------------------------------------------------------------------

describe('time_entries ownership (Decision 9)', () => {
  it('editor with linked resource can log on their own task', async () => {
    const owner = seedUser(EMAILS.owner);
    const editor = seedUser(EMAILS.editor);
    const rid = seedResource(owner.id, { linked_user_id: editor.id });
    const { pid, taskId } = await setupGraph(app, owner, { assigneeId: rid });
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, editor.id, 'editor');

    const r = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${editor.token}`).send({ date: '2026-04-15', hours: 2 });
    expect(r.status).toBe(201);
  });

  it('editor cannot log on someone else\'s task', async () => {
    const owner = seedUser(EMAILS.owner);
    const editor = seedUser(EMAILS.editor);
    const rid = seedResource(owner.id, { name: 'Bob' }); // no linked_user_id
    const { pid, taskId } = await setupGraph(app, owner, { assigneeId: rid });
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, editor.id, 'editor');

    const r = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${editor.token}`).send({ date: '2026-04-15', hours: 2 });
    expect(r.status).toBe(403);
    expect(r.body.error).toBe('not_your_task');
  });

  it('owner can override and log on any resource', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id, { name: 'Bob' }); // no link to anyone
    const { taskId } = await setupGraph(app, owner, { assigneeId: rid });
    const r = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 3 });
    expect(r.status).toBe(201);
  });

  it('unassigned task: only owner can log, must supply resource_id', async () => {
    const owner = seedUser(EMAILS.owner);
    const editor = seedUser(EMAILS.editor);
    const rid = seedResource(owner.id);
    const { pid, taskId } = await setupGraph(app, owner, { assigneeId: null });
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, editor.id, 'editor');

    // Editor tries to log on an unassigned task — 403.
    const ed = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${editor.token}`).send({ date: '2026-04-15', hours: 1, resource_id: rid });
    expect(ed.status).toBe(403);
    expect(ed.body.error).toBe('unassigned_task_owner_only');

    // Owner without resource_id — 400.
    const noRes = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 1 });
    expect(noRes.status).toBe(400);
    expect(noRes.body.error).toBe('resource_id_required');

    // Owner with resource_id — 201.
    const ok = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 1, resource_id: rid });
    expect(ok.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// PUT / DELETE
// ---------------------------------------------------------------------------

describe('time_entries PUT / DELETE', () => {
  it('PUT can change hours, date, note but not rate', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const { taskId } = await setupGraph(app, owner, { assigneeId: rid });
    const create = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 2 });

    const put = await request(app).put(`/api/execution/time/${create.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`).send({ hours: 3.5, note: 'pair programming' });
    expect(put.status).toBe(200);
    expect(put.body.hours).toBe(3.5);
    expect(put.body.note).toBe('pair programming');
    expect(put.body.rate_hourly).toBe(create.body.rate_hourly); // snapshot preserved
  });

  it('editor cannot edit an entry they did not log', async () => {
    const owner = seedUser(EMAILS.owner);
    const editor = seedUser(EMAILS.editor);
    const rid = seedResource(owner.id); // not linked
    const { pid, taskId } = await setupGraph(app, owner, { assigneeId: rid });
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, editor.id, 'editor');

    const create = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 2 });
    const put = await request(app).put(`/api/execution/time/${create.body.id}`)
      .set('Authorization', `Bearer ${editor.token}`).send({ hours: 4 });
    expect(put.status).toBe(403);
    expect(put.body.error).toBe('not_your_entry');
  });

  it('PUT rejects move into a closed period (423)', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const { pid, taskId } = await setupGraph(app, owner, { assigneeId: rid });
    const create = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 2 });
    // Close March — original date (April) is open, but moving into March is blocked.
    db.prepare(
      'INSERT INTO project_closed_periods (project_id, period, closed_at, closed_by_user) VALUES (?, ?, ?, ?)'
    ).run(pid, '2026-03', '2026-05-01T00:00:00Z', owner.id);
    const r = await request(app).put(`/api/execution/time/${create.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-03-10' });
    expect(r.status).toBe(423);
  });

  it('DELETE rejects when the entry is in a closed period', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const { pid, taskId } = await setupGraph(app, owner, { assigneeId: rid });
    const create = await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-15', hours: 2 });
    db.prepare(
      'INSERT INTO project_closed_periods (project_id, period, closed_at, closed_by_user) VALUES (?, ?, ?, ?)'
    ).run(pid, '2026-04', '2026-05-01T00:00:00Z', owner.id);
    const r = await request(app).delete(`/api/execution/time/${create.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(423);
  });
});

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

describe('rollup endpoints', () => {
  it('returns zeros for a project with no time entries', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    seedRates(owner.id);
    const r = await request(app).get(`/api/execution/projects/${pid}/actuals`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ hours: 0, cost: 0, by_month: {}, by_phase: {} });
  });

  it('aggregates hours and cost by month', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const { taskId } = await setupGraph(app, owner, { assigneeId: rid });
    for (const [date, h] of [['2026-03-10', 2], ['2026-03-20', 3], ['2026-04-05', 1]]) {
      await request(app).post(`/api/execution/tasks/${taskId}/time`)
        .set('Authorization', `Bearer ${owner.token}`).send({ date, hours: h });
    }
    const r = await request(app).get(`/api/execution/projects/exec-te-p1/actuals`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.body.hours).toBe(6);
    expect(r.body.cost).toBe(6 * 120);
    expect(r.body.by_month['2026-03']).toEqual({ hours: 5, cost: 5 * 120 });
    expect(r.body.by_month['2026-04']).toEqual({ hours: 1, cost: 1 * 120 });
  });

  it('attributes epic cost equal-split across linked phases', async () => {
    const owner = seedUser(EMAILS.owner);
    const rid = seedResource(owner.id);
    const { pid, epicId, taskId } = await setupGraph(app, owner, { assigneeId: rid });
    // Link the epic to two phases.
    db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)').run(epicId, 'phase-a');
    db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)').run(epicId, 'phase-b');
    await request(app).post(`/api/execution/tasks/${taskId}/time`)
      .set('Authorization', `Bearer ${owner.token}`).send({ date: '2026-04-10', hours: 10 });
    const r = await request(app).get(`/api/execution/projects/${pid}/actuals`)
      .set('Authorization', `Bearer ${owner.token}`);
    // 10h × 120 = 1200; split 50/50.
    expect(r.body.by_phase['phase-a'].cost).toBe(600);
    expect(r.body.by_phase['phase-b'].cost).toBe(600);
    expect(r.body.by_phase['phase-a'].hours).toBe(5);
  });

  it('epic-costs includes zero-cost epics', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id);
    seedRates(owner.id);
    await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'Orphan', status: 'To Do' });
    const r = await request(app).get(`/api/execution/projects/${pid}/epic-costs`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.body.length).toBe(1);
    expect(r.body[0].hours).toBe(0);
    expect(r.body[0].cost).toBe(0);
  });
});
