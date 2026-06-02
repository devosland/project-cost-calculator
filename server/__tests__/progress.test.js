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

// The getProjectProgress rollup is bound to the server/db.js singleton; like the
// other server tests we validate the QUERY by running it as raw SQL on the test
// db. This SQL MUST stay identical to server/execution/rollups.js::getProjectProgress.
const PROGRESS_SQL = `
  WITH epic_progress AS (
    SELECT e.id AS epic_id,
           SUM(COALESCE(t.estimate_hours,0) * (CASE ps.category WHEN 'done' THEN 1.0 WHEN 'inprogress' THEN 0.5 ELSE 0 END)) AS earned,
           SUM(COALESCE(t.estimate_hours,0)) AS est,
           COUNT(t.id) AS task_count,
           SUM(CASE ps.category WHEN 'done' THEN 1.0 WHEN 'inprogress' THEN 0.5 ELSE 0 END) AS earned_count
    FROM epics e
    JOIN stories s ON s.epic_id = e.id
    JOIN tasks   t ON t.story_id = s.id
    JOIN project_statuses ps ON ps.project_id = e.project_id AND ps.name = t.status
    WHERE e.project_id = ?
    GROUP BY e.id
  ),
  phase_count AS (
    SELECT epic_id, COUNT(*) AS n FROM epic_phases GROUP BY epic_id
  )
  SELECT ep.phase_id AS phase_id,
         SUM(epr.earned / COALESCE(pc.n,1)) AS earned,
         SUM(epr.est / COALESCE(pc.n,1)) AS est,
         SUM(CAST(epr.task_count AS REAL) / COALESCE(pc.n,1)) AS task_count,
         SUM(epr.earned_count / COALESCE(pc.n,1)) AS earned_count
  FROM epic_phases ep
  JOIN epic_progress epr ON epr.epic_id = ep.epic_id
  LEFT JOIN phase_count pc ON pc.epic_id = ep.epic_id
  GROUP BY ep.phase_id
`;

function seedStatuses(db, projectId) {
  const stmt = db.prepare(
    'INSERT INTO project_statuses (project_id, name, category, order_idx) VALUES (?, ?, ?, ?)'
  );
  stmt.run(projectId, 'To Do', 'todo', 0);
  stmt.run(projectId, 'In Progress', 'inprogress', 1);
  stmt.run(projectId, 'Done', 'done', 2);
}

describe('project progress rollup (SQL)', () => {
  it('weights status by estimate_hours and splits epics across phases', () => {
    const user = seedUser(db, { email: 'evm@test.com' });
    const project = seedProject(db, user.id, { id: 'proj-evm' });
    seedStatuses(db, project.id);

    const epic = db
      .prepare('INSERT INTO epics (project_id, key, title, status, priority) VALUES (?, ?, ?, ?, ?)')
      .run(project.id, 'E-1', 'Epic 1', 'To Do', 'medium');
    const epicId = Number(epic.lastInsertRowid);
    db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)').run(epicId, 'pA');
    const story = db
      .prepare('INSERT INTO stories (epic_id, key, title, status, priority) VALUES (?, ?, ?, ?, ?)')
      .run(epicId, 'S-1', 'Story 1', 'To Do', 'medium');
    const storyId = Number(story.lastInsertRowid);
    const insTask = db.prepare(
      'INSERT INTO tasks (story_id, key, title, status, priority, estimate_hours) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insTask.run(storyId, 'T-1', 'Done task', 'Done', 'medium', 10);
    insTask.run(storyId, 'T-2', 'Todo task', 'To Do', 'medium', 10);

    const rows = db.prepare(PROGRESS_SQL).all(project.id);
    const byPhase = Object.fromEntries(rows.map((r) => [r.phase_id, r]));

    expect(byPhase.pA.earned).toBe(10);
    expect(byPhase.pA.est).toBe(20);
    expect(byPhase.pA.earned / byPhase.pA.est).toBe(0.5);
  });

  it('splits an epic linked to two phases equally', () => {
    const user = seedUser(db, { email: 'evm2@test.com' });
    const project = seedProject(db, user.id, { id: 'proj-evm2' });
    seedStatuses(db, project.id);

    const epic = db
      .prepare('INSERT INTO epics (project_id, key, title, status, priority) VALUES (?, ?, ?, ?, ?)')
      .run(project.id, 'E-1', 'Epic 1', 'To Do', 'medium');
    const epicId = Number(epic.lastInsertRowid);
    db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)').run(epicId, 'pA');
    db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)').run(epicId, 'pB');
    const story = db
      .prepare('INSERT INTO stories (epic_id, key, title, status, priority) VALUES (?, ?, ?, ?, ?)')
      .run(epicId, 'S-1', 'Story 1', 'To Do', 'medium');
    const storyId = Number(story.lastInsertRowid);
    db.prepare(
      'INSERT INTO tasks (story_id, key, title, status, priority, estimate_hours) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(storyId, 'T-1', 'Done task', 'Done', 'medium', 20);

    const rows = db.prepare(PROGRESS_SQL).all(project.id);
    const byPhase = Object.fromEntries(rows.map((r) => [r.phase_id, r]));

    expect(byPhase.pA.est).toBe(10);
    expect(byPhase.pB.est).toBe(10);
    expect(byPhase.pA.earned).toBe(10);
    expect(byPhase.pB.earned).toBe(10);
  });
});
