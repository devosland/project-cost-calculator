import { describe, it, expect } from 'vitest';
import {
  normalizeDependency,
  calculateProjectDurationWithDependencies,
} from '../lib/costCalculations';

/** Build a minimal project from phase specs. */
function proj(phases) {
  return { phases };
}
/** Schedule lookup helper. */
function sched(project) {
  const { phaseSchedule } = calculateProjectDurationWithDependencies(project);
  return Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));
}

describe('normalizeDependency', () => {
  it('turns a string into an FS/0 object', () => {
    expect(normalizeDependency('p1')).toEqual({ id: 'p1', type: 'FS', lag: 0 });
  });
  it('fills defaults on a partial object', () => {
    expect(normalizeDependency({ id: 'p1' })).toEqual({ id: 'p1', type: 'FS', lag: 0 });
  });
  it('keeps a valid type and lag', () => {
    expect(normalizeDependency({ id: 'p1', type: 'SS', lag: 3 })).toEqual({ id: 'p1', type: 'SS', lag: 3 });
  });
  it('falls back to FS on an invalid type and 0 on a non-finite lag', () => {
    expect(normalizeDependency({ id: 'p1', type: 'XX', lag: 'nope' })).toEqual({ id: 'p1', type: 'FS', lag: 0 });
  });
});

describe('calculateProjectDurationWithDependencies — typed + lag', () => {
  it('no dependencies → sequential (unchanged)', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 4 },
      { id: 'b', durationWeeks: 6 },
    ]));
    expect(s.a).toEqual({ phaseId: 'a', startWeek: 0, endWeek: 4 });
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 4, endWeek: 10 });
  });

  it('FS lag 0 (string dep) reproduces current behaviour', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 4 },
      { id: 'b', durationWeeks: 6, dependencies: ['a'] },
    ]));
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 4, endWeek: 10 });
  });

  it('FS with positive lag delays the successor', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 4 },
      { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'FS', lag: 2 }] },
    ]));
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 6, endWeek: 12 });
  });

  it('FS with negative lag (lead) pulls the successor earlier', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 4 },
      { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'FS', lag: -1 }] },
    ]));
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 3, endWeek: 9 });
  });

  it('SS aligns starts (plus lag)', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }] },
      { id: 'x', durationWeeks: 5 },
      { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'SS', lag: 1 }] },
    ]));
    // x:{0,5}; a FS on x → {5,9}; b SS+1 on a → start = a.start(5)+1 = 6
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 6, endWeek: 12 });
  });

  it('FF aligns finishes (plus lag)', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 6 },
      { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FF', lag: 0 }] },
    ]));
    // b.end >= a.end(6) → b.start = 6 - 2 = 4
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 4, endWeek: 6 });
  });

  it('SF: successor finishes at predecessor start (plus lag)', () => {
    const s = sched(proj([
      { id: 'x', durationWeeks: 5 },
      { id: 'a', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }] },
      { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'SF', lag: 0 }] },
    ]));
    // x:{0,5}; a:{5,9}; b SF on a → b.end >= a.start(5) → b.start = 5 - 2 = 3
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 3, endWeek: 5 });
  });

  it('SF with a positive lag shifts the successor finish', () => {
    const s = sched(proj([
      { id: 'x', durationWeeks: 5 },
      { id: 'a', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }] },
      { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'SF', lag: 2 }] },
    ]));
    // x:{0,5}; a:{5,9}; b SF+2 on a → candidate = a.start(5) + 2 - dur(2) = 5 → b:{5,7}
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 5, endWeek: 7 });
  });

  it('clamps start to 0 when a lead would go negative', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 4 },
      { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'SS', lag: -10 }] },
    ]));
    // a.start(0) + (-10) = -10 → clamp 0
    expect(s.b.startWeek).toBe(0);
  });

  it('takes the max across multiple mixed dependencies', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 4 },
      { id: 'b', durationWeeks: 3 },
      { id: 'c', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FS', lag: 0 }, { id: 'b', type: 'SS', lag: 5 }] },
    ]));
    // dependency mode: a and b have no deps → both start at week 0 (a:{0,4}, b:{0,3}).
    // c: max(FS a → a.end 4, SS b → b.start(0)+5 = 5) = 5
    expect(s.c).toEqual({ phaseId: 'c', startWeek: 5, endWeek: 7 });
  });

  it('handles a mix of string and object deps on the same phase', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 4 },
      { id: 'b', durationWeeks: 3 },
      { id: 'c', durationWeeks: 2, dependencies: ['a', { id: 'b', type: 'FS', lag: 0 }] },
    ]));
    // dependency mode: a:{0,4}, b:{0,3} (no deps → start 0). c: max(FS a → 4, FS b → 3) = 4
    expect(s.c).toEqual({ phaseId: 'c', startWeek: 4, endWeek: 6 });
  });

  it('falls back to sequential on a cycle', () => {
    const s = sched(proj([
      { id: 'a', durationWeeks: 4, dependencies: [{ id: 'b', type: 'FS', lag: 0 }] },
      { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
    ]));
    // cycle → sequential: a:{0,4}, b:{4,10}
    expect(s.a).toEqual({ phaseId: 'a', startWeek: 0, endWeek: 4 });
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 4, endWeek: 10 });
  });
});
