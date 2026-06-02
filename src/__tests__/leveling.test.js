import { describe, it, expect } from 'vitest';
import { suggestLeveling } from '../lib/leveling';

const dev = (alloc) => [{ role: 'Dev', level: 'Senior', quantity: 1, allocation: alloc }];

describe('suggestLeveling', () => {
  it('suggests delaying the floated phase to resolve an overlap over 100%', () => {
    const s = suggestLeveling({ phases: [
      { id: 'x', name: 'X', durationWeeks: 2, teamMembers: dev(60) },
      { id: 'w', name: 'W', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }], teamMembers: [] },
      { id: 'y', name: 'Y', durationWeeks: 2, teamMembers: dev(60) },
    ] });
    expect(s).toHaveLength(1);
    expect(s[0].phaseId).toBe('y');
    expect(s[0].delayWeeks).toBe(2);
    expect(s[0].newStart).toBe(2);
    expect(s[0].role).toBe('Dev');
    expect(s[0].level).toBe('Senior');
  });
  it('no suggestion when phases do not overlap', () => {
    const s = suggestLeveling({ phases: [
      { id: 'a', name: 'A', durationWeeks: 2, teamMembers: dev(60) },
      { id: 'b', name: 'B', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FS', lag: 0 }], teamMembers: dev(60) },
    ] });
    expect(s).toEqual([]);
  });
  it('no suggestion when combined allocation is within 100%', () => {
    const s = suggestLeveling({ phases: [
      { id: 'x', name: 'X', durationWeeks: 2, teamMembers: dev(50) },
      { id: 'w', name: 'W', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }], teamMembers: [] },
      { id: 'y', name: 'Y', durationWeeks: 2, teamMembers: dev(50) },
    ] });
    expect(s).toEqual([]);
  });
  it('no suggestion when both overlapping phases are critical', () => {
    const s = suggestLeveling({ phases: [
      { id: 'x', name: 'X', durationWeeks: 2, teamMembers: dev(60) },
      { id: 'y', name: 'Y', durationWeeks: 2, teamMembers: dev(60) },
      { id: 'z', name: 'Z', durationWeeks: 2, dependencies: [{ id: 'x', type: 'FS', lag: 0 }, { id: 'y', type: 'FS', lag: 0 }], teamMembers: [] },
    ] });
    expect(s).toEqual([]);
  });
});
