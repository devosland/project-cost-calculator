/**
 * Express router for project template CRUD (/api/templates/*).
 * Templates are owned by a single user and hold a serialised project structure
 * that can be applied when creating a new project.
 */
import { Router } from 'express';
import { authMiddleware } from './middleware.js';
import { createTemplate, getTemplatesByUser, deleteTemplate } from './db.js';

const router = Router();

router.use(authMiddleware);

/**
 * GET /api/templates
 * Returns all templates owned by the authenticated user.
 * Returns: 200 [{ id, name, data, created_at }]
 */
router.get('/', (req, res) => {
  try {
    const rows = getTemplatesByUser(req.user.id);
    const templates = rows.map(row => {
      let data = {};
      try { data = JSON.parse(row.data); } catch {}
      return { id: row.id, name: row.name, data, created_at: row.created_at };
    });
    res.json(templates);
  } catch (err) {
    console.error('List templates error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/templates
 * Creates a new template for the authenticated user.
 * Body: { name: string, data?: object }
 * Returns: 201 { id, name, data, created_at }
 * Errors: 400 missing name
 */
router.post('/', (req, res) => {
  try {
    const { name, data } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const template = createTemplate(req.user.id, name, JSON.stringify(data ?? {}));
    let parsedData = {};
    try { parsedData = JSON.parse(template.data); } catch {}
    res.status(201).json({ id: template.id, name: template.name, data: parsedData, created_at: template.created_at });
  } catch (err) {
    console.error('Create template error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/templates/:id
 * Deletes a template. The db helper enforces user_id ownership, so other users'
 * templates are silently ignored (no 404 is raised — idempotent delete).
 * Returns: 204 No Content
 */
router.delete('/:id', (req, res) => {
  try {
    deleteTemplate(parseInt(req.params.id, 10), req.user.id);
    res.status(204).end();
  } catch (err) {
    console.error('Delete template error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
