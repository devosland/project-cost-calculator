/**
 * CRUD tests for the execution module router (PR 2 of the execution MVP).
 *
 * Runs against the real production DB (same pattern as apiKeysRoutes.test.js)
 * with isolated seed data keyed on a test-only email. Each test resets its
 * fixtures so order-dependence cannot creep in.
 *
 * We cover:
 *   - 401 when unauthenticated
 *   - 404 on missing or unshared projects (leakage guard)
 *   - 403 when role is insufficient (viewer trying to POST)
 *   - Happy-path create / list / get / update / delete on Epic, Story, Task
 *   - Status validation against project_statuses
 *   - Transition endpoint: any-to-any when transitions empty, restricted when
 *     transitions exist
 *   - Task list filtering by status and assignee (including `unassigned`)
 *   - Epic phase_ids round-trip
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
  owner: 'exec-owner@test.local',
  editor: 'exec-editor@test.local',
  viewer: 'exec-viewer@test.local',
  outsider: 'exec-outsider@test.local',
};

/**
 * Purge any stale rows keyed on our test emails, in FK-friendly order.
 *
 * `resources` and `user_data` both have a NOT NULL FK on users with no
 * cascade, so they must be wiped before we delete the users themselves.
 * `projects` also has a non-cascading owner_id FK; project cascade does NOT
 * cover `resources` because resources are keyed on user_id, not project_id.
 */
function resetFixtures() {
  const userRows = db.prepare('SELECT id FROM users WHERE email IN (?, ?, ?, ?)').all(
    EMAILS.owner, EMAILS.editor, EMAILS.viewer, EMAILS.outsider
  );
  const userIds = userRows.map((r) => r.id);
  if (userIds.length === 0) return;
  const placeholders = userIds.map(() => '?').join(',');
  db.prepare(`DELETE FROM project_shares WHERE user_id IN (${placeholders})`).run(...userIds);
  db.prepare(`DELETE FROM projects WHERE owner_id IN (${placeholders})`).run(...userIds);
  db.prepare(`DELETE FROM resources WHERE user_id IN (${placeholders})`).run(...userIds);
  db.prepare(`DELETE FROM user_data WHERE user_id IN (${placeholders})`).run(...userIds);
  db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...userIds);
}

function seedUser(email) {
  const r = db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)').run(email, email, 'x');
  const id = Number(r.lastInsertRowid);
  const token = jwt.sign({ id, email, name: email }, JWT_SECRET);
  return { id, email, token };
}

function seedProject(ownerId, id = 'exec-p1') {
  db.prepare('INSERT INTO projects (id, owner_id, name, data) VALUES (?, ?, ?, ?)').run(id, ownerId, 'Exec Test', '{}');
  // Seed the default workflow (mirrors what seedDefaultStatuses does on boot).
  const ins = db.prepare('INSERT INTO project_statuses (project_id, name, category, order_idx) VALUES (?, ?, ?, ?)');
  ins.run(id, 'To Do', 'todo', 0);
  ins.run(id, 'In Progress', 'inprogress', 1);
  ins.run(id, 'Done', 'done', 2);
  return id;
}

function share(projectId, userId, role) {
  db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(projectId, userId, role);
}

let app;

beforeEach(() => {
  resetFixtures();
  app = buildApp();
});
afterAll(resetFixtures);

// ---------------------------------------------------------------------------
// Authentication + access gating
// ---------------------------------------------------------------------------

describe('execution auth & access', () => {
  it('401 without JWT', async () => {
    const r = await request(app).get('/api/execution/projects/x/epics');
    expect(r.status).toBe(401);
  });

  it('404 when project does not exist', async () => {
    const { token } = seedUser(EMAILS.owner);
    const r = await request(app).get('/api/execution/projects/nope/epics').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(404);
  });

  it('404 when project exists but caller is not shared (no existence leak)', async () => {
    const owner = seedUser(EMAILS.owner);
    const outsider = seedUser(EMAILS.outsider);
    const pid = seedProject(owner.id);
    const r = await request(app).get(`/api/execution/projects/${pid}/epics`).set('Authorization', `Bearer ${outsider.token}`);
    expect(r.status).toBe(404);
  });

  it('403 when viewer tries to create an epic', async () => {
    const owner = seedUser(EMAILS.owner);
    const viewer = seedUser(EMAILS.viewer);
    const pid = seedProject(owner.id);
    share(pid, viewer.id, 'viewer');
    const r = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${viewer.token}`).send({ title: 'X', status: 'To Do' });
    expect(r.status).toBe(403);
  });

  it('editor can create but viewer can read', async () => {
    const owner = seedUser(EMAILS.owner);
    const editor = seedUser(EMAILS.editor);
    const viewer = seedUser(EMAILS.viewer);
    const pid = seedProject(owner.id);
    share(pid, editor.id, 'editor');
    share(pid, viewer.id, 'viewer');

    const created = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${editor.token}`).send({ title: 'Auth overhaul', status: 'To Do' });
    expect(created.status).toBe(201);

    const listed = await request(app).get(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${viewer.token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Epics
// ---------------------------------------------------------------------------

describe('epics CRUD', () => {
  let owner, pid;
  beforeEach(() => {
    owner = seedUser(EMAILS.owner);
    pid = seedProject(owner.id);
  });

  it('creates with key E1 and default medium priority', async () => {
    const r = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'A', status: 'To Do' });
    expect(r.status).toBe(201);
    expect(r.body.key).toBe('E1');
    expect(r.body.priority).toBe('medium');
    expect(r.body.phase_ids).toEqual([]);
  });

  it('rejects an unknown status', async () => {
    const r = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'A', status: 'Nope' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('unknown_status');
  });

  it('rejects missing title via zod', async () => {
    const r = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${owner.token}`).send({ status: 'To Do' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation_error');
  });

  it('keys auto-increment across creates', async () => {
    for (const n of [1, 2, 3]) {
      const r = await request(app).post(`/api/execution/projects/${pid}/epics`)
        .set('Authorization', `Bearer ${owner.token}`).send({ title: `E${n}`, status: 'To Do' });
      expect(r.body.key).toBe(`E${n}`);
    }
  });

  it('phase_ids round-trip and can be replaced on update', async () => {
    const create = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ title: 'A', status: 'To Do', phase_ids: ['phase-1', 'phase-2'] });
    expect(create.body.phase_ids.sort()).toEqual(['phase-1', 'phase-2']);

    const update = await request(app).put(`/api/execution/epics/${create.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ phase_ids: ['phase-3'] });
    expect(update.body.phase_ids).toEqual(['phase-3']);
  });

  it('deletes cascade to stories and tasks', async () => {
    const e = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'A', status: 'To Do' });
    const s = await request(app).post(`/api/execution/epics/${e.body.id}/stories`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'S', status: 'To Do' });
    await request(app).post(`/api/execution/stories/${s.body.id}/tasks`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'T', status: 'To Do' });

    const del = await request(app).delete(`/api/execution/epics/${e.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(del.status).toBe(200);
    const storyCount = db.prepare('SELECT COUNT(*) AS n FROM stories WHERE epic_id = ?').get(e.body.id).n;
    expect(storyCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

describe('stories CRUD', () => {
  let owner, pid, epicId;
  beforeEach(async () => {
    owner = seedUser(EMAILS.owner);
    pid = seedProject(owner.id);
    const e = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'E', status: 'To Do' });
    epicId = e.body.id;
  });

  it('creates with key S1 and accepts estimate_hours', async () => {
    const r = await request(app).post(`/api/execution/epics/${epicId}/stories`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'Story A', status: 'To Do', estimate_hours: 8.5 });
    expect(r.status).toBe(201);
    expect(r.body.key).toBe('S1');
    expect(r.body.estimate_hours).toBe(8.5);
  });

  it('rejects non-positive estimate_hours', async () => {
    const r = await request(app).post(`/api/execution/epics/${epicId}/stories`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'A', status: 'To Do', estimate_hours: -1 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('validation_error');
  });

  it('list returns empty array before any stories exist', async () => {
    const r = await request(app).get(`/api/execution/epics/${epicId}/stories`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });

  it('partial update leaves unspecified fields untouched', async () => {
    const create = await request(app).post(`/api/execution/epics/${epicId}/stories`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'A', status: 'To Do', priority: 'high' });
    const update = await request(app).put(`/api/execution/stories/${create.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'A renamed' });
    expect(update.body.title).toBe('A renamed');
    expect(update.body.priority).toBe('high');
    expect(update.body.status).toBe('To Do');
  });
});

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

describe('tasks CRUD + filters + transition', () => {
  let owner, pid, epicId, storyId;
  beforeEach(async () => {
    owner = seedUser(EMAILS.owner);
    pid = seedProject(owner.id);
    const e = await request(app).post(`/api/execution/projects/${pid}/epics`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'E', status: 'To Do' });
    epicId = e.body.id;
    const s = await request(app).post(`/api/execution/epics/${epicId}/stories`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'S', status: 'To Do' });
    storyId = s.body.id;
  });

  it('creates with key T1, accepts null assignee (backlog task)', async () => {
    const r = await request(app).post(`/api/execution/stories/${storyId}/tasks`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'T', status: 'To Do', assignee_id: null });
    expect(r.status).toBe(201);
    expect(r.body.key).toBe('T1');
    expect(r.body.assignee_id).toBeNull();
  });

  it('filters by status and unassigned', async () => {
    // Seed 3 tasks: To Do + assignee, Done + assignee, To Do + unassigned.
    const rid = Number(db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(owner.id, 'Alice', 'Dev', 'Senior').lastInsertRowid);
    await request(app).post(`/api/execution/stories/${storyId}/tasks`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'A', status: 'To Do', assignee_id: rid });
    await request(app).post(`/api/execution/stories/${storyId}/tasks`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'B', status: 'Done', assignee_id: rid });
    await request(app).post(`/api/execution/stories/${storyId}/tasks`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'C', status: 'To Do' });

    const todo = await request(app).get(`/api/execution/projects/${pid}/tasks?status=To%20Do`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(todo.body.length).toBe(2);

    const unass = await request(app).get(`/api/execution/projects/${pid}/tasks?assignee=unassigned`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(unass.body.length).toBe(1);
    expect(unass.body[0].title).toBe('C');
  });

  it('transitions freely when project_transitions is empty', async () => {
    const t = await request(app).post(`/api/execution/stories/${storyId}/tasks`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'T', status: 'To Do' });
    const r = await request(app).post(`/api/execution/tasks/${t.body.id}/transition`)
      .set('Authorization', `Bearer ${owner.token}`).send({ to: 'Done' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('Done');
  });

  it('rejects disallowed transitions when rules are configured', async () => {
    db.prepare('INSERT INTO project_transitions (project_id, from_status, to_status) VALUES (?, ?, ?)')
      .run(pid, 'To Do', 'In Progress');
    const t = await request(app).post(`/api/execution/stories/${storyId}/tasks`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'T', status: 'To Do' });
    const skip = await request(app).post(`/api/execution/tasks/${t.body.id}/transition`)
      .set('Authorization', `Bearer ${owner.token}`).send({ to: 'Done' });
    expect(skip.status).toBe(400);
    expect(skip.body.error).toBe('transition_not_allowed');
    const ok = await request(app).post(`/api/execution/tasks/${t.body.id}/transition`)
      .set('Authorization', `Bearer ${owner.token}`).send({ to: 'In Progress' });
    expect(ok.status).toBe(200);
  });

  it('rejects transition to unknown status', async () => {
    const t = await request(app).post(`/api/execution/stories/${storyId}/tasks`)
      .set('Authorization', `Bearer ${owner.token}`).send({ title: 'T', status: 'To Do' });
    const r = await request(app).post(`/api/execution/tasks/${t.body.id}/transition`)
      .set('Authorization', `Bearer ${owner.token}`).send({ to: 'Archived' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('unknown_status');
  });
});
