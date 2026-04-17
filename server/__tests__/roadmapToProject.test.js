import { describe, it, expect } from 'vitest';
import { mapRoadmapToProject } from '../mapping/roadmapToProject.js';

describe('mapRoadmapToProject', () => {
  it('converts durationMonths to durationWeeks (4.33 factor)', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 3 }],
    });
    expect(r.phases[0].durationWeeks).toBe(13);
  });

  it('preserves externalId and startDate', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-42', startDate: '2026-06-01', description: 'hi' },
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1 }],
    });
    expect(r.externalId).toBe('RM-42');
    expect(r.settings.startDate).toBe('2026-06-01');
    expect(r.description).toBe('hi');
  });

  it('stores dependsOn on each phase', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [
        { id: 'a', name: 'A', order: 1, durationMonths: 1 },
        { id: 'b', name: 'B', order: 2, durationMonths: 1, dependsOn: ['a'] },
      ],
    });
    expect(r.phases[0].dependsOn).toEqual([]);
    expect(r.phases[1].dependsOn).toEqual(['a']);
  });

  it('uses explicit dates to compute durationWeeks when both provided', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [{
        id: 'a', name: 'A', order: 1, durationMonths: 1,
        startDate: '2026-06-01', endDate: '2026-09-01',
      }],
    });
    expect(r.phases[0].durationWeeks).toBe(13);
  });

  it('sorts phases by order', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [
        { id: 'b', name: 'B', order: 2, durationMonths: 1 },
        { id: 'a', name: 'A', order: 1, durationMonths: 1 },
      ],
    });
    expect(r.phases.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('initializes empty teamMembers per phase', () => {
    const r = mapRoadmapToProject({
      project: { name: 'P', externalId: 'RM-1', startDate: '2026-06-01' },
      phases: [{ id: 'a', name: 'A', order: 1, durationMonths: 1 }],
    });
    expect(r.phases[0].teamMembers).toEqual([]);
  });
});
