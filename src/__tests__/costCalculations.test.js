/**
 * First tests for the cost module, anchored on review finding B4 (2026-06-12):
 * a constrained member whose window does not overlap the phase's calendar
 * window must contribute 0 weeks — previously their raw window duration was
 * billed as if it sat inside the phase.
 */
import { describe, it, expect } from 'vitest';
import {
  getMemberOverlapWeeks,
  calculatePhaseTotalCost,
  calculatePhaseWeeklyCost,
  calculateLabourCost,
  monthDiffInWeeks,
} from '../lib/costCalculations';

const RATES = {
  INTERNAL_RATE: 50,
  CONSULTANT_RATES: { 'Développeur Frontend': { 'Sénior': 100 } },
};

const internal = (overrides = {}) => ({
  role: 'Développeur Frontend',
  level: 'Employé interne',
  quantity: 1,
  allocation: 100,
  ...overrides,
});

describe('getMemberOverlapWeeks', () => {
  // Phase window: weeks [4, 8) of a project starting 2026-01 (≈ February).
  const PHASE_START = 4;
  const PHASE_WEEKS = 4;
  const PROJECT_START = '2026-01';

  it('returns 0 when the member window ends before the phase starts (B4 repro)', () => {
    const m = internal({ startMonth: '2026-01', endMonth: '2026-01' }); // weeks [0, 4)
    expect(getMemberOverlapWeeks(m, PHASE_START, PHASE_WEEKS, PROJECT_START)).toBe(0);
  });

  it('returns 0 when the member window starts after the phase ends', () => {
    const m = internal({ startMonth: '2026-06', endMonth: '2026-08' });
    expect(getMemberOverlapWeeks(m, PHASE_START, PHASE_WEEKS, PROJECT_START)).toBe(0);
  });

  it('returns the full phase duration when the member covers it entirely', () => {
    const m = internal({ startMonth: '2026-01', endMonth: '2026-12' });
    expect(getMemberOverlapWeeks(m, PHASE_START, PHASE_WEEKS, PROJECT_START)).toBe(PHASE_WEEKS);
  });

  it('returns the partial overlap when windows intersect', () => {
    // Member: 2026-02 only → weeks [4, 9). Phase: [4, 8) → overlap 4.
    const m = internal({ startMonth: '2026-02', endMonth: '2026-02' });
    expect(getMemberOverlapWeeks(m, PHASE_START, PHASE_WEEKS, PROJECT_START)).toBe(4);
  });

  it('clamps a member window that starts before the project start', () => {
    const m = internal({ startMonth: '2025-06', endMonth: '2026-12' });
    expect(getMemberOverlapWeeks(m, PHASE_START, PHASE_WEEKS, PROJECT_START)).toBe(PHASE_WEEKS);
  });
});

describe('calculatePhaseTotalCost', () => {
  const phase = (members) => ({ id: 'ph1', durationWeeks: 4, teamMembers: members });

  it('keeps the legacy duration-based proration without a schedule context', () => {
    const m = internal({ startMonth: '2026-01', endMonth: '2026-01' });
    const weekly = calculatePhaseWeeklyCost(phase([m]), RATES);
    const expectedWeeks = Math.min(monthDiffInWeeks('2026-01', '2026-01'), 4); // 0 — degenerate but pinned
    expect(calculatePhaseTotalCost(phase([m]), RATES)).toBe(weekly * expectedWeeks);
  });

  it('bills 0 for a constrained member fully outside the phase window (B4)', () => {
    const m = internal({ startMonth: '2026-01', endMonth: '2026-03' }); // weeks [0, 13)
    const schedCtx = { projectStartMonth: '2026-01', phaseStartWeek: 26 }; // phase ≈ July
    expect(calculatePhaseTotalCost(phase([m]), RATES, schedCtx)).toBe(0);
  });

  it('still bills unconstrained members for the full phase, constrained for the overlap', () => {
    const free = internal();
    const constrained = internal({ startMonth: '2026-02', endMonth: '2026-02' }); // weeks [4, 9)
    const p = phase([free, constrained]);
    const weeklyEach = calculatePhaseWeeklyCost(phase([free]), RATES);
    const schedCtx = { projectStartMonth: '2026-01', phaseStartWeek: 4 }; // phase [4, 8)
    // free: 4 weeks ; constrained: overlap 4 weeks
    expect(calculatePhaseTotalCost(p, RATES, schedCtx)).toBe(weeklyEach * 4 + weeklyEach * 4);
  });
});

describe('calculateLabourCost — calendar-aware aggregation (B4)', () => {
  it('drops out-of-window member cost when the project has a start date', () => {
    // Two sequential 4-week phases starting 2026-01: ph1 [0,4), ph2 [4,8).
    const member = internal({ startMonth: '2026-01', endMonth: '2026-01' }); // weeks [0,4)
    const project = {
      settings: { startDate: '2026-01' },
      phases: [
        { id: 'ph1', durationWeeks: 4, teamMembers: [] },
        { id: 'ph2', durationWeeks: 4, teamMembers: [member] },
      ],
    };
    // The member's window covers ph1 only — they contribute nothing to ph2.
    expect(calculateLabourCost(project, RATES)).toBe(0);

    // Same project without a start date: legacy duration-based proration.
    const legacy = { ...project, settings: {} };
    const weekly = calculatePhaseWeeklyCost({ teamMembers: [member] }, RATES);
    expect(calculateLabourCost(legacy, RATES)).toBe(weekly * Math.min(monthDiffInWeeks('2026-01', '2026-01'), 4));
  });
});
