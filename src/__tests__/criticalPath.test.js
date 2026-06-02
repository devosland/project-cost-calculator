import { describe, it, expect } from 'vitest';
import { calculateCriticalPath } from '../lib/criticalPath';

function proj(phases) {
  return { phases };
}

describe('calculateCriticalPath', () => {
  it('FS chain → all critical, zero float', () => {
    const { byPhase } = calculateCriticalPath(proj([
      { id: 'a', durationWeeks: 2 },
      { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      { id: 'c', durationWeeks: 4, dependencies: [{ id: 'b', type: 'FS', lag: 0 }] },
    ]));
    for (const id of ['a', 'b', 'c']) {
      expect(byPhase[id].critical).toBe(true);
      expect(byPhase[id].totalFloat).toBe(0);
    }
  });

  it('parallel branches: shorter branch has float, longer is critical', () => {
    const { totalWeeks, byPhase } = calculateCriticalPath(proj([
      { id: 'a', durationWeeks: 2 },
      { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      { id: 'c', durationWeeks: 5, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      { id: 'd', durationWeeks: 2, dependencies: [{ id: 'b', type: 'FS', lag: 0 }, { id: 'c', type: 'FS', lag: 0 }] },
    ]));
    expect(totalWeeks).toBe(9);
    expect(byPhase.a.critical).toBe(true);
    expect(byPhase.c.critical).toBe(true);
    expect(byPhase.d.critical).toBe(true);
    expect(byPhase.b.critical).toBe(false);
    expect(byPhase.b.totalFloat).toBe(2);
  });

  it('early dates match the scheduler', () => {
    const { byPhase } = calculateCriticalPath(proj([
      { id: 'a', durationWeeks: 2 },
      { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
    ]));
    expect(byPhase.a.earlyStart).toBe(0);
    expect(byPhase.a.earlyEnd).toBe(2);
    expect(byPhase.b.earlyStart).toBe(2);
    expect(byPhase.b.earlyEnd).toBe(5);
  });

  it('SS predecessor that defines the makespan stays critical (lateEnd capped at totalWeeks)', () => {
    const { totalWeeks, byPhase } = calculateCriticalPath(proj([
      { id: 'a', durationWeeks: 4 },
      { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'SS', lag: 0 }] },
    ]));
    expect(totalWeeks).toBe(4);
    expect(byPhase.a.critical).toBe(true);
    expect(byPhase.a.totalFloat).toBe(0);
    expect(byPhase.b.critical).toBe(false);
    expect(byPhase.b.totalFloat).toBe(2);
  });

  it('FF dependency: successor pinned to predecessor finish', () => {
    const { totalWeeks, byPhase } = calculateCriticalPath(proj([
      { id: 'a', durationWeeks: 6 },
      { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FF', lag: 0 }] },
    ]));
    expect(totalWeeks).toBe(6);
    expect(byPhase.b.earlyStart).toBe(4);
    expect(byPhase.a.critical).toBe(true);
    expect(byPhase.b.critical).toBe(true);
  });

  it('lag on a non-critical branch reduces its float', () => {
    const { byPhase } = calculateCriticalPath(proj([
      { id: 'a', durationWeeks: 2 },
      { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 1 }] },
      { id: 'c', durationWeeks: 5, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      { id: 'd', durationWeeks: 2, dependencies: [{ id: 'b', type: 'FS', lag: 0 }, { id: 'c', type: 'FS', lag: 0 }] },
    ]));
    expect(byPhase.b.totalFloat).toBe(1);
  });

  it('cycle → all critical, zero float', () => {
    const { byPhase } = calculateCriticalPath(proj([
      { id: 'a', durationWeeks: 2, dependencies: [{ id: 'b', type: 'FS', lag: 0 }] },
      { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
    ]));
    expect(byPhase.a.critical).toBe(true);
    expect(byPhase.b.critical).toBe(true);
    expect(byPhase.a.totalFloat).toBe(0);
  });

  it('no dependencies → all critical, zero float', () => {
    const { byPhase } = calculateCriticalPath(proj([
      { id: 'a', durationWeeks: 2 },
      { id: 'b', durationWeeks: 3 },
    ]));
    expect(byPhase.a.critical).toBe(true);
    expect(byPhase.b.critical).toBe(true);
  });
});
