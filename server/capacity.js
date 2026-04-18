/**
 * Express router for capacity management (/api/capacity/*).
 * Manages four resource-management concerns:
 *   - Resources   — the pool of people (consultants, permanents) with role/level/max_capacity
 *   - Assignments — links between a resource, a project phase, and a time window
 *   - Gantt       — aggregated view of resources + assignments for a date range
 *   - Transitions — plans for transitioning consultant roles to permanent headcount,
 *                   including impact preview and atomic application across all affected projects
 *
 * All routes require JWT authentication. Resource and assignment ownership is enforced
 * through user_id checks (resources) or JOIN-based ownership verification (assignments).
 */
import { Router } from 'express';
import { authMiddleware } from './middleware.js';
import {
  db,
  getResourcesByUser,
  getResourceById,
  createResource,
  updateResource,
  deleteResource,
  getAssignmentsByUser,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getTransitionPlansByUser,
  getTransitionPlanById,
  createTransitionPlan,
  updateTransitionPlan,
  deleteTransitionPlan
} from './db.js';

const router = Router();

router.use(authMiddleware);

// ===== Resources =====

/**
 * GET /api/capacity/resources
 * Lists all resources in the authenticated user's pool, ordered by name.
 * Returns: 200 [{ id, user_id, name, role, level, max_capacity, created_at, updated_at }]
 */
router.get('/resources', (req, res) => {
  try {
    const resources = getResourcesByUser(req.user.id);
    res.json(resources);
  } catch (err) {
    console.error('List resources error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/capacity/resources
 * Creates a new resource in the user's pool.
 * Body: { name: string, role: string, level: string, max_capacity?: number (default 100) }
 * Returns: 201 { id, user_id, name, role, level, max_capacity }
 * Errors: 400 missing required fields | 409 duplicate name (UNIQUE constraint)
 */
router.post('/resources', (req, res) => {
  try {
    const { name, role, level, max_capacity } = req.body;
    if (!name || !role || !level) {
      return res.status(400).json({ error: 'name, role, and level are required' });
    }
    const resource = createResource(req.user.id, name, role, level, max_capacity ?? 100);
    res.status(201).json(resource);
  } catch (err) {
    if (err.message && /UNIQUE/i.test(err.message)) {
      return res.status(409).json({ error: 'A resource with this name already exists' });
    }
    console.error('Create resource error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/capacity/resources/:id
 * Updates a resource. Ownership is verified before update.
 * All fields are optional — omitted fields retain their current values.
 * Body: { name?: string, role?: string, level?: string, max_capacity?: number }
 * Returns: 200 { id, user_id, name, role, level, max_capacity, ... }
 * Errors: 403 not owner | 409 duplicate name
 */
router.put('/resources/:id', (req, res) => {
  try {
    const resource = getResourceById(parseInt(req.params.id, 10));
    if (!resource || resource.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { name, role, level, max_capacity } = req.body;
    updateResource(
      resource.id,
      name ?? resource.name,
      role ?? resource.role,
      level ?? resource.level,
      max_capacity ?? resource.max_capacity
    );
    const updated = getResourceById(resource.id);
    res.json(updated);
  } catch (err) {
    if (err.message && /UNIQUE/i.test(err.message)) {
      return res.status(409).json({ error: 'A resource with this name already exists' });
    }
    console.error('Update resource error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/capacity/resources/:id
 * Deletes a resource. ON DELETE CASCADE removes all associated assignments.
 * Returns: 200 { success: true }
 * Errors: 403 not owner
 */
router.delete('/resources/:id', (req, res) => {
  try {
    const resource = getResourceById(parseInt(req.params.id, 10));
    if (!resource || resource.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    deleteResource(resource.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete resource error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Assignments =====

/**
 * GET /api/capacity/assignments
 * Lists resource assignments with optional filters. All filters are AND-combined.
 * Query params:
 *   month       — YYYY-MM, returns only assignments active in that month
 *   resource_id — filter by resource
 *   project_id  — filter by project
 * Returns: 200 [{ id, resource_id, project_id, phase_id, allocation, start_month, end_month,
 *                 resource_name, resource_role, project_name }]
 */
router.get('/assignments', (req, res) => {
  try {
    const { month, resource_id, project_id } = req.query;

    // Build query dynamically to support optional filters without multiple code paths.
    let sql = `
      SELECT ra.*, r.name AS resource_name, r.role AS resource_role, p.name AS project_name
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      JOIN projects p ON p.id = ra.project_id
      WHERE r.user_id = ?
    `;
    const params = [req.user.id];

    if (month) {
      // An assignment is "active" in month M when it starts on or before M and ends on or after M.
      sql += ' AND ra.start_month <= ? AND ra.end_month >= ?';
      params.push(month, month);
    }
    if (resource_id) {
      sql += ' AND ra.resource_id = ?';
      params.push(parseInt(resource_id, 10));
    }
    if (project_id) {
      sql += ' AND ra.project_id = ?';
      params.push(project_id);
    }

    sql += ' ORDER BY ra.start_month';

    const assignments = db.prepare(sql).all(...params);
    res.json(assignments);
  } catch (err) {
    console.error('List assignments error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/capacity/assignments
 * Creates an assignment linking a resource to a project phase for a time range.
 * Ownership of the resource is verified — users cannot assign other users' resources.
 * Body: { resource_id, project_id, phase_id, allocation, start_month (YYYY-MM), end_month (YYYY-MM) }
 * Returns: 201 { id, resource_id, project_id, phase_id, allocation, start_month, end_month }
 * Errors: 400 missing fields | 403 resource not owned | 409 duplicate resource/project/phase
 */
router.post('/assignments', (req, res) => {
  try {
    const { resource_id, project_id, phase_id, allocation, start_month, end_month } = req.body;
    if (!resource_id || !project_id || !phase_id || allocation == null || !start_month || !end_month) {
      return res.status(400).json({ error: 'resource_id, project_id, phase_id, allocation, start_month, and end_month are required' });
    }

    // Validate resource ownership — prevents a user from assigning a resource that belongs
    // to another user onto their own project.
    const resource = getResourceById(resource_id);
    if (!resource || resource.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const assignment = createAssignment(resource_id, project_id, phase_id, allocation, start_month, end_month);
    res.status(201).json(assignment);
  } catch (err) {
    if (err.message && /UNIQUE/i.test(err.message)) {
      return res.status(409).json({ error: 'Assignment already exists for this resource/project/phase combination' });
    }
    console.error('Create assignment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/capacity/assignments/:id
 * Updates an existing assignment's dates and/or allocation.
 * Ownership is verified by JOINing assignments → resources and checking user_id,
 * since resource_assignments has no direct user_id column.
 * Body: { allocation?: number, start_month?: string, end_month?: string }
 * Returns: 200 { ...assignment, resource_name, resource_role, project_name }
 * Errors: 403 not owner
 */
router.put('/assignments/:id', (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id, 10);

    // Verify ownership through JOIN — resource_assignments has no user_id,
    // so we must traverse to resources to confirm the caller owns the resource.
    const existing = db.prepare(`
      SELECT ra.*, r.user_id AS owner_id
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      WHERE ra.id = ?
    `).get(assignmentId);

    if (!existing || existing.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { allocation, start_month, end_month } = req.body;
    updateAssignment(
      assignmentId,
      allocation ?? existing.allocation,
      start_month ?? existing.start_month,
      end_month ?? existing.end_month
    );

    const updated = db.prepare(`
      SELECT ra.*, r.name AS resource_name, r.role AS resource_role, p.name AS project_name
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      JOIN projects p ON p.id = ra.project_id
      WHERE ra.id = ?
    `).get(assignmentId);

    res.json(updated);
  } catch (err) {
    console.error('Update assignment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/capacity/assignments/:id
 * Deletes an assignment. Ownership verified via JOIN as with PUT.
 * Returns: 200 { success: true }
 * Errors: 403 not owner
 */
router.delete('/assignments/:id', (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id, 10);

    // Verify ownership through JOIN
    const existing = db.prepare(`
      SELECT ra.*, r.user_id AS owner_id
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      WHERE ra.id = ?
    `).get(assignmentId);

    if (!existing || existing.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    deleteAssignment(assignmentId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete assignment error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Gantt =====

/**
 * GET /api/capacity/gantt?start=YYYY-MM&end=YYYY-MM
 * Returns resources and their assignments within a date range for Gantt rendering.
 * Both resources with no assignments in the range and assignments without resources
 * are included (outer semantics: resources list is unfiltered, assignments are windowed).
 * Query params: start (YYYY-MM), end (YYYY-MM) — both required
 * Returns: 200 { resources: [...], assignments: [...] }
 * Errors: 400 missing start or end
 */
router.get('/gantt', (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query parameters are required (YYYY-MM)' });
    }

    const resources = getResourcesByUser(req.user.id);

    const assignments = db.prepare(`
      SELECT ra.*, r.name AS resource_name, r.role AS resource_role, p.name AS project_name
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      JOIN projects p ON p.id = ra.project_id
      WHERE r.user_id = ? AND ra.start_month <= ? AND ra.end_month >= ?
      ORDER BY ra.start_month
    `).all(req.user.id, end, start);

    res.json({ resources, assignments });
  } catch (err) {
    console.error('Gantt query error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Transitions =====

/**
 * GET /api/capacity/transitions
 * Lists all transition plans for the authenticated user, ordered by last update.
 * Returns: 200 [{ id, user_id, name, status, data, created_at, updated_at }]
 */
router.get('/transitions', (req, res) => {
  try {
    const plans = getTransitionPlansByUser(req.user.id);
    res.json(plans);
  } catch (err) {
    console.error('List transitions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/capacity/transitions/:id
 * Fetches a single transition plan by id for the authenticated user.
 * Used by the Gantt what-if preview mode to load the selected draft plan.
 * Returns: 200 { id, user_id, name, status, data, created_at, updated_at }
 * Errors: 404 plan not found or not owned by user
 */
router.get('/transitions/:id', (req, res) => {
  try {
    const plan = getTransitionPlanById(parseInt(req.params.id, 10));
    if (!plan || plan.user_id !== req.user.id) {
      return res.status(404).json({ error: 'Transition plan not found' });
    }
    res.json(plan);
  } catch (err) {
    console.error('Get transition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/capacity/transitions
 * Creates a new transition plan in "draft" status.
 * Body: { name: string, data?: object|string }
 * Returns: 201 { id, user_id, name, status: 'draft', data }
 * Errors: 400 missing name
 */
router.post('/transitions', (req, res) => {
  try {
    const { name, data } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    // Accept data as either a pre-serialised string or an object.
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data ?? {});
    const plan = createTransitionPlan(req.user.id, name, dataStr);
    res.status(201).json(plan);
  } catch (err) {
    console.error('Create transition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/capacity/transitions/:id
 * Updates a transition plan's name, status, and/or data.
 * Body: { name?: string, status?: string, data?: object|string }
 * Returns: 200 { id, user_id, name, status, data, ... }
 * Errors: 403 not owner
 */
router.put('/transitions/:id', (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    const plan = getTransitionPlanById(planId);
    if (!plan || plan.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, status, data } = req.body;
    const dataStr = data !== undefined
      ? (typeof data === 'string' ? data : JSON.stringify(data))
      : plan.data;

    updateTransitionPlan(planId, name ?? plan.name, status ?? plan.status, dataStr);
    const updated = getTransitionPlanById(planId);
    res.json(updated);
  } catch (err) {
    console.error('Update transition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/capacity/transitions/:id
 * Deletes a transition plan. Plans in 'applied' status can still be deleted.
 * Returns: 200 { success: true }
 * Errors: 403 not owner
 */
router.delete('/transitions/:id', (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    const plan = getTransitionPlanById(planId);
    if (!plan || plan.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    deleteTransitionPlan(planId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete transition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/capacity/transitions/:id/apply
 * Atomically applies a transition plan: shortens consultant assignments to the transition
 * date (+ overlap), creates replacement assignments from the transition date onwards,
 * and updates project teamMembers to reflect the new periods. Marks the plan as 'applied'.
 *
 * All database changes run inside a single transaction — either everything succeeds or
 * nothing is written. Project teamMember sync failures inside the transaction are logged
 * but do not abort the transaction (they are cosmetic; the assignment data is authoritative).
 *
 * The apply logic runs in three passes inside the transaction to avoid reading stale data:
 *   1. Collect original consultant end dates (before shortening).
 *   2. Shorten consultant assignments and create replacement assignments.
 *   3. Patch project.data teamMembers to reflect the new periods.
 *
 * Body: (none — uses plan.data which was set via PUT)
 * Returns: 200 updated plan object
 * Errors: 403 not owner | 400 no transitions | 400 missing_resources (with ids array)
 */
router.post('/transitions/:id/apply', (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    const plan = getTransitionPlanById(planId);
    if (!plan || plan.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const data = JSON.parse(plan.data);
    const transitions = data.transitions || [];

    if (transitions.length === 0) {
      return res.status(400).json({ error: 'Plan has no transitions to apply' });
    }

    // Normalize field names and parse IDs to integers
    const normalized = transitions.map(t => ({
      ...t,
      consultant_resource_id: parseInt(t.consultant_resource_id, 10),
      replacement_resource_id: parseInt(t.replacement_resource_id, 10),
    }));

    // Validate all resource IDs exist before starting the transaction (fail fast).
    const missingIds = [];
    for (const t of normalized) {
      if (!db.prepare('SELECT id FROM resources WHERE id = ? AND user_id = ?').get(t.consultant_resource_id, req.user.id)) {
        missingIds.push(t.consultant_resource_id);
      }
      if (t.replacement_resource_id && !db.prepare('SELECT id FROM resources WHERE id = ? AND user_id = ?').get(t.replacement_resource_id, req.user.id)) {
        missingIds.push(t.replacement_resource_id);
      }
    }
    if (missingIds.length > 0) {
      return res.status(400).json({ error: 'missing_resources', ids: missingIds });
    }

    /**
     * Adds a number of weeks to a YYYY-MM string, returning the resulting YYYY-MM.
     * Used to compute the consultant's overlap end date.
     * @param {string} ym - YYYY-MM base month.
     * @param {number} weeks - Number of weeks to add.
     * @returns {string} YYYY-MM result.
     */
    const addWeeksToMonth = (ym, weeks) => {
      const [y, m] = ym.split('-').map(Number);
      const d = new Date(y, m - 1, 1 + weeks * 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    // Apply in a transaction to ensure atomicity across all three passes.
    const applyFn = db.transaction(() => {
      // Pass 1: collect original end dates before modifying assignments.
      // This is critical — pass 2 shortens consultant assignments, so we must
      // read the original end dates first to know how long the replacement should run.
      const originalEndDates = {};
      for (const t of normalized) {
        const assignments = db.prepare(
          'SELECT * FROM resource_assignments WHERE resource_id = ? AND end_month >= ?'
        ).all(t.consultant_resource_id, t.transition_date);
        for (const a of assignments) {
          originalEndDates[`${a.resource_id}-${a.project_id}-${a.phase_id}`] = a.end_month;
        }
      }

      // Pass 2: modify consultant and replacement assignments.
      for (const t of normalized) {
        const assignments = db.prepare(
          'SELECT * FROM resource_assignments WHERE resource_id = ? AND end_month >= ?'
        ).all(t.consultant_resource_id, t.transition_date);

        for (const a of assignments) {
          const originalEnd = originalEndDates[`${a.resource_id}-${a.project_id}-${a.phase_id}`] || a.end_month;
          const overlapWeeks = t.overlap_weeks || 0;
          // Consultant stays until transition_date + overlap (capped at their original end).
          const consultantEnd = overlapWeeks > 0 ? addWeeksToMonth(t.transition_date, overlapWeeks) : t.transition_date;
          const cappedConsultantEnd = consultantEnd > originalEnd ? originalEnd : consultantEnd;

          // Shorten consultant assignment to end after overlap period
          db.prepare('UPDATE resource_assignments SET end_month = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(cappedConsultantEnd, a.id);

          // Create replacement assignment starting at transition_date to original end.
          // On UNIQUE conflict (assignment already exists), update instead of erroring.
          try {
            db.prepare(
              'INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
            ).run(t.replacement_resource_id, a.project_id, a.phase_id, a.allocation, t.transition_date, originalEnd);
          } catch (e) {
            db.prepare(
              'UPDATE resource_assignments SET start_month = ?, end_month = ?, allocation = ?, updated_at = CURRENT_TIMESTAMP WHERE resource_id = ? AND project_id = ? AND phase_id = ?'
            ).run(t.transition_date, originalEnd, a.allocation, t.replacement_resource_id, a.project_id, a.phase_id);
          }
        }
      }

      // Pass 3: update project teamMembers with correct periods so the UI stays in sync.
      // This is a best-effort cosmetic sync — the assignment table is the authoritative source.
      for (const t of normalized) {
        const consultant = db.prepare('SELECT * FROM resources WHERE id = ?').get(t.consultant_resource_id);
        const replacement = db.prepare('SELECT * FROM resources WHERE id = ?').get(t.replacement_resource_id);
        if (!consultant || !replacement) continue;

        const affectedProjects = db.prepare(
          'SELECT DISTINCT project_id FROM resource_assignments WHERE resource_id = ? OR resource_id = ?'
        ).all(t.consultant_resource_id, t.replacement_resource_id);

        for (const { project_id } of affectedProjects) {
          const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(project_id);
          if (!project) continue;
          try {
            const projectData = JSON.parse(project.data);
            let changed = false;
            for (const phase of (projectData.phases || [])) {
              const consultantIdx = (phase.teamMembers || []).findIndex(
                m => m.resourceId === t.consultant_resource_id || m.resourceName === consultant.name
              );
              if (consultantIdx === -1) continue;

              // Use the original end date collected in pass 1 (before it was capped).
              const key = `${t.consultant_resource_id}-${project_id}-${phase.id}`;
              const originalEnd = originalEndDates[key];
              // Get consultant's current start_month from the (now-shortened) assignment.
              const consultantAssignment = db.prepare(
                'SELECT start_month FROM resource_assignments WHERE resource_id = ? AND project_id = ? AND phase_id = ?'
              ).get(t.consultant_resource_id, project_id, phase.id);
              const phaseStart = consultantAssignment?.start_month || t.transition_date;

              // Update consultant's endMonth to reflect the overlap period.
              const overlapWeeks = t.overlap_weeks || 0;
              const consultantEndMonth = overlapWeeks > 0 ? addWeeksToMonth(t.transition_date, overlapWeeks) : t.transition_date;
              const cappedEnd = (originalEnd && consultantEndMonth > originalEnd) ? originalEnd : consultantEndMonth;
              phase.teamMembers[consultantIdx].startMonth = phaseStart;
              phase.teamMembers[consultantIdx].endMonth = cappedEnd;
              changed = true;

              // Add replacement teamMember if not already present.
              const alreadyHasReplacement = (phase.teamMembers || []).some(
                m => m.resourceId === t.replacement_resource_id || m.resourceName === replacement.name
              );

              if (!alreadyHasReplacement) {
                phase.teamMembers.push({
                  role: replacement.role,
                  level: replacement.level,
                  quantity: 1,
                  allocation: phase.teamMembers[consultantIdx].allocation,
                  resourceName: replacement.name,
                  resourceId: t.replacement_resource_id,
                  startMonth: t.transition_date,
                  endMonth: originalEnd,
                });
              }
            }
            if (changed) {
              db.prepare('UPDATE projects SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(JSON.stringify(projectData), project_id);
            }
          } catch (e) {
            console.error('Failed to update project teamMembers:', e);
          }
        }
      }

      // Mark plan as applied only after all changes succeed.
      db.prepare('UPDATE transition_plans SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('applied', planId);
    });

    applyFn();

    const updated = getTransitionPlanById(planId);
    res.json(updated);
  } catch (err) {
    console.error('Apply transition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/capacity/transitions/:id/impact
 * Returns a preview of what the plan would change without modifying any data.
 * For each transition, reports the consultant and replacement resource details,
 * the number of affected assignments, and the total overlap weeks calculated
 * using the 4.33 weeks/month approximation.
 * Returns: 200 { plan_id, plan_name, status, impacts: [{ consultant, replacement,
 *               transition_date, affected_assignments, overlap_weeks }] }
 * Errors: 403 not owner
 */
router.get('/transitions/:id/impact', (req, res) => {
  try {
    const planId = parseInt(req.params.id, 10);
    const plan = getTransitionPlanById(planId);
    if (!plan || plan.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const data = JSON.parse(plan.data);
    const transitions = data.transitions || [];

    const impacts = transitions.map(t => {
      const consultantId = parseInt(t.consultant_resource_id, 10);
      const replacementId = parseInt(t.replacement_resource_id, 10);
      const consultant = getResourceById(consultantId);
      const replacement = getResourceById(replacementId);

      // Get consultant assignments that would be affected
      const assignments = db.prepare(
        'SELECT * FROM resource_assignments WHERE resource_id = ? AND end_month >= ?'
      ).all(consultantId, t.transition_date);

      // Calculate overlap weeks using 4.33 weeks/month — same constant used in mapping.
      let overlapWeeks = 0;
      for (const a of assignments) {
        const start = t.transition_date;
        const end = a.end_month;
        const startParts = start.split('-').map(Number);
        const endParts = end.split('-').map(Number);
        const months = (endParts[0] - startParts[0]) * 12 + (endParts[1] - startParts[1]);
        overlapWeeks += Math.max(0, months) * 4.33;
      }

      return {
        consultant: consultant ? { id: consultant.id, name: consultant.name, role: consultant.role } : null,
        replacement: replacement ? { id: replacement.id, name: replacement.name, role: replacement.role } : null,
        transition_date: t.transition_date,
        affected_assignments: assignments.length,
        overlap_weeks: Math.round(overlapWeeks * 10) / 10
      };
    });

    res.json({ plan_id: planId, plan_name: plan.name, status: plan.status, impacts });
  } catch (err) {
    console.error('Transition impact error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
