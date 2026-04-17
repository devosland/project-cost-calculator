import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid ISO 8601 date (YYYY-MM-DD expected)');

const phaseSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-_]*$/i, 'id must be slug-like'),
  name: z.string().min(1).max(100),
  order: z.number().int().positive(),
  durationMonths: z.number().positive(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
  dependsOn: z.array(z.string()).optional(),
  description: z.string().max(1000).optional(),
}).refine(
  p => !(p.startDate && p.endDate) || p.endDate > p.startDate,
  { message: 'endDate must be after startDate', path: ['endDate'] }
);

const payloadSchema = z.object({
  project: z.object({
    name: z.string().min(1).max(200),
    externalId: z.string().min(1).max(100),
    startDate: isoDate,
    description: z.string().max(2000).optional(),
  }),
  phases: z.array(phaseSchema).min(1),
});

function detectCycles(phases) {
  const adj = new Map(phases.map(p => [p.id, p.dependsOn || []]));
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map(phases.map(p => [p.id, WHITE]));

  function dfs(node) {
    color.set(node, GRAY);
    for (const next of adj.get(node) || []) {
      const c = color.get(next);
      if (c === GRAY) return true;
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

  for (let i = 0; i < phases.length; i++) {
    if (ids.has(phases[i].id)) {
      issues.push({ path: `phases.${i}.id`, message: `duplicate id "${phases[i].id}"` });
    }
    ids.add(phases[i].id);
  }

  for (let i = 0; i < phases.length; i++) {
    for (let j = 0; j < (phases[i].dependsOn || []).length; j++) {
      const ref = phases[i].dependsOn[j];
      if (!ids.has(ref)) {
        issues.push({ path: `phases.${i}.dependsOn.${j}`, message: `References unknown phase id "${ref}"` });
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  if (detectCycles(phases)) {
    return { ok: false, issues: [{ path: 'phases', message: 'Dependency cycle detected' }] };
  }

  const hasRoot = phases.some(p => !p.dependsOn || p.dependsOn.length === 0);
  if (!hasRoot) {
    return { ok: false, issues: [{ path: 'phases', message: 'At least one phase without dependsOn is required' }] };
  }

  return { ok: true, data: parsed.data };
}
