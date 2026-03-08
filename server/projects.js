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

// Access check helper
// Returns role string ('owner' | 'editor' | 'viewer') or null if no access
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

// GET / — list all projects accessible to user
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

// POST / — create a new project
router.post('/', (req, res) => {
  try {
    const { id, name, data } = req.body;
    if (!id || !name) {
      return res.status(400).json({ error: 'id and name are required' });
    }
    const dataStr = JSON.stringify(data ?? {});
    createProjectRecord(id, req.user.id, name, dataStr);
    createSnapshot(id, req.user.id, dataStr, 'Création');
    res.status(201).json({ id, name, data: data ?? {} });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /:id — update a project
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
    res.json({ id: req.params.id, name: updatedName, data: JSON.parse(updatedData) });
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /:id — delete a project (owner only)
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

// POST /:id/share — share a project
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

// DELETE /:id/share/:userId — unshare a project
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

// GET /:id/shares — list shares for a project
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

// GET /:id/snapshots — list snapshots
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

// POST /:id/snapshots — create a snapshot
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

// POST /snapshots/:snapshotId/restore — restore a snapshot
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

// POST /:id/test-webhook — send a test webhook notification
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
      return res.status(400).json({ error: 'Aucune URL webhook configurée' });
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
      return res.status(502).json({ error: `Le webhook a répondu avec le statut ${response.status}` });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Test webhook error:', err);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Le webhook n\u2019a pas répondu dans les délais' });
    }
    res.status(502).json({ error: 'Impossible de joindre l\u2019URL du webhook' });
  }
});

export default router;
