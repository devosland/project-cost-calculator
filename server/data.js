/**
 * Express router for bulk data synchronisation (/api/data).
 * GET returns the full user dataset (projects + rates) in one call.
 * PUT upserts the authorized projects (owned + editor shares) and rates, then
 * reconciles resource_assignments with the updated teamMembers in each phase.
 * PUT never deletes — deletion is owner-only via DELETE /api/projects/:id.
 *
 * This is a legacy "save everything" endpoint used by the frontend's
 * projectStore. New code should prefer the granular /api/projects/* routes.
 */
import { Router } from 'express';
import { getUserData, saveUserData, getProjectsByUser, upsertProjectRecord, getProjectById, getProjectRole, db } from './db.js';
import { authMiddleware } from './middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /api/data
 * Returns all projects visible to the user (owned + shared) and their billing rates.
 * Projects are read from the dedicated `projects` table (not the legacy user_data.projects
 * JSON blob) so shared projects are included via the UNION query in getProjectsByUser.
 * Returns: 200 { projects: object[], rates: object|null }
 */
router.get('/', (req, res) => {
  try {
    const data = getUserData(req.user.id);
    const rates = data.rates ? JSON.parse(data.rates) : null;

    // Get projects from the new projects table
    const projectRows = getProjectsByUser(req.user.id);
    const projects = projectRows.map(row => {
      let parsed = {};
      try { parsed = JSON.parse(row.data); } catch {}
      // Merge DB metadata (id, name, role, owner) onto the parsed JSON blob.
      return { ...parsed, id: row.id, name: row.name, role: row.role, owner_id: row.owner_id, owner_name: row.owner_name };
    });

    res.json({ projects, rates });
  } catch (err) {
    console.error('Get data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/data
 * Upserts the authenticated user's project set and billing rates.
 * Authorization is enforced per project: owners and editor-shares are written,
 * anything else (viewer share, foreign or unknown relation to an existing id)
 * is skipped and reported in the response. owner_id is never reassigned.
 * This endpoint NEVER deletes projects — deletion goes through
 * DELETE /api/projects/:id (owner only), so a partial payload (second tab,
 * interrupted hydration) can no longer wipe data.
 * After the project sync, resource_assignments are reconciled with teamMembers
 * in each phase of the ACCEPTED projects (non-fatal — errors are logged but
 * don't roll back the project save).
 * Body: { projects: object[], rates: object|null }
 * Returns: 200 { success: true, skipped: string[] }
 * Errors: 413 payload too large (>5 MB)
 */
router.put('/', (req, res) => {
  try {
    if (JSON.stringify(req.body).length > 5_000_000) {
      return res.status(413).json({ error: 'Payload too large' });
    }

    const { projects, rates } = req.body;
    const ratesStr = rates != null ? JSON.stringify(rates) : null;

    // Save rates to user_data. The projects column is now kept as '[]' since
    // all projects live in the dedicated `projects` table — this column is only
    // retained for backwards-compat with pre-migration clients.
    saveUserData(req.user.id, '[]', ratesStr);

    // Sync projects to the projects table.
    // Per-project authorization: a submitted id that already exists is only
    // written if the caller owns it or holds an 'editor' share. Everything
    // else is skipped — a viewer share or a guessed id must never overwrite
    // someone else's data. New ids are inserted as owned by the caller.
    const projectsArray = projects ?? [];
    const acceptedIds = new Set();
    const skipped = [];

    const syncProjects = db.transaction(() => {
      for (const project of projectsArray) {
        if (!project.id) continue;
        const existing = getProjectById(project.id);
        let ownerId = req.user.id;
        if (existing) {
          const role = getProjectRole(project.id, req.user.id);
          if (role !== 'owner' && role !== 'editor') {
            skipped.push(project.id);
            continue;
          }
          ownerId = existing.owner_id; // never reassign ownership from the bulk path
        }
        acceptedIds.add(project.id);
        const name = project.name || 'Sans titre';
        const data = JSON.stringify(project);
        upsertProjectRecord(project.id, ownerId, name, data);
      }
      // Deliberately no delete-by-absence here: an absent project means
      // "this client doesn't have it", not "the user deleted it".
    });

    syncProjects();

    // Sync resource_assignments with project teamMembers.
    // This is best-effort: assignment sync errors must not fail the project save
    // because the frontend may not always send perfectly consistent teamMember data.
    try {
      for (const project of projectsArray) {
        if (!project.id || !acceptedIds.has(project.id)) continue;
        const phases = project.phases || [];
        const phaseIds = phases.map(p => p.id);

        // Delete assignments for phases that were removed from the project.
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

    res.json({ success: true, skipped });
  } catch (err) {
    console.error('Save data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
