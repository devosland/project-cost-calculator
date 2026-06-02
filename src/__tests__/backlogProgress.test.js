import { describe, it, expect } from 'vitest';
import { rollupProgress } from '../lib/backlogProgress';

const cat = { 'To Do': 'todo', 'In Progress': 'inprogress', Done: 'done' };

describe('rollupProgress', () => {
  it('weights done=1, inprogress=0.5, todo=0 (count-based)', () => {
    const r = rollupProgress(
      [{ status: 'Done' }, { status: 'In Progress' }, { status: 'To Do' }],
      cat,
    );
    expect(r.total).toBe(3);
    expect(r.done).toBe(1);
    expect(r.earned).toBe(1.5); // 1 + 0.5 + 0
    expect(r.pct).toBeCloseTo(0.5); // 1.5 / 3
  });

  it('treats unknown statuses as not started', () => {
    const r = rollupProgress([{ status: 'Mystère' }, { status: 'Done' }], cat);
    expect(r.earned).toBe(1);
    expect(r.pct).toBeCloseTo(0.5);
  });

  it('returns pct 0 and total 0 for an empty list', () => {
    const r = rollupProgress([], cat);
    expect(r).toEqual({ done: 0, earned: 0, total: 0, pct: 0 });
  });
});
