import { Router } from 'express';
import { getUserData, saveUserData } from './db.js';
import { authMiddleware } from './middleware.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// GET /api/data
router.get('/', (req, res) => {
  try {
    const data = getUserData(req.user.id);
    res.json({
      projects: JSON.parse(data.projects),
      rates: data.rates ? JSON.parse(data.rates) : null
    });
  } catch (err) {
    console.error('Get data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/data
router.put('/', (req, res) => {
  try {
    const { projects, rates } = req.body;
    const projectsStr = JSON.stringify(projects ?? []);
    const ratesStr = rates != null ? JSON.stringify(rates) : null;

    saveUserData(req.user.id, projectsStr, ratesStr);
    res.json({ success: true });
  } catch (err) {
    console.error('Save data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
