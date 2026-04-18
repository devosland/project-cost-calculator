/**
 * Express router for project CRUD, sharing, snapshots, and webhook testing (/api/projects/*).
 * All routes require JWT authentication. Access control is role-based:
 *   - "owner"  — full access including delete, share management, and webhook test
 *   - "editor" — read + write project data and snapshots
 *   - "viewer" — read project data and snapshots only
 * The checkAccess() helper centralises these checks and is called at the top of every route.
 */
import { Router } from 'express';
import { authMiddleware } from './middleware.js';
import {
  getProjectsByUser,
  getProjectById,
  createProjectRecord,
  updateProjectRecord,
  deleteProjectRecord,
  shareProject,
  unshareProject,
  getProjectShares,
  createSnapshot,
  getSnapshots,
  getSnapshotById,
  findUserByEmail,
  findUserById,
  db
} from './db.js';

const router = Router();

router.use(authMiddleware);

/**
 * Checks whether a user has at least the specified role on a project.
 * Owners always pass. Shared users are checked against project_shares.
 * @param {string} projectId
 * @param {number} userId
 * @param {'viewer'|'editor'} requiredRole
 * @returns {'owner'|'editor'|'viewer'|null} The user's actual role, or null if no access.
 */
function checkAccess(projectId, userId, requiredRole) {
  const project = getProjectById(projectId);
  if (!project) return null;

  if (project.owner_id === userId) return 'owner';

  const share = db.prepare(
    'SELECT role FROM project_shares WHERE project_id = ? AND user_id = ?'
  ).get(projectId, userId);

  if (!share) return null;

  if (requiredRole === 'editor') {
    return share.role === 'editor' ? 'editor' : null;
  }

  // requiredRole is 'viewer' — any share role passes
  return share.role;
}

/**
 * GET /api/projects
 * Lists all projects visible to the authenticated user (owned + shared).
 * Returns: 200 [{ ...projectData, id, name, role, owner_id, owner_name }]
 */
router.get('/', (req, res) => {
  try {
    const rows = getProjectsByUser(req.user.id);
    const projects = rows.map(row => {
      let data = {};
      try { data = JSON.parse(row.data); } catch {}
      return { ...data, id: row.id, name: row.name, role: row.role, owner_id: row.owner_id, owner_name: row.owner_name };
    });
    res.json(projects);
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/projects
 * Creates a new project owned by the authenticated user and takes an initial snapshot
 * labelled "creation" so the history starts at the point of creation.
 * Body: { id: string, name: string, data?: object }
 * Returns: 201 { id, name, data }
 * Errors: 400 missing id or name
 */
router.post('/', (req, res) => {
  try {
    const { id, name, data } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }
    const dataStr = JSON.stringify(data ?? {});
    createProjectRecord(id, req.user.id, name, dataStr);
    createSnapshot(id, req.user.id, dataStr, 'creation');
    res.status(201).json({ id, name, data: data ?? {} });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /api/projects/:id
 * Updates a project's name and/or data. Editor or owner access required.
 * After saving, reconciles resource_assignments with the current teamMembers in each
 * phase (non-fatal — assignment sync errors are logged but don't fail the response).
 * Body: { name?: string, data?: object }
 * Returns: 200 { id, name, data }
 * Errors: 403 no access
 */
router.put('/:id', (req, res) => {
  try {
    const role = checkAccess(req.params.id, req.user.id, 'editor');
    if (!role) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { name, data } = req.body;
    const project = getProjectById(req.params.id);
    const updatedName = name ?? project.name;
    const updatedData = data !== undefined ? JSON.stringify(data) : project.data;
    updateProjectRecord(req.params.id, updatedName, updatedData);

    // Sync resource assignments with project teamMembers.
    // Non-critical path — a failed assignment sync must not roll back the project update.
    try {
      const projectData = JSON.parse(updatedData);
      const phaseIds = (projectData.phases || []).map(p => p.id);

      // Delete assignments for phases that were removed from the project.
      if (phaseIds.length > 0) {
        db.prepare(
          'DELETE FROM resource_assignments WHERE project_id = ? AND phase_id NOT IN (' + phaseIds.map(() => '?').join(',') + ')'
        ).run(req.params.id, ...phaseIds);
      } else {
        db.prepare('DELETE FROM resource_assignments WHERE project_id = ?').run(req.params.id);
      }

      // Sync each phase's assignments with its teamMembers
      for (const phase of (projectData.phases || [])) {
        const linkedResourceIds = (phase.teamMembers || [])
          .filter(m => m.resourceId)
          .map(m => typeof m.resourceId === 'number' ? m.resourceId : parseInt(m.resourceId, 10));

        // Delete assignments for resources removed from this phase
        const existingAssignments = db.prepare(
          'SELECT * FROM resource_assignments WHERE project_id = ? AND phase_id = ?'
        ).all(req.params.id, phase.id);

        for (const a of existingAssignments) {
          if (!linkedResourceIds.includes(a.resource_id)) {
            db.prepare('DELETE FROM resource_assignments WHERE id = ?').run(a.id);
          }
        }

        // Update dates for existing assignments if member has period changes
        for (const member of (phase.teamMembers || [])) {
          if (!member.resourceId) continue;
          const resId = typeof member.resourceId === 'number' ? member.resourceId : parseInt(member.resourceId, 10);
          const existing = db.prepare(
            'SELECT * FROM resource_assignments WHERE resource_id = ? AND project_id = ? AND phase_id = ?'
          ).get(resId, req.params.id, phase.id);

          if (existing && member.startMonth && member.endMonth) {
            if (existing.start_month !== member.startMonth || existing.end_month !== member.endMonth || existing.allocation !== member.allocation) {
              db.prepare(
                'UPDATE resource_assignments SET start_month = ?, end_month = ?, allocation = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
              ).run(member.startMonth, member.endMonth, member.allocation, existing.id);
            }
          }
        }
      }
    } catch (e) {
      // Non-critical: log but don't fail the save
      console.error('Phase cleanup error:', e);
    }

    res.json({ id: req.params.id, name: updatedName, data: JSON.parse(updatedData) });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/projects/:id
 * Permanently deletes a project. Owner access only — editors and viewers cannot delete.
 * Cascades to project_shares and project_snapshots via FK ON DELETE CASCADE.
 * Returns: 200 { success: true }
 * Errors: 403 not owner
 */
router.delete('/:id', (req, res) => {
  try {
    const project = getProjectById(req.params.id);
    if (!project || project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    deleteProjectRecord(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/projects/:id/share
 * Shares a project with another user by email. Owner access only.
 * Uses INSERT OR REPLACE so calling share again with a different role updates the role.
 * Body: { email: string, role?: 'viewer'|'editor' }
 * Returns: 200 { success, user_id, email, role }
 * Errors: 403 not owner | 400 missing email | 404 target user not found
 */
router.post('/:id/share', (req, res) => {
  try {
    const project = getProjectById(req.params.id);
    if (!project || project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const { email, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    const targetUser = findUserByEmail(email);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    shareProject(req.params.id, targetUser.id, role || 'viewer');
    res.json({ success: true, user_id: targetUser.id, email: targetUser.email, role: role || 'viewer' });
  } catch (err) {
    console.error('Share project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/projects/:id/share/:userId
 * Revokes a specific user's access to the project. Owner access only.
 * Returns: 200 { success: true }
 * Errors: 403 not owner
 */
router.delete('/:id/share/:userId', (req, res) => {
  try {
    const project = getProjectById(req.params.id);
    if (!project || project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    unshareProject(req.params.id, parseInt(req.params.userId, 10));
    res.json({ success: true });
  } catch (err) {
    console.error('Unshare project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/projects/:id/shares
 * Lists all users with access to the project. Owner access only.
 * Returns: 200 [{ id, user_id, role, created_at, email, name }]
 * Errors: 403 not owner
 */
router.get('/:id/shares', (req, res) => {
  try {
    const project = getProjectById(req.params.id);
    if (!project || project.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const shares = getProjectShares(req.params.id);
    res.json(shares);
  } catch (err) {
    console.error('Get shares error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/projects/:id/snapshots
 * Lists up to 50 snapshots for the project ordered newest first.
 * Viewer or higher access required.
 * Returns: 200 [{ id, project_id, user_id, label, created_at }]
 * Errors: 403 no access
 */
router.get('/:id/snapshots', (req, res) => {
  try {
    const role = checkAccess(req.params.id, req.user.id, 'viewer');
    if (!role) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const snapshots = getSnapshots(req.params.id);
    res.json(snapshots);
  } catch (err) {
    console.error('Get snapshots error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/projects/:id/snapshots
 * Takes a manual snapshot of the project's current state. Viewer or higher access required
 * (viewers can save snapshots since it's a non-destructive read operation).
 * Body: { label?: string }
 * Returns: 201 { id, project_id, user_id, data, label }
 * Errors: 403 no access
 */
router.post('/:id/snapshots', (req, res) => {
  try {
    const role = checkAccess(req.params.id, req.user.id, 'viewer');
    if (!role) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const project = getProjectById(req.params.id);
    const { label } = req.body;
    const snapshot = createSnapshot(req.params.id, req.user.id, project.data, label || null);
    res.status(201).json(snapshot);
  } catch (err) {
    console.error('Create snapshot error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/projects/snapshots/:snapshotId/restore
 * Restores a project to the state captured in a snapshot. Editor or owner access required.
 * Note: this route must be declared before /:id routes to avoid Express matching
 * "snapshots" as a project ID — the specific literal path takes precedence here
 * only because it is registered first in the file.
 * Returns: 200 { id, name, data }
 * Errors: 404 snapshot not found | 403 no editor access
 */
router.post('/snapshots/:snapshotId/restore', (req, res) => {
  try {
    const snapshot = getSnapshotById(parseInt(req.params.snapshotId, 10));
    if (!snapshot) {
      return res.status(404).json({ error: 'Snapshot not found' });
    }
    const role = checkAccess(snapshot.project_id, req.user.id, 'editor');
    if (!role) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const project = getProjectById(snapshot.project_id);
    updateProjectRecord(snapshot.project_id, project.name, snapshot.data);
    const updated = getProjectById(snapshot.project_id);
    let data = {};
    try { data = JSON.parse(updated.data); } catch {}
    res.json({ id: updated.id, name: updated.name, data });
  } catch (err) {
    console.error('Restore snapshot error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Validates that a webhook URL is safe to call (HTTPS/HTTP, non-private IP).
 * Blocks localhost, RFC-1918 ranges, link-local, and .internal TLDs to prevent SSRF.
 * @param {string} urlString
 * @returns {boolean}
 */
function isAllowedWebhookUrl(urlString) {
  let parsed;
  try { parsed = new URL(urlString); } catch { return false; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const hostname = parsed.hostname;
  if (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' ||
    hostname.startsWith('10.') || hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname === '169.254.169.254' || hostname.endsWith('.internal') ||
    hostname === '0.0.0.0' || hostname === '[::1]'
  ) return false;
  return true;
}

/**
 * POST /api/projects/:id/test-webhook
 * Sends a test "budget_alert_test" event to the project's configured webhook URL.
 * Editor or owner access required. Enforces a 10-second timeout and SSRF blocklist.
 * Returns: 200 { success: true }
 * Errors: 403 no access | 400 webhook_not_configured | 400 webhook_url_invalid |
 *         502 webhook_response_error | 504 webhook_timeout | 502 webhook_unreachable
 */
router.post('/:id/test-webhook', async (req, res) => {
  try {
    const role = checkAccess(req.params.id, req.user.id, 'editor');
    if (!role) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const project = getProjectById(req.params.id);
    let data = {};
    try { data = JSON.parse(project.data); } catch {}

    const webhookUrl = data.settings?.webhookUrl;
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhook_not_configured' });
    }
    if (!isAllowedWebhookUrl(webhookUrl)) {
      return res.status(400).json({ error: 'webhook_url_invalid' });
    }

    const budget = data.budget ?? null;
    const threshold = data.settings?.budgetAlertThreshold ?? 80;

    const payload = {
      event: 'budget_alert_test',
      project: {
        id: project.id,
        name: project.name,
      },
      budget: {
        total: budget,
        threshold_percent: threshold,
      },
      timestamp: new Date().toISOString(),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: 'webhook_response_error', status: response.status });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Test webhook error:', err);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'webhook_timeout' });
    }
    res.status(502).json({ error: 'webhook_unreachable' });
  }
});

export default router;
