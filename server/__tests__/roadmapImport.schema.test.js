import { describe, it, expect } from 'vitest';
import { validateRoadmapImport } from '../schemas/roadmapImport.js';

const valid = {
  project: { name: 'Test', externalId: 'RM-1', startDate: '2026-06-01' },
  phases: [
    { id: 'a', name: 'A', order: 1, durationMonths: 2 },
    { id: 'b', name: 'B', order: 2, durationMonths: 3, dependsOn: ['a'] },
  ],
};

describe('roadmap import schema', () => {
  it('accepts minimal valid payload', () => {
    expect(validateRoadmapImport(valid).ok).toBe(true);
  });

  it('rejects missing project.name', () => {
    const r = validateRoadmapImport({ ...valid, project: { externalId: 'x', startDate: '2026-06-01' } });
    expect(r.ok).toBe(false);
  });

  it('rejects invalid startDate format', () => {
    const r = validateRoadmapImport({ ...valid, project: { ...valid.project, startDate: '06/01/2026' } });
    expect(r.ok).toBe(false);
  });

  it('rejects duplicate phase ids', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [
        { id: 'a', name: 'A', order: 1, durationMonths: 1 },
        { id: 'a', name: 'B', order: 2, durationMonths: 1 },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.message.includes('duplicate'))).toBe(true);
  });

  it('rejects dangling dependency', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1, dependsOn: ['ghost'] }],
    });
    expect(r.ok).toBe(false);
  });

  it('rejects cycles', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [
        { id: 'a', name: 'A', order: 1, durationMonths: 1, dependsOn: ['b'] },
        { id: 'b', name: 'B', order: 2, durationMonths: 1, dependsOn: ['a'] },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some(i => i.message.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('rejects endDate before startDate', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1, startDate: '2026-06-10', endDate: '2026-06-01' }],
    });
    expect(r.ok).toBe(false);
  });

  it('accepts explicit dates', () => {
    const r = validateRoadmapImport({
      ...valid,
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1, startDate: '2026-06-01', endDate: '2026-07-01' }],
    });
    expect(r.ok).toBe(true);
  });
});
