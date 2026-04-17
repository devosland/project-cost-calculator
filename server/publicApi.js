import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'crypto';
import { apiKeyAuth } from './apiKeyAuth.js';
import { validateRoadmapImport } from './schemas/roadmapImport.js';
import { mapRoadmapToProject } from './mapping/roadmapToProject.js';
import {
  createProjectRecord, updateProjectRecord, findProjectByExternalId, createSnapshot,
} from './db.js';

const router = Router();

const perKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => req.apiKey?.rateLimit ?? 60,
  keyGenerator: (req) => req.apiKey?.id?.toString() ?? req.ip,
  handler: (req, res) => res.status(429).json({ error: 'rate_limit_exceeded', retryAfter: 60 }),
});

function baseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

function projectUrl(req, id) {
  return `${baseUrl(req)}/#/projects/${id}/phases`;
}

function newProjectId() {
  return 'rm_' + randomBytes(12).toString('hex');
}

router.post(
  '/roadmap/import',
  apiKeyAuth({ requiredScope: 'roadmap:import' }),
  perKeyLimiter,
  (req, res) => {
    const validation = validateRoadmapImport(req.body);
    if (!validation.ok) {
      return res.status(422).json({ error: 'validation_error', issues: validation.issues });
    }

    const payload = validation.data;
    const projectData = mapRoadmapToProject(payload);
    const upsert = req.query.upsert === 'true';
    const existing = findProjectByExternalId(req.user.id, payload.project.externalId);

    if (existing && !upsert) {
      return res.status(409).json({
        error: 'duplicate_external_id',
        message: `A project with externalId '${payload.project.externalId}' already exists for this account.`,
        existing: { id: existing.id, url: projectUrl(req, existing.id) },
      });
    }

    try {
      if (existing && upsert) {
        let existingData = {};
        try { existingData = JSON.parse(existing.data); } catch {}
        const existingPhases = new Map((existingData.phases || []).map(p => [p.id, p]));
        projectData.phases = projectData.phases.map(p => ({
          ...p,
          teamMembers: existingPhases.get(p.id)?.teamMembers ?? [],
        }));
        projectData.id = existing.id;

        const dataStr = JSON.stringify(projectData);
        updateProjectRecord(existing.id, payload.project.name, dataStr);
        createSnapshot(existing.id, req.user.id, dataStr, 'roadmap-upsert');

        return res.status(200).json({
          id: existing.id,
          name: payload.project.name,
          externalId: payload.project.externalId,
          url: projectUrl(req, existing.id),
          phasesCreated: projectData.phases.length,
          updatedAt: new Date().toISOString(),
        });
      }

      const id = newProjectId();
      projectData.id = id;
      const dataStr = JSON.stringify(projectData);
      createProjectRecord(id, req.user.id, payload.project.name, dataStr);
      createSnapshot(id, req.user.id, dataStr, 'roadmap-import');

      return res.status(201).json({
        id,
        name: payload.project.name,
        externalId: payload.project.externalId,
        url: projectUrl(req, id),
        phasesCreated: projectData.phases.length,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('roadmap import error:', err);
      return res.status(500).json({ error: 'internal_error' });
    }
  }
);

router.get(
  '/roadmap/import/:externalId/status',
  apiKeyAuth({ requiredScope: 'roadmap:import' }),
  perKeyLimiter,
  (req, res) => {
    const existing = findProjectByExternalId(req.user.id, req.params.externalId);
    if (!existing) return res.json({ exists: false });
    res.json({
      exists: true,
      project: {
        id: existing.id,
        name: existing.name,
        externalId: req.params.externalId,
        url: projectUrl(req, existing.id),
        createdAt: existing.created_at,
        updatedAt: existing.updated_at,
      },
    });
  }
);

export default router;
