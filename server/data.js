import { Router } from 'express';
import { getUserData, saveUserData, getProjectsByUser, upsertProjectRecord, deleteProjectRecord, db } from './db.js';
import { authMiddleware } from './middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/data
router.get('/', (req, res) => {
  try {
    const data = getUserData(req.user.id);
    const rates = data.rates ? JSON.parse(data.rates) : null;

    // Get projects from the new projects table
    const projectRows = getProjectsByUser(req.user.id);
    const projects = projectRows.map(row => {
      let parsed = {};
      try { parsed = JSON.parse(row.data); } catch {}
      return { ...parsed, id: row.id, name: row.name, role: row.role, owner_id: row.owner_id, owner_name: row.owner_name };
    });

    res.json({ projects, rates });
  } catch (err) {
    console.error('Get data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/data
router.put('/', (req, res) => {
  try {
    if (JSON.stringify(req.body).length > 5_000_000) {
      return res.status(413).json({ error: 'Payload too large' });
    }

    const { projects, rates } = req.body;
    const ratesStr = rates != null ? JSON.stringify(rates) : null;

    // Save rates to user_data (projects column kept as '[]' since projects live in their own table now)
    saveUserData(req.user.id, '[]', ratesStr);

    // Sync projects to the projects table
    const projectsArray = projects ?? [];
    const submittedIds = new Set();

    const syncProjects = db.transaction(() => {
      for (const project of projectsArray) {
        if (!project.id) continue;
        submittedIds.add(project.id);
        const name = project.name || 'Sans titre';
        const data = JSON.stringify(project);
        upsertProjectRecord(project.id, req.user.id, name, data);
      }

      // Delete owned projects not in the submitted array
      const ownedProjects = db.prepare('SELECT id FROM projects WHERE owner_id = ?').all(req.user.id);
      for (const owned of ownedProjects) {
        if (!submittedIds.has(owned.id)) {
          deleteProjectRecord(owned.id);
        }
      }
    });

    syncProjects();

    // Sync resource_assignments with project teamMembers
    try {
      for (const project of projectsArray) {
        if (!project.id) continue;
        const phases = project.phases || [];
        const phaseIds = phases.map(p => p.id);

        // Delete assignments for removed phases
        if (phaseIds.length > 0) {
          db.prepare(
            'DELETE FROM resource_assignments WHERE project_id = ? AND phase_id NOT IN (' + phaseIds.map(() => '?').join(',') + ')'
          ).run(project.id, ...phaseIds);
        }

        // Sync each phase
        for (const phase of phases) {
          const linkedResourceIds = (phase.teamMembers || [])
            .filter(m => m.resourceId)
            .map(m => typeof m.resourceId === 'number' ? m.resourceId : parseInt(m.resourceId, 10));

          // Delete assignments for resources no longer in this phase
          const existing = db.prepare(
            'SELECT * FROM resource_assignments WHERE project_id = ? AND phase_id = ?'
          ).all(project.id, phase.id);

          for (const a of existing) {
            if (!linkedResourceIds.includes(a.resource_id)) {
              db.prepare('DELETE FROM resource_assignments WHERE id = ?').run(a.id);
            }
          }

          // Update dates for members with period changes
          for (const member of (phase.teamMembers || [])) {
            if (!member.resourceId) continue;
            const resId = typeof member.resourceId === 'number' ? member.resourceId : parseInt(member.resourceId, 10);
            const ex = db.prepare(
              'SELECT * FROM resource_assignments WHERE resource_id = ? AND project_id = ? AND phase_id = ?'
            ).get(resId, project.id, phase.id);

            if (ex && member.startMonth && member.endMonth) {
              if (ex.start_month !== member.startMonth || ex.end_month !== member.endMonth || ex.allocation !== member.allocation) {
                db.prepare(
                  'UPDATE resource_assignments SET start_month = ?, end_month = ?, allocation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
                ).run(member.startMonth, member.endMonth, member.allocation, ex.id);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Resource assignment sync error:', e);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Save data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
