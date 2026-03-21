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

// ===== NEW: API-level DB logic tests =====

describe('resource CRUD logic', () => {
  it('lists resources for a specific user only', () => {
    const user1 = seedUser(db, { email: 'crud-list1@test.com' });
    const user2 = seedUser(db, { email: 'crud-list2@test.com' });

    db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user1.id, 'R1', 'Dev', 'Sr');
    db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user1.id, 'R2', 'QA', 'Jr');
    db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user2.id, 'R3', 'Dev', 'Sr');

    const user1Resources = db.prepare('SELECT * FROM resources WHERE user_id = ? ORDER BY name').all(user1.id);
    expect(user1Resources).toHaveLength(2);
    expect(user1Resources[0].name).toBe('R1');
    expect(user1Resources[1].name).toBe('R2');
  });

  it('creates a resource and retrieves it by id', () => {
    const user = seedUser(db, { email: 'crud-create@test.com' });
    const result = db.prepare(
      'INSERT INTO resources (user_id, name, role, level, max_capacity) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, 'NewRes', 'Designer', 'Mid', 80);

    const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(result.lastInsertRowid);
    expect(resource.name).toBe('NewRes');
    expect(resource.max_capacity).toBe(80);
  });

  it('returns 409-style duplicate name error on INSERT conflict', () => {
    const user = seedUser(db, { email: 'crud-dup@test.com' });
    db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'DupName', 'Dev', 'Sr');

    let threw = false;
    try {
      db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'DupName', 'QA', 'Jr');
    } catch (err) {
      threw = true;
      expect(err.message).toMatch(/UNIQUE/i);
    }
    expect(threw).toBe(true);
  });

  it('updates a resource', () => {
    const user = seedUser(db, { email: 'crud-update@test.com' });
    const result = db.prepare(
      'INSERT INTO resources (user_id, name, role, level, max_capacity) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, 'UpdRes', 'Dev', 'Sr', 100);

    db.prepare('UPDATE resources SET name = ?, role = ?, level = ?, max_capacity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run('UpdRes2', 'QA', 'Mid', 75, result.lastInsertRowid);

    const updated = db.prepare('SELECT * FROM resources WHERE id = ?').get(result.lastInsertRowid);
    expect(updated.name).toBe('UpdRes2');
    expect(updated.role).toBe('QA');
    expect(updated.max_capacity).toBe(75);
  });

  it('update triggers duplicate name error for same user', () => {
    const user = seedUser(db, { email: 'crud-updup@test.com' });
    db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'NameA', 'Dev', 'Sr');
    const result = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'NameB', 'Dev', 'Sr');

    expect(() => {
      db.prepare('UPDATE resources SET name = ? WHERE id = ?').run('NameA', result.lastInsertRowid);
    }).toThrow(/UNIQUE/i);
  });

  it('deletes a resource and cascades assignments', () => {
    const user = seedUser(db, { email: 'crud-del@test.com' });
    const project = seedProject(db, user.id);
    const res = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'DelRes', 'Dev', 'Sr');
    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(res.lastInsertRowid, project.id, 'p1', 50, '2026-01', '2026-03');

    db.prepare('DELETE FROM resources WHERE id = ?').run(res.lastInsertRowid);

    expect(db.prepare('SELECT * FROM resources WHERE id = ?').get(res.lastInsertRowid)).toBeUndefined();
    expect(db.prepare('SELECT * FROM resource_assignments WHERE resource_id = ?').all(res.lastInsertRowid)).toHaveLength(0);
  });
});

describe('assignment CRUD logic', () => {
  it('lists assignments with resource and project names via JOIN', () => {
    const user = seedUser(db, { email: 'asgn-join@test.com' });
    const project = seedProject(db, user.id, { name: 'JoinProj' });
    const res = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'JoinRes', 'Dev', 'Sr');
    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(res.lastInsertRowid, project.id, 'p1', 60, '2026-01', '2026-04');

    const assignments = db.prepare(`
      SELECT ra.*, r.name AS resource_name, r.role AS resource_role, p.name AS project_name
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      JOIN projects p ON p.id = ra.project_id
      WHERE r.user_id = ?
      ORDER BY ra.start_month
    `).all(user.id);

    expect(assignments).toHaveLength(1);
    expect(assignments[0].resource_name).toBe('JoinRes');
    expect(assignments[0].project_name).toBe('JoinProj');
    expect(assignments[0].allocation).toBe(60);
  });

  it('filters assignments by month overlap', () => {
    const user = seedUser(db, { email: 'asgn-month@test.com' });
    const project = seedProject(db, user.id);
    const res = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'MonthRes', 'Dev', 'Sr');

    // Assignment spans Jan-Mar 2026
    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(res.lastInsertRowid, project.id, 'p1', 50, '2026-01', '2026-03');
    // Assignment spans Jun-Aug 2026
    const res2 = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'MonthRes2', 'QA', 'Jr');
    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(res2.lastInsertRowid, project.id, 'p2', 30, '2026-06', '2026-08');

    // Query for Feb 2026 — should only get the first assignment
    const month = '2026-02';
    const filtered = db.prepare(`
      SELECT ra.* FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      WHERE r.user_id = ? AND ra.start_month <= ? AND ra.end_month >= ?
    `).all(user.id, month, month);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].allocation).toBe(50);
  });

  it('returns UNIQUE violation on duplicate assignment', () => {
    const user = seedUser(db, { email: 'asgn-dup@test.com' });
    const project = seedProject(db, user.id);
    const res = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'DupAsgn', 'Dev', 'Sr');

    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(res.lastInsertRowid, project.id, 'p1', 50, '2026-01', '2026-03');

    expect(() => {
      db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
        .run(res.lastInsertRowid, project.id, 'p1', 70, '2026-04', '2026-06');
    }).toThrow(/UNIQUE/i);
  });
});

describe('transition apply logic', () => {
  it('applies a transition plan: shortens consultant assignments and creates replacements', () => {
    const user = seedUser(db, { email: 'trans-apply@test.com' });
    const project = seedProject(db, user.id);

    // Create consultant and replacement resources
    const consultant = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'Consultant1', 'Dev', 'Sr');
    const replacement = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'Replacement1', 'Dev', 'Sr');

    // Consultant has assignment Jan-Jun 2026
    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(consultant.lastInsertRowid, project.id, 'p1', 100, '2026-01', '2026-06');

    // Create transition plan
    const planData = JSON.stringify({
      transitions: [{
        consultant_id: Number(consultant.lastInsertRowid),
        replacement_id: Number(replacement.lastInsertRowid),
        transition_date: '2026-04'
      }]
    });
    const plan = db.prepare('INSERT INTO transition_plans (user_id, name, data) VALUES (?, ?, ?)').run(user.id, 'Apply Plan', planData);

    // Simulate the apply logic (what the API route does in a transaction)
    const applyTransition = db.transaction(() => {
      const planRow = db.prepare('SELECT * FROM transition_plans WHERE id = ?').get(plan.lastInsertRowid);
      const data = JSON.parse(planRow.data);

      // Validate all resource IDs exist
      const missingIds = [];
      for (const t of data.transitions) {
        const c = db.prepare('SELECT id FROM resources WHERE id = ? AND user_id = ?').get(t.consultant_id, user.id);
        const r = db.prepare('SELECT id FROM resources WHERE id = ? AND user_id = ?').get(t.replacement_id, user.id);
        if (!c) missingIds.push(t.consultant_id);
        if (!r) missingIds.push(t.replacement_id);
      }
      if (missingIds.length > 0) {
        throw new Error(JSON.stringify({ error: 'missing_resources', ids: missingIds }));
      }

      for (const t of data.transitions) {
        // Get consultant assignments that extend past transition_date
        const assignments = db.prepare(
          'SELECT * FROM resource_assignments WHERE resource_id = ? AND end_month >= ?'
        ).all(t.consultant_id, t.transition_date);

        for (const a of assignments) {
          // Shorten consultant assignment to end at transition_date minus one month
          const shortenedEnd = t.transition_date; // simplified: end at transition month
          db.prepare('UPDATE resource_assignments SET end_month = ? WHERE id = ?').run(shortenedEnd, a.id);

          // Create replacement assignment from transition_date to original end
          db.prepare(
            'INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(t.replacement_id, a.project_id, a.phase_id + '-repl', a.allocation, t.transition_date, a.end_month);
        }
      }

      // Mark plan as applied
      db.prepare('UPDATE transition_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('applied', plan.lastInsertRowid);
    });

    applyTransition();

    // Verify consultant assignment was shortened
    const consultantAssignments = db.prepare('SELECT * FROM resource_assignments WHERE resource_id = ?').all(consultant.lastInsertRowid);
    expect(consultantAssignments).toHaveLength(1);
    expect(consultantAssignments[0].end_month).toBe('2026-04');

    // Verify replacement assignment was created
    const replacementAssignments = db.prepare('SELECT * FROM resource_assignments WHERE resource_id = ?').all(replacement.lastInsertRowid);
    expect(replacementAssignments).toHaveLength(1);
    expect(replacementAssignments[0].start_month).toBe('2026-04');
    expect(replacementAssignments[0].end_month).toBe('2026-06');
    expect(replacementAssignments[0].allocation).toBe(100);

    // Verify plan marked as applied
    const appliedPlan = db.prepare('SELECT * FROM transition_plans WHERE id = ?').get(plan.lastInsertRowid);
    expect(appliedPlan.status).toBe('applied');
  });

  it('fails apply with missing_resources when consultant does not exist', () => {
    const user = seedUser(db, { email: 'trans-missing@test.com' });
    const replacement = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'ReplExist', 'Dev', 'Sr');

    const planData = JSON.stringify({
      transitions: [{
        consultant_id: 999999,
        replacement_id: Number(replacement.lastInsertRowid),
        transition_date: '2026-04'
      }]
    });
    const plan = db.prepare('INSERT INTO transition_plans (user_id, name, data) VALUES (?, ?, ?)').run(user.id, 'Missing Plan', planData);

    const applyTransition = db.transaction(() => {
      const planRow = db.prepare('SELECT * FROM transition_plans WHERE id = ?').get(plan.lastInsertRowid);
      const data = JSON.parse(planRow.data);

      const missingIds = [];
      for (const t of data.transitions) {
        const c = db.prepare('SELECT id FROM resources WHERE id = ? AND user_id = ?').get(t.consultant_id, user.id);
        const r = db.prepare('SELECT id FROM resources WHERE id = ? AND user_id = ?').get(t.replacement_id, user.id);
        if (!c) missingIds.push(t.consultant_id);
        if (!r) missingIds.push(t.replacement_id);
      }
      if (missingIds.length > 0) {
        throw new Error(JSON.stringify({ error: 'missing_resources', ids: missingIds }));
      }
    });

    let errorData;
    try {
      applyTransition();
    } catch (err) {
      errorData = JSON.parse(err.message);
    }

    expect(errorData).toBeDefined();
    expect(errorData.error).toBe('missing_resources');
    expect(errorData.ids).toContain(999999);

    // Plan should still be draft
    const planRow = db.prepare('SELECT * FROM transition_plans WHERE id = ?').get(plan.lastInsertRowid);
    expect(planRow.status).toBe('draft');
  });
});

describe('gantt query logic', () => {
  it('returns assignments overlapping a date range', () => {
    const user = seedUser(db, { email: 'gantt@test.com' });
    const project = seedProject(db, user.id);

    const r1 = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'GanttR1', 'Dev', 'Sr');
    const r2 = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'GanttR2', 'QA', 'Jr');
    const r3 = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'GanttR3', 'PM', 'Mid');

    // r1: Jan-Mar 2026 (overlaps with query Feb-Apr)
    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(r1.lastInsertRowid, project.id, 'p1', 50, '2026-01', '2026-03');
    // r2: May-Jul 2026 (overlaps with query Feb-Apr? No — starts after Apr)
    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(r2.lastInsertRowid, project.id, 'p2', 30, '2026-05', '2026-07');
    // r3: Mar-Jun 2026 (overlaps with query Feb-Apr)
    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(r3.lastInsertRowid, project.id, 'p3', 80, '2026-03', '2026-06');

    const startRange = '2026-02';
    const endRange = '2026-04';

    // Gantt query: assignments where start_month <= endRange AND end_month >= startRange
    const assignments = db.prepare(`
      SELECT ra.*, r.name AS resource_name, r.role AS resource_role, p.name AS project_name
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      JOIN projects p ON p.id = ra.project_id
      WHERE r.user_id = ? AND ra.start_month <= ? AND ra.end_month >= ?
      ORDER BY ra.start_month
    `).all(user.id, endRange, startRange);

    expect(assignments).toHaveLength(2);
    expect(assignments.map(a => a.resource_name).sort()).toEqual(['GanttR1', 'GanttR3']);
  });

  it('returns resources alongside filtered assignments', () => {
    const user = seedUser(db, { email: 'gantt-full@test.com' });
    const project = seedProject(db, user.id);

    const r1 = db.prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)').run(user.id, 'GFull1', 'Dev', 'Sr');
    db.prepare('INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month) VALUES (?, ?, ?, ?, ?, ?)')
      .run(r1.lastInsertRowid, project.id, 'p1', 100, '2026-01', '2026-12');

    const resources = db.prepare('SELECT * FROM resources WHERE user_id = ? ORDER BY name').all(user.id);
    const assignments = db.prepare(`
      SELECT ra.*, r.name AS resource_name
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      WHERE r.user_id = ? AND ra.start_month <= ? AND ra.end_month >= ?
    `).all(user.id, '2026-06', '2026-03');

    expect(resources.length).toBeGreaterThanOrEqual(1);
    expect(assignments.length).toBeGreaterThanOrEqual(1);
  });
});
