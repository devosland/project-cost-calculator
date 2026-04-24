/**
 * Schema-level tests for PR 1 of the execution module. These tests exercise
 * the DDL directly against a fresh SQLite instance seeded via seedSchema:
 * table existence, foreign-key cascades, unique constraints, check
 * constraints, and the new linked_user_id column on resources.
 *
 * Each test creates the minimal prerequisite rows (user, project, etc.) and
 * asserts that SQLite enforces the rule we designed. If any CREATE TABLE in
 * server/db.js or server/__tests__/setup.js drifts apart, one of these will
 * fail — that's by design (setup.js is a mirror of production DDL).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, destroyTestDb, seedSchema, seedUser, seedProject } from './setup.js';

let db, dbPath;

beforeEach(() => {
  ({ db, dbPath } = createTestDb());
  seedSchema(db);
});

afterEach(() => {
  destroyTestDb(db, dbPath);
});

/** Helper: list all user tables in the current DB. */
function listTables() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
}

/** Helper: insert a resource tied to `user`. */
function seedResource(user, overrides = {}) {
  const { name = 'Alice', role = 'Developer', level = 'Senior' } = overrides;
  const res = db.prepare(
    'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
  ).run(user.id, name, role, level);
  return { id: Number(res.lastInsertRowid), user_id: user.id, name, role, level };
}

/** Helper: insert an epic with a default status of 'To Do'. */
function seedEpic(project, overrides = {}) {
  const { key = 'E1', title = 'Epic 1', status = 'To Do' } = overrides;
  const res = db.prepare(
    'INSERT INTO epics (project_id, key, title, status) VALUES (?, ?, ?, ?)'
  ).run(project.id, key, title, status);
  return { id: Number(res.lastInsertRowid), project_id: project.id, key, title, status };
}

function seedStory(epic, overrides = {}) {
  const { key = 'S1', title = 'Story 1', status = 'To Do' } = overrides;
  const res = db.prepare(
    'INSERT INTO stories (epic_id, key, title, status) VALUES (?, ?, ?, ?)'
  ).run(epic.id, key, title, status);
  return { id: Number(res.lastInsertRowid), epic_id: epic.id, key, title, status };
}

function seedTask(story, overrides = {}) {
  const { key = 'T1', title = 'Task 1', status = 'To Do', assigneeId = null } = overrides;
  const res = db.prepare(
    'INSERT INTO tasks (story_id, key, title, status, assignee_id) VALUES (?, ?, ?, ?, ?)'
  ).run(story.id, key, title, status, assigneeId);
  return { id: Number(res.lastInsertRowid), story_id: story.id, key, title, status, assignee_id: assigneeId };
}

describe('execution schema — table existence', () => {
  it('creates every new table', () => {
    const tables = listTables();
    [
      'project_key_counters',
      'project_statuses',
      'project_transitions',
      'epics',
      'epic_phases',
      'stories',
      'tasks',
      'time_entries',
      'active_timers',
      'project_closed_periods',
    ].forEach((t) => expect(tables, `missing table ${t}`).toContain(t));
  });
});

describe('resources.linked_user_id', () => {
  it('accepts null on insert (most consultants never get linked)', () => {
    const user = seedUser(db);
    const r = seedResource(user);
    const row = db.prepare('SELECT linked_user_id FROM resources WHERE id = ?').get(r.id);
    expect(row.linked_user_id).toBeNull();
  });

  it('accepts a user id and can be looked up', () => {
    const owner = seedUser(db, { email: 'owner@test' });
    const dev = seedUser(db, { email: 'dev@test' });
    const res = db.prepare(
      'INSERT INTO resources (user_id, name, role, level, linked_user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(owner.id, 'Bob', 'Dev', 'Senior', dev.id);
    const row = db.prepare('SELECT linked_user_id FROM resources WHERE id = ?').get(Number(res.lastInsertRowid));
    expect(row.linked_user_id).toBe(dev.id);
  });

  it('sets linked_user_id to NULL when the linked user is deleted (ON DELETE SET NULL)', () => {
    const owner = seedUser(db, { email: 'owner@test' });
    const dev = seedUser(db, { email: 'dev@test' });
    const res = db.prepare(
      'INSERT INTO resources (user_id, name, role, level, linked_user_id) VALUES (?, ?, ?, ?, ?)'
    ).run(owner.id, 'Bob', 'Dev', 'Senior', dev.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(dev.id);
    const row = db.prepare('SELECT linked_user_id FROM resources WHERE id = ?').get(Number(res.lastInsertRowid));
    expect(row.linked_user_id).toBeNull();
  });
});

describe('project_statuses', () => {
  it('rejects an invalid category', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    expect(() => db.prepare(
      'INSERT INTO project_statuses (project_id, name, category, order_idx) VALUES (?, ?, ?, ?)'
    ).run(project.id, 'Weird', 'unknown', 0)).toThrow(/CHECK/i);
  });

  it('enforces UNIQUE(project_id, name)', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const stmt = db.prepare(
      'INSERT INTO project_statuses (project_id, name, category, order_idx) VALUES (?, ?, ?, ?)'
    );
    stmt.run(project.id, 'To Do', 'todo', 0);
    expect(() => stmt.run(project.id, 'To Do', 'todo', 1)).toThrow(/UNIQUE/i);
  });

  it('cascades on project delete', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    db.prepare('INSERT INTO project_statuses (project_id, name, category, order_idx) VALUES (?, ?, ?, ?)')
      .run(project.id, 'To Do', 'todo', 0);
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
    const count = db.prepare('SELECT COUNT(*) AS n FROM project_statuses').get().n;
    expect(count).toBe(0);
  });
});

describe('epics → stories → tasks → time_entries cascade chain', () => {
  it('deletes the entire subtree when the project is deleted', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const resource = seedResource(user);
    const epic = seedEpic(project);
    const story = seedStory(epic);
    const task = seedTask(story, { assigneeId: resource.id });
    db.prepare(
      'INSERT INTO time_entries (task_id, resource_id, date, hours, rate_hourly) VALUES (?, ?, ?, ?, ?)'
    ).run(task.id, resource.id, '2026-04-15', 2.5, 120);

    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);

    expect(db.prepare('SELECT COUNT(*) AS n FROM epics').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM stories').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM tasks').get().n).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM time_entries').get().n).toBe(0);
  });

  it('UNIQUE(project_id, key) on epics — same key is fine across projects, blocked in one', () => {
    const user = seedUser(db);
    const p1 = seedProject(db, user.id, { id: 'p1' });
    const p2 = seedProject(db, user.id, { id: 'p2' });
    seedEpic(p1, { key: 'E1' });
    // Same key in another project — allowed.
    expect(() => seedEpic(p2, { key: 'E1' })).not.toThrow();
    // Same key in the same project — rejected.
    expect(() => seedEpic(p1, { key: 'E1' })).toThrow(/UNIQUE/i);
  });
});

describe('tasks.assignee_id', () => {
  it('allows NULL (backlog tasks without an assignee — Decision 7)', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const epic = seedEpic(project);
    const story = seedStory(epic);
    expect(() => seedTask(story, { assigneeId: null })).not.toThrow();
  });

  it('nullifies assignee_id when the resource is deleted (ON DELETE SET NULL)', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const resource = seedResource(user);
    const epic = seedEpic(project);
    const story = seedStory(epic);
    const task = seedTask(story, { assigneeId: resource.id });
    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id);
    const row = db.prepare('SELECT assignee_id FROM tasks WHERE id = ?').get(task.id);
    expect(row.assignee_id).toBeNull();
  });
});

describe('time_entries', () => {
  function seedBaseGraph() {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const resource = seedResource(user);
    const epic = seedEpic(project);
    const story = seedStory(epic);
    const task = seedTask(story, { assigneeId: resource.id });
    return { user, project, resource, task };
  }

  it('rejects hours <= 0', () => {
    const { task, resource } = seedBaseGraph();
    expect(() => db.prepare(
      'INSERT INTO time_entries (task_id, resource_id, date, hours, rate_hourly) VALUES (?, ?, ?, ?, ?)'
    ).run(task.id, resource.id, '2026-04-15', 0, 120)).toThrow(/CHECK/i);
  });

  it('rejects hours > 24', () => {
    const { task, resource } = seedBaseGraph();
    expect(() => db.prepare(
      'INSERT INTO time_entries (task_id, resource_id, date, hours, rate_hourly) VALUES (?, ?, ?, ?, ?)'
    ).run(task.id, resource.id, '2026-04-15', 24.5, 120)).toThrow(/CHECK/i);
  });

  it('rejects an unknown source value', () => {
    const { task, resource } = seedBaseGraph();
    expect(() => db.prepare(
      'INSERT INTO time_entries (task_id, resource_id, date, hours, rate_hourly, source) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(task.id, resource.id, '2026-04-15', 2.5, 120, 'imported')).toThrow(/CHECK/i);
  });

  it("defaults source to 'manual'", () => {
    const { task, resource } = seedBaseGraph();
    const r = db.prepare(
      'INSERT INTO time_entries (task_id, resource_id, date, hours, rate_hourly) VALUES (?, ?, ?, ?, ?)'
    ).run(task.id, resource.id, '2026-04-15', 2.5, 120);
    const row = db.prepare('SELECT source FROM time_entries WHERE id = ?').get(Number(r.lastInsertRowid));
    expect(row.source).toBe('manual');
  });
});

describe('active_timers', () => {
  it('enforces one timer per user (PRIMARY KEY on user_id)', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const epic = seedEpic(project);
    const story = seedStory(epic);
    const t1 = seedTask(story, { key: 'T1' });
    const t2 = seedTask(story, { key: 'T2' });
    const stmt = db.prepare('INSERT INTO active_timers (user_id, task_id, started_at) VALUES (?, ?, ?)');
    stmt.run(user.id, t1.id, '2026-04-22T10:00:00Z');
    expect(() => stmt.run(user.id, t2.id, '2026-04-22T11:00:00Z')).toThrow(/UNIQUE|PRIMARY/i);
  });
});

describe('project_closed_periods', () => {
  it('is unique per (project, period)', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const stmt = db.prepare(
      'INSERT INTO project_closed_periods (project_id, period, closed_at, closed_by_user) VALUES (?, ?, ?, ?)'
    );
    stmt.run(project.id, '2026-04', '2026-05-01T00:00:00Z', user.id);
    expect(() => stmt.run(project.id, '2026-04', '2026-05-02T00:00:00Z', user.id)).toThrow(/UNIQUE|PRIMARY/i);
  });

  it('cascades on project delete — no orphaned period locks', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    db.prepare(
      'INSERT INTO project_closed_periods (project_id, period, closed_at, closed_by_user) VALUES (?, ?, ?, ?)'
    ).run(project.id, '2026-04', '2026-05-01T00:00:00Z', user.id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM project_closed_periods').get().n).toBe(0);
  });
});

describe('project_key_counters', () => {
  it('rejects an unknown entity_type', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    expect(() => db.prepare(
      'INSERT INTO project_key_counters (project_id, entity_type, last_key) VALUES (?, ?, ?)'
    ).run(project.id, 'sprint', 0)).toThrow(/CHECK/i);
  });

  it('allows one row per (project, entity_type)', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const stmt = db.prepare(
      'INSERT INTO project_key_counters (project_id, entity_type, last_key) VALUES (?, ?, ?)'
    );
    stmt.run(project.id, 'epic', 0);
    stmt.run(project.id, 'story', 0);
    stmt.run(project.id, 'task', 0);
    expect(() => stmt.run(project.id, 'epic', 1)).toThrow(/UNIQUE|PRIMARY/i);
  });
});

describe('epic_phases N:N', () => {
  it('links an epic to multiple phases', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const epic = seedEpic(project);
    const stmt = db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)');
    stmt.run(epic.id, 'phase-a');
    stmt.run(epic.id, 'phase-b');
    const rows = db.prepare('SELECT phase_id FROM epic_phases WHERE epic_id = ?').all(epic.id);
    expect(rows.map((r) => r.phase_id).sort()).toEqual(['phase-a', 'phase-b']);
  });

  it('prevents duplicate (epic, phase) pairs', () => {
    const user = seedUser(db);
    const project = seedProject(db, user.id);
    const epic = seedEpic(project);
    const stmt = db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)');
    stmt.run(epic.id, 'phase-a');
    expect(() => stmt.run(epic.id, 'phase-a')).toThrow(/UNIQUE|PRIMARY/i);
  });
});
