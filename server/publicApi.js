/**
 * Router Express pour l'API publique v1 (/api/v1/*).
 * Expose l'import de projets depuis des roadmaps externes, authentifié par clés API
 * scopées (voir apiKeyAuth.js). Rate limiting est appliqué par clé (pas par IP) pour
 * permettre des limites différenciées par client tout en évitant qu'une clé saturée
 * n'impacte les autres.
 */
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

// Per-key rate limiter: each API key gets its own counter (keyed by key ID, not IP).
// The limit is read from req.apiKey.rateLimit which is populated by apiKeyAuth middleware,
// so different keys can have different limits without needing separate middleware instances.
const perKeyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: (req) => req.apiKey?.rateLimit ?? 60,
  keyGenerator: (req) => req.apiKey?.id?.toString() ?? req.ip,
  handler: (req, res) => res.status(429).json({ error: 'rate_limit_exceeded', retryAfter: 60 }),
});

/**
 * Resolves the public base URL of the server for building project deep-links.
 * Falls back to the request's own protocol/host when PUBLIC_BASE_URL is not set,
 * which is correct in development but may produce internal hostnames in production
 * behind a reverse proxy — set PUBLIC_BASE_URL in that case.
 * @param {import('express').Request} req
 * @returns {string}
 */
function baseUrl(req) {
  return process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
}

/**
 * Builds the deep-link URL for a project's phases view.
 * @param {import('express').Request} req
 * @param {string} id - Project ID.
 * @returns {string}
 */
function projectUrl(req, id) {
  return `${baseUrl(req)}/#/projects/${id}/phases`;
}

/**
 * Generates a unique project ID prefixed with "rm_" to indicate roadmap-imported origin.
 * 12 random bytes = 24 hex chars, giving ~96 bits of collision resistance.
 * @returns {string}
 */
function newProjectId() {
  return 'rm_' + randomBytes(12).toString('hex');
}

/**
 * POST /api/v1/roadmap/import
 * Imports a roadmap payload as a new project (or updates an existing one with ?upsert=true).
 * Requires scope: roadmap:import
 *
 * On create (no existing project with externalId):
 *   Returns: 201 { id, name, externalId, url, phasesCreated, createdAt }
 *
 * On upsert (?upsert=true and existing project found):
 *   Preserves existing teamMembers per phase (they are not part of the roadmap schema).
 *   A snapshot labelled "roadmap-upsert" is created before overwriting.
 *   Returns: 200 { id, name, externalId, url, phasesCreated, updatedAt }
 *
 * On duplicate without upsert:
 *   Returns: 409 { error: 'duplicate_external_id', existing: { id, url } }
 *
 * Body: see schemas/roadmapImport.js
 * Errors: 422 validation_error (with issues array) | 409 duplicate_external_id | 500 internal_error
 */
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
    // json_extract lookup: SQLite's json_extract reads the externalId field stored inside
    // the data JSON column, so no separate indexed column is needed for this lookup.
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
        // Preserve existing teamMembers per phase so that capacity assignments
        // made through the UI are not wiped out by an upsert from the roadmap tool.
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
        // Snapshot before overwrite so the previous state is recoverable.
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

      // New project
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

/**
 * GET /api/v1/roadmap/import/:externalId/status
 * Checks whether a project with the given externalId already exists for the API key's owner.
 * Useful for idempotency checks before calling the import endpoint.
 * Requires scope: roadmap:import
 * Returns: 200 { exists: false }
 *        | 200 { exists: true, project: { id, name, externalId, url, createdAt, updatedAt } }
 */
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
