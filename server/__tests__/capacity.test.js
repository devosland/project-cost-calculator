import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, destroyTestDb, seedSchema, seedUser, seedProject } from './setup.js';

let db, dbPath;

beforeAll(() => {
  ({ db, dbPath } = createTestDb());
  seedSchema(db);
});

afterAll(() => {
  destroyTestDb(db, dbPath);
});

describe('resources table', () => {
  it('creates a resource with default max_capacity of 100', () => {
    const user = seedUser(db);
    const stmt = db.prepare(
      'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
    );
    const result = stmt.run(user.id, 'Alice', 'Developer', 'Senior');
    const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(result.lastInsertRowid);

    expect(resource.name).toBe('Alice');
    expect(resource.role).toBe('Developer');
    expect(resource.level).toBe('Senior');
    expect(resource.max_capacity).toBe(100);
    expect(resource.user_id).toBe(user.id);
    expect(resource.created_at).toBeTruthy();
    expect(resource.updated_at).toBeTruthy();
  });

  it('enforces UNIQUE(user_id, name)', () => {
    const user = seedUser(db, { email: 'unique1@test.com' });
    const stmt = db.prepare(
      'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
    );
    stmt.run(user.id, 'Bob', 'Designer', 'Junior');

    expect(() => {
      stmt.run(user.id, 'Bob', 'Designer', 'Junior');
    }).toThrow();
  });

  it('allows same resource name for different users', () => {
    const user1 = seedUser(db, { email: 'diffuser1@test.com' });
    const user2 = seedUser(db, { email: 'diffuser2@test.com' });
    const stmt = db.prepare(
      'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
    );

    expect(() => {
      stmt.run(user1.id, 'SharedName', 'Developer', 'Mid');
      stmt.run(user2.id, 'SharedName', 'Developer', 'Mid');
    }).not.toThrow();
  });
});

describe('resource_assignments table', () => {
  it('creates an assignment linked to resource and project', () => {
    const user = seedUser(db, { email: 'assign1@test.com' });
    const project = seedProject(db, user.id);
    const resource = db.prepare(
      'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
    ).run(user.id, 'AssignRes', 'Developer', 'Senior');

    const stmt = db.prepare(
      'INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(resource.lastInsertRowid, project.id, 'phase-1', 50, '2026-01', '2026-06');
    const assignment = db.prepare('SELECT * FROM resource_assignments WHERE id = ?').get(result.lastInsertRowid);

    expect(assignment.resource_id).toBe(Number(resource.lastInsertRowid));
    expect(assignment.project_id).toBe(project.id);
    expect(assignment.phase_id).toBe('phase-1');
    expect(assignment.allocation).toBe(50);
    expect(assignment.start_month).toBe('2026-01');
    expect(assignment.end_month).toBe('2026-06');
  });

  it('enforces UNIQUE(resource_id, project_id, phase_id)', () => {
    const user = seedUser(db, { email: 'assign2@test.com' });
    const project = seedProject(db, user.id);
    const resource = db.prepare(
      'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
    ).run(user.id, 'UniqueRes', 'Developer', 'Senior');

    const stmt = db.prepare(
      'INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)'
    );
    stmt.run(resource.lastInsertRowid, project.id, 'phase-1', 50, '2026-01', '2026-06');

    expect(() => {
      stmt.run(resource.lastInsertRowid, project.id, 'phase-1', 30, '2026-02', '2026-07');
    }).toThrow();
  });

  it('cascades on resource delete', () => {
    const user = seedUser(db, { email: 'cascade-res@test.com' });
    const project = seedProject(db, user.id);
    const resource = db.prepare(
      'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
    ).run(user.id, 'CascadeRes', 'Developer', 'Senior');

    db.prepare(
      'INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(resource.lastInsertRowid, project.id, 'phase-1', 50, '2026-01', '2026-06');

    // Delete the resource
    db.prepare('DELETE FROM resources WHERE id = ?').run(resource.lastInsertRowid);

    const assignments = db.prepare(
      'SELECT * FROM resource_assignments WHERE resource_id = ?'
    ).all(resource.lastInsertRowid);
    expect(assignments).toHaveLength(0);
  });

  it('cascades on project delete', () => {
    const user = seedUser(db, { email: 'cascade-proj@test.com' });
    const project = seedProject(db, user.id);
    const resource = db.prepare(
      'INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)'
    ).run(user.id, 'CascadeProjRes', 'Developer', 'Senior');

    db.prepare(
      'INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(resource.lastInsertRowid, project.id, 'phase-1', 50, '2026-01', '2026-06');

    // Delete the project
    db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);

    const assignments = db.prepare(
      'SELECT * FROM resource_assignments WHERE project_id = ?'
    ).all(project.id);
    expect(assignments).toHaveLength(0);
  });
});

describe('transition_plans table', () => {
  it('creates a plan with JSON data and default status draft', () => {
    const user = seedUser(db, { email: 'plan1@test.com' });
    const planData = JSON.stringify({ phases: [{ name: 'Phase 1' }] });

    const result = db.prepare(
      'INSERT INTO transition_plans (user_id, name, data) VALUES (?, ?, ?)'
    ).run(user.id, 'My Plan', planData);

    const plan = db.prepare('SELECT * FROM transition_plans WHERE id = ?').get(result.lastInsertRowid);

    expect(plan.user_id).toBe(user.id);
    expect(plan.name).toBe('My Plan');
    expect(plan.status).toBe('draft');
    expect(JSON.parse(plan.data)).toEqual({ phases: [{ name: 'Phase 1' }] });
    expect(plan.created_at).toBeTruthy();
    expect(plan.updated_at).toBeTruthy();
  });

  it('uses default empty JSON object for data when not provided', () => {
    const user = seedUser(db, { email: 'plan2@test.com' });

    const result = db.prepare(
      'INSERT INTO transition_plans (user_id, name) VALUES (?, ?)'
    ).run(user.id, 'Empty Plan');

    const plan = db.prepare('SELECT * FROM transition_plans WHERE id = ?').get(result.lastInsertRowid);
    expect(plan.data).toBe('{}');
  });
});
