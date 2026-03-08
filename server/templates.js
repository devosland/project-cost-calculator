import { Router } from 'express';
import { authMiddleware } from './middleware.js';
import { createTemplate, getTemplatesByUser, deleteTemplate } from './db.js';

const router = Router();

router.use(authMiddleware);

// GET / — list templates for user
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

// POST / — create a template
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

// DELETE /:id — delete a template (only if owned)
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
