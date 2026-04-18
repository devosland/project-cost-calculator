/**
 * Zod schema and validation logic for the POST /api/v1/roadmap/import payload.
 * Validates structure, enforces business constraints (date ordering, unique phase IDs,
 * valid dependency references, and absence of dependency cycles) beyond what Zod alone
 * can express declaratively.
 */
import { z } from 'zod';

// Reusable ISO 8601 date string validator (YYYY-MM-DD only, no time component).
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid ISO 8601 date (YYYY-MM-DD expected)');

/**
 * Per-phase schema.
 * Constraints:
 *   - id must be slug-like (alphanumeric + hyphens/underscores) for URL safety.
 *   - Either durationMonths OR both startDate+endDate must be provided (not both required,
 *     but at least one source of duration is mandatory so the mapper can produce durationWeeks).
 *   - endDate must be strictly after startDate when both are provided.
 */
const phaseSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-_]*$/i, 'id must be slug-like'),
  name: z.string().min(1).max(100),
  order: z.number().int().positive(),
  // Optional: used as fallback when no explicit dates are given.
  durationMonths: z.number().positive().optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  // Phase IDs that must complete before this phase starts (for Gantt dependency rendering).
  dependsOn: z.array(z.string()).optional(),
  description: z.string().max(1000).optional(),
})
.refine(
  // At least one duration source must be provided.
  p => p.durationMonths !== undefined || (p.startDate && p.endDate),
  { message: 'durationMonths is required unless both startDate and endDate are provided', path: ['durationMonths'] }
)
.refine(
  // Guard against inverted date ranges (endDate === startDate is also invalid).
  p => !(p.startDate && p.endDate) || p.endDate > p.startDate,
  { message: 'endDate must be after startDate', path: ['endDate'] }
);

/** Top-level payload schema. At least one phase is required. */
const payloadSchema = z.object({
  project: z.object({
    name: z.string().min(1).max(200),
    // externalId is used to detect duplicates and support idempotent upserts.
    externalId: z.string().min(1).max(100),
    startDate: isoDate,
    description: z.string().max(2000).optional(),
  }),
  phases: z.array(phaseSchema).min(1),
});

/**
 * Detects dependency cycles in the phase graph using DFS three-colour marking.
 * Returns true if a cycle exists (the import should be rejected).
 * @param {{ id: string, dependsOn?: string[] }[]} phases
 * @returns {boolean}
 */
function detectCycles(phases) {
  const adj = new Map(phases.map(p => [p.id, p.dependsOn || []]));
  // WHITE=unvisited, GRAY=in current DFS path (back-edge means cycle), BLACK=done.
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(phases.map(p => [p.id, WHITE]));

  function dfs(node) {
    color.set(node, GRAY);
    for (const next of adj.get(node) || []) {
      const c = color.get(next);
      if (c === GRAY) return true;  // Back edge — cycle found.
      if (c === WHITE && dfs(next)) return true;
    }
    color.set(node, BLACK);
    return false;
  }

  for (const p of phases) {
    if (color.get(p.id) === WHITE && dfs(p.id)) return true;
  }
  return false;
}

/**
 * Validates a roadmap import payload against the full schema including semantic checks.
 * Runs Zod schema validation first, then additional post-parse checks that Zod
 * refinements cannot easily express (duplicate IDs across phases, cross-phase references,
 * cycle detection, and the requirement for at least one root phase).
 *
 * @param {unknown} input - Raw request body.
 * @returns {{ ok: true, data: z.infer<typeof payloadSchema> }
 *          | { ok: false, issues: { path: string, message: string }[] }}
 *   On success: { ok: true, data } — use data for mapping.
 *   On failure: { ok: false, issues } — array of { path, message } for the 422 response.
 */
export function validateRoadmapImport(input) {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    };
  }

  const { phases } = parsed.data;
  const issues = [];
  const ids = new Set();

  // Check for duplicate phase IDs (Zod validates per-element; cross-element uniqueness is manual).
  for (let i = 0; i < phases.length; i++) {
    if (ids.has(phases[i].id)) {
      issues.push({ path: `phases.${i}.id`, message: `duplicate id "${phases[i].id}"` });
    }
    ids.add(phases[i].id);
  }

  // Check that all dependsOn references point to known phase IDs.
  for (let i = 0; i < phases.length; i++) {
    for (let j = 0; j < (phases[i].dependsOn || []).length; j++) {
      const ref = phases[i].dependsOn[j];
      if (!ids.has(ref)) {
        issues.push({ path: `phases.${i}.dependsOn.${j}`, message: `References unknown phase id "${ref}"` });
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  // Cycle detection — run only after reference validation to avoid misleading errors.
  if (detectCycles(phases)) {
    return { ok: false, issues: [{ path: 'phases', message: 'Dependency cycle detected' }] };
  }

  // Require at least one root phase (no dependsOn) so the Gantt has a starting point.
  const hasRoot = phases.some(p => !p.dependsOn || p.dependsOn.length === 0);
  if (!hasRoot) {
    return { ok: false, issues: [{ path: 'phases', message: 'At least one phase without dependsOn is required' }] };
  }

  return { ok: true, data: parsed.data };
}
