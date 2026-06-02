import { describe, it, expect } from 'vitest';
import { applyConstraint, calculateProjectDurationWithDependencies } from '../lib/costCalculations';

describe('applyConstraint', () => {
  it('passthrough without a constraint (= SP1 behaviour)', () => {
    expect(applyConstraint(3, 4, undefined)).toEqual({ start: 3, end: 7, conflict: null });
  });
  it('SNET raises the start to the floor', () => {
    expect(applyConstraint(2, 4, { type: 'SNET', week: 5 })).toEqual({ start: 5, end: 9, conflict: null });
  });
  it('SNET below the dependency start is a no-op', () => {
    expect(applyConstraint(6, 4, { type: 'SNET', week: 2 })).toEqual({ start: 6, end: 10, conflict: null });
  });
  it('MSO forces the start and flags a conflict if deps wanted later', () => {
    expect(applyConstraint(8, 3, { type: 'MSO', week: 5 })).toEqual({ start: 5, end: 8, conflict: 'MSO' });
    expect(applyConstraint(2, 3, { type: 'MSO', week: 5 })).toEqual({ start: 5, end: 8, conflict: null });
  });
  it('MFO forces the finish (start = week - duration) and flags a conflict', () => {
    expect(applyConstraint(2, 3, { type: 'MFO', week: 10 })).toEqual({ start: 7, end: 10, conflict: null });
    expect(applyConstraint(9, 3, { type: 'MFO', week: 10 })).toEqual({ start: 7, end: 10, conflict: 'MFO' });
  });
  it('FNLT flags a conflict only when the finish exceeds the deadline', () => {
    expect(applyConstraint(2, 3, { type: 'FNLT', week: 10 })).toEqual({ start: 2, end: 5, conflict: null });
    expect(applyConstraint(9, 3, { type: 'FNLT', week: 10 })).toEqual({ start: 9, end: 12, conflict: 'FNLT' });
  });
  it('clamps the start to 0', () => {
    expect(applyConstraint(2, 3, { type: 'MFO', week: 1 }).start).toBe(0);
  });
});

describe('scheduler honours constraints', () => {
  it('SNET on a phase propagates to its dependents', () => {
    const { phaseSchedule, conflicts } = calculateProjectDurationWithDependencies({
      phases: [
        { id: 'a', durationWeeks: 2, constraint: { type: 'SNET', week: 4 } },
        { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      ],
    });
    const m = Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));
    expect(m.a).toEqual({ phaseId: 'a', startWeek: 4, endWeek: 6 });
    expect(m.b).toEqual({ phaseId: 'b', startWeek: 6, endWeek: 9 });
    expect(conflicts).toEqual({});
  });
  it('records a conflict in the additive conflicts map', () => {
    const { conflicts } = calculateProjectDurationWithDependencies({
      phases: [
        { id: 'a', durationWeeks: 4 },
        { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FS', lag: 0 }], constraint: { type: 'MSO', week: 1 } },
      ],
    });
    expect(conflicts.b).toBe('MSO');
  });
  it('no constraint anywhere → unchanged shape (conflicts empty)', () => {
    const { phaseSchedule, conflicts } = calculateProjectDurationWithDependencies({
      phases: [{ id: 'a', durationWeeks: 2 }, { id: 'b', durationWeeks: 3 }],
    });
    expect(conflicts).toEqual({});
    expect(phaseSchedule).toEqual([
      { phaseId: 'a', startWeek: 0, endWeek: 2 },
      { phaseId: 'b', startWeek: 2, endWeek: 5 },
    ]);
  });
});
