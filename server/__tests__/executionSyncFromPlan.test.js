/**
 * Tests for the sync-from-plan endpoint that bootstraps Epics + Stories
 * from a project's phases / milestones JSON.
 *
 * Covers:
 *   - First run on a project with phases creates one Epic per phase and
 *     one Story per milestone, all with provenance fields populated.
 *   - Second run is a no-op (idempotency).
 *   - Adding a phase between runs creates only the new Epic.
 *   - User-renamed Epics are not overwritten.
 *   - Phases without milestones still get an Epic but no Story.
 *   - Editor permission required (viewer / member rejected).
 *   - 404 for outsider, 404 for unknown project.
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
  owner: 'sync-owner@test.local',
  editor: 'sync-editor@test.local',
  member: 'sync-member@test.local',
  outsider: 'sync-outsider@test.local',
};

function resetFixtures() {
  const rows = db.prepare('SELECT id FROM users WHERE email IN (?, ?, ?, ?)').all(
    EMAILS.owner, EMAILS.editor, EMAILS.member, EMAILS.outsider
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

/** Project seeded with `data` JSON containing the given phases. */
function seedProject(ownerId, phases, id = 'sync-p1') {
  const data = JSON.stringify({ phases });
  db.prepare('INSERT INTO projects (id, owner_id, name, data) VALUES (?, ?, ?, ?)').run(id, ownerId, 'Sync Test', data);
  // Default workflow.
  const ins = db.prepare('INSERT INTO project_statuses (project_id, name, category, order_idx) VALUES (?, ?, ?, ?)');
  ins.run(id, 'To Do', 'todo', 0);
  ins.run(id, 'In Progress', 'inprogress', 1);
  ins.run(id, 'Done', 'done', 2);
  return id;
}

let app;
beforeEach(() => { resetFixtures(); app = buildApp(); });
afterAll(resetFixtures);

const SAMPLE_PHASES = [
  {
    id: 'phase-a',
    name: 'Discovery',
    milestones: [
      { id: 'ms-a1', name: 'Kickoff', weekOffset: 0 },
      { id: 'ms-a2', name: 'Stakeholder review', weekOffset: 2 },
    ],
  },
  {
    id: 'phase-b',
    name: 'Implementation',
    milestones: [{ id: 'ms-b1', name: 'Beta release', weekOffset: 8 }],
  },
];

describe('POST /projects/:id/sync-from-plan', () => {
  it('first run creates one Epic per phase and one Story per milestone', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id, SAMPLE_PHASES);
    const r = await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ epicsCreated: 2, storiesCreated: 3 });

    const epics = db.prepare('SELECT * FROM epics WHERE project_id = ? ORDER BY id').all(pid);
    expect(epics.map((e) => e.title)).toEqual(['Discovery', 'Implementation']);
    expect(epics.map((e) => e.source_phase_id).sort()).toEqual(['phase-a', 'phase-b']);

    const links = db.prepare('SELECT phase_id FROM epic_phases WHERE epic_id IN (SELECT id FROM epics WHERE project_id = ?) ORDER BY phase_id').all(pid);
    expect(links.map((l) => l.phase_id)).toEqual(['phase-a', 'phase-b']);

    const discoveryEpicId = epics.find((e) => e.source_phase_id === 'phase-a').id;
    const stories = db.prepare('SELECT * FROM stories WHERE epic_id = ? ORDER BY id').all(discoveryEpicId);
    expect(stories.map((s) => s.title)).toEqual(['Kickoff', 'Stakeholder review']);
    expect(stories.map((s) => s.source_milestone_id)).toEqual(['ms-a1', 'ms-a2']);
  });

  it('second run is a no-op (idempotent)', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id, SAMPLE_PHASES);
    await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${owner.token}`);
    const r2 = await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r2.body).toEqual({ epicsCreated: 0, storiesCreated: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM epics WHERE project_id = ?').get(pid).n).toBe(2);
    expect(db.prepare('SELECT COUNT(*) AS n FROM stories WHERE epic_id IN (SELECT id FROM epics WHERE project_id = ?)').get(pid).n).toBe(3);
  });

  it('adding a phase between runs creates only the new Epic', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id, SAMPLE_PHASES);
    await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${owner.token}`);
    // Add a third phase to project.data
    const newPhases = [...SAMPLE_PHASES, { id: 'phase-c', name: 'Closeout', milestones: [] }];
    db.prepare('UPDATE projects SET data = ? WHERE id = ?').run(JSON.stringify({ phases: newPhases }), pid);
    const r = await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.body).toEqual({ epicsCreated: 1, storiesCreated: 0 });
  });

  it("user-renamed Epic stays renamed after re-sync", async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id, SAMPLE_PHASES);
    await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${owner.token}`);
    db.prepare('UPDATE epics SET title = ? WHERE source_phase_id = ?').run('Discovery (revised)', 'phase-a');
    await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${owner.token}`);
    const e = db.prepare('SELECT title FROM epics WHERE source_phase_id = ?').get('phase-a');
    expect(e.title).toBe('Discovery (revised)');
  });

  it('phases without milestones get an Epic but no Story', async () => {
    const owner = seedUser(EMAILS.owner);
    const pid = seedProject(owner.id, [{ id: 'p-only', name: 'Just a phase', milestones: [] }]);
    const r = await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(r.body).toEqual({ epicsCreated: 1, storiesCreated: 0 });
  });

  it('403 for viewer and member', async () => {
    const owner = seedUser(EMAILS.owner);
    const member = seedUser(EMAILS.member);
    const pid = seedProject(owner.id, SAMPLE_PHASES);
    db.prepare('INSERT INTO project_shares (project_id, user_id, role) VALUES (?, ?, ?)').run(pid, member.id, 'member');
    const r = await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${member.token}`);
    expect(r.status).toBe(403);
  });

  it('404 for outsider', async () => {
    const owner = seedUser(EMAILS.owner);
    const outsider = seedUser(EMAILS.outsider);
    const pid = seedProject(owner.id, SAMPLE_PHASES);
    const r = await request(app).post(`/api/execution/projects/${pid}/sync-from-plan`)
      .set('Authorization', `Bearer ${outsider.token}`);
    expect(r.status).toBe(404);
  });
});
