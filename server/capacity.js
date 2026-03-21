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

// GET /resources — list user's resource pool
router.get('/resources', (req, res) => {
  try {
    const resources = getResourcesByUser(req.user.id);
    res.json(resources);
  } catch (err) {
    console.error('List resources error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /resources — create resource
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

// PUT /resources/:id — update resource
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

// DELETE /resources/:id — delete resource
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

// GET /assignments — list assignments with filters
router.get('/assignments', (req, res) => {
  try {
    const { month, resource_id, project_id } = req.query;

    let sql = `
      SELECT ra.*, r.name AS resource_name, r.role AS resource_role, p.name AS project_name
      FROM resource_assignments ra
      JOIN resources r ON r.id = ra.resource_id
      JOIN projects p ON p.id = ra.project_id
      WHERE r.user_id = ?
    `;
    const params = [req.user.id];

    if (month) {
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

// POST /assignments — create assignment
router.post('/assignments', (req, res) => {
  try {
    const { resource_id, project_id, phase_id, allocation, start_month, end_month } = req.body;
    if (!resource_id || !project_id || !phase_id || allocation == null || !start_month || !end_month) {
      return res.status(400).json({ error: 'resource_id, project_id, phase_id, allocation, start_month, and end_month are required' });
    }

    // Validate resource ownership
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

// PUT /assignments/:id — update assignment
router.put('/assignments/:id', (req, res) => {
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

// DELETE /assignments/:id — delete assignment
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

// GET /gantt?start=YYYY-MM&end=YYYY-MM
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

// GET /transitions — list user's plans
router.get('/transitions', (req, res) => {
  try {
    const plans = getTransitionPlansByUser(req.user.id);
    res.json(plans);
  } catch (err) {
    console.error('List transitions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /transitions — create plan
router.post('/transitions', (req, res) => {
  try {
    const { name, data } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data ?? {});
    const plan = createTransitionPlan(req.user.id, name, dataStr);
    res.status(201).json(plan);
  } catch (err) {
    console.error('Create transition error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /transitions/:id — update plan
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

// DELETE /transitions/:id — delete plan
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

// POST /transitions/:id/apply — apply transition plan
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

    // Validate all resource IDs exist
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

    // Apply in a transaction
    const applyFn = db.transaction(() => {
      for (const t of normalized) {
        // Get consultant assignments that extend past transition_date
        const assignments = db.prepare(
          'SELECT * FROM resource_assignments WHERE resource_id = ? AND end_month >= ?'
        ).all(t.consultant_resource_id, t.transition_date);

        for (const a of assignments) {
          // Shorten consultant assignment to end at transition_date
          db.prepare('UPDATE resource_assignments SET end_month = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(t.transition_date, a.id);

          // Create replacement assignment starting at transition_date
          try {
            db.prepare(
              'INSERT INTO resource_assignments (resource_id, project_id, phase_id, allocation, start_month, end_month, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
            ).run(t.replacement_resource_id, a.project_id, a.phase_id, a.allocation, t.transition_date, a.end_month);
          } catch (e) {
            // UNIQUE constraint — assignment already exists, update instead
            db.prepare(
              'UPDATE resource_assignments SET start_month = ?, end_month = ?, allocation = ?, updated_at = CURRENT_TIMESTAMP WHERE resource_id = ? AND project_id = ? AND phase_id = ?'
            ).run(t.transition_date, a.end_month, a.allocation, t.replacement_resource_id, a.project_id, a.phase_id);
          }
        }
      }

      // Update project teamMembers to reflect transitions
      for (const t of normalized) {
        const consultant = db.prepare('SELECT * FROM resources WHERE id = ?').get(t.consultant_resource_id);
        const replacement = db.prepare('SELECT * FROM resources WHERE id = ?').get(t.replacement_resource_id);
        if (!consultant || !replacement) continue;

        // Find all projects that have this consultant assigned
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
              // Find consultant team member and add replacement if not already present
              const consultantIdx = (phase.teamMembers || []).findIndex(
                m => m.resourceId === t.consultant_resource_id || m.resourceName === consultant.name
              );
              if (consultantIdx === -1) continue;

              // Get the phase's assignment to find start/end months
              const consultantAssignment = db.prepare(
                'SELECT * FROM resource_assignments WHERE resource_id = ? AND project_id = ? AND phase_id = ?'
              ).get(t.consultant_resource_id, project_id, phase.id);
              const phaseStart = consultantAssignment?.start_month || t.transition_date;
              const phaseEnd = consultantAssignment?.end_month || t.transition_date;

              // Set consultant end date to transition date
              phase.teamMembers[consultantIdx].endMonth = t.transition_date;
              if (!phase.teamMembers[consultantIdx].startMonth) {
                phase.teamMembers[consultantIdx].startMonth = phaseStart;
              }
              changed = true;

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
                  endMonth: phaseEnd,
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

      // Mark plan as applied
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

// GET /transitions/:id/impact — return plan impacts
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

      // Calculate overlap weeks (rough: each month ~ 4.33 weeks)
      let overlapWeeks = 0;
      for (const a of assignments) {
        const start = t.transition_date;
        const end = a.end_month;
        // Count months of overlap
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
