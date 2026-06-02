/**
 * Cost-rollup queries for the execution module. Spec §4.
 *
 * Every query starts at `time_entries` and walks up Task → Story → Epic →
 * Project. The `(resource_id, date)` and FK indexes added in PR 1 make these
 * joins cheap even at 10 000+ entries.
 *
 * Phase-level attribution uses the equal-split default: when an epic is
 * linked to N phases, each phase gets 1/N of the epic's cost. A follow-up
 * can add a `weight` column on `epic_phases` for weighted splits without
 * touching this file's API.
 *
 * Rate is always the SNAPSHOTTED `te.rate_hourly` — never a live lookup.
 * That is why the IPC May rate bump does not retroactively inflate April's
 * Réels column.
 */
import { db } from '../db.js';

/**
 * Aggregate actuals for a whole project. Returns totals plus two maps:
 *   by_month — keyed on 'YYYY-MM', values { hours, cost }
 *   by_phase — keyed on the phase_id string, values { hours, cost }
 *
 * Missing phases are simply absent from the map (not zero entries). The
 * BudgetTracker / Excel export callers are responsible for providing zeros
 * for months / phases that have no logged time.
 *
 * @param {string} projectId
 */
export function getProjectActuals(projectId) {
  const total = db.prepare(`
    SELECT COALESCE(SUM(te.hours), 0) AS hours,
           COALESCE(SUM(te.hours * te.rate_hourly), 0) AS cost
    FROM time_entries te
    JOIN tasks   t ON t.id = te.task_id
    JOIN stories s ON s.id = t.story_id
    JOIN epics   e ON e.id = s.epic_id
    WHERE e.project_id = ?
  `).get(projectId);

  const byMonthRows = db.prepare(`
    SELECT substr(te.date, 1, 7) AS month,
           SUM(te.hours) AS hours,
           SUM(te.hours * te.rate_hourly) AS cost
    FROM time_entries te
    JOIN tasks   t ON t.id = te.task_id
    JOIN stories s ON s.id = t.story_id
    JOIN epics   e ON e.id = s.epic_id
    WHERE e.project_id = ?
    GROUP BY month
    ORDER BY month
  `).all(projectId);

  const byPhaseRows = db.prepare(`
    WITH epic_costs AS (
      SELECT e.id AS epic_id,
             SUM(te.hours) AS hours,
             SUM(te.hours * te.rate_hourly) AS cost
      FROM epics e
      JOIN stories s ON s.epic_id = e.id
      JOIN tasks   t ON t.story_id = s.id
      JOIN time_entries te ON te.task_id = t.id
      WHERE e.project_id = ?
      GROUP BY e.id
    ),
    phase_count AS (
      SELECT epic_id, COUNT(*) AS n FROM epic_phases GROUP BY epic_id
    )
    SELECT ep.phase_id,
           SUM(ec.hours / COALESCE(pc.n, 1)) AS hours,
           SUM(ec.cost  / COALESCE(pc.n, 1)) AS cost
    FROM epic_phases ep
    JOIN epic_costs ec ON ec.epic_id = ep.epic_id
    LEFT JOIN phase_count pc ON pc.epic_id = ep.epic_id
    GROUP BY ep.phase_id
  `).all(projectId);

  return {
    hours: total.hours,
    cost: total.cost,
    by_month: Object.fromEntries(byMonthRows.map((r) => [r.month, { hours: r.hours, cost: r.cost }])),
    by_phase: Object.fromEntries(byPhaseRows.map((r) => [r.phase_id, { hours: r.hours, cost: r.cost }])),
  };
}

/**
 * Avancement agrégé d'un projet, dérivé des statuts Kanban (règle 0/50/100 :
 * done=1, inprogress=0.5, todo=0), pondéré par estimate_hours, avec le même
 * split epic→phases que getProjectActuals (epic lié à N phases ⇒ split égal).
 *
 * Retourne des AGRÉGATS bruts par phase ; le pourcentage final (avec repli sur
 * le nombre de tâches si aucune estimation) est calculé côté client par
 * evmCalculations.phaseProgressPct.
 *
 * @param {string} projectId
 * @returns {{ by_phase: Object<string,{earned:number,est:number,taskCount:number,earnedCount:number}> }}
 */
export function getProjectProgress(projectId) {
  const rows = db.prepare(`
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
  `).all(projectId);

  return {
    by_phase: Object.fromEntries(
      rows.map((r) => [
        r.phase_id,
        { earned: r.earned, est: r.est, taskCount: r.task_count, earnedCount: r.earned_count },
      ])
    ),
  };
}

/**
 * Per-epic rollup used by the Board and Dashboard widgets. Epics with zero
 * logged time are included (hours=0, cost=0) so the list matches exactly
 * what the epics list endpoint returns.
 *
 * @param {string} projectId
 */
export function getEpicCosts(projectId) {
  return db.prepare(`
    SELECT e.id        AS epic_id,
           e.key,
           e.title,
           e.status,
           COALESCE(SUM(te.hours), 0)                   AS hours,
           COALESCE(SUM(te.hours * te.rate_hourly), 0)  AS cost
    FROM   epics e
    LEFT JOIN stories      s  ON s.epic_id  = e.id
    LEFT JOIN tasks        t  ON t.story_id = s.id
    LEFT JOIN time_entries te ON te.task_id = t.id
    WHERE  e.project_id = ?
    GROUP  BY e.id
    ORDER  BY e.id
  `).all(projectId);
}
