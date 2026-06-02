import { describe, it, expect } from 'vitest';
import {
  phaseProgressPct,
  plannedValueToDate,
  indexStatus,
  computeEvm,
} from '../lib/evmCalculations';

describe('phaseProgressPct', () => {
  it('weights by estimate hours when hours are present', () => {
    expect(phaseProgressPct({ earned: 8, est: 20, taskCount: 2, earnedCount: 1 })).toBe(0.4);
  });
  it('falls back to task count when no estimate hours', () => {
    expect(phaseProgressPct({ earned: 0, est: 0, taskCount: 4, earnedCount: 2 })).toBe(0.5);
  });
  it('returns 0 when there is nothing to measure', () => {
    expect(phaseProgressPct({ earned: 0, est: 0, taskCount: 0, earnedCount: 0 })).toBe(0);
    expect(phaseProgressPct(undefined)).toBe(0);
  });
});

describe('plannedValueToDate', () => {
  it('is 0 before the phase starts', () => {
    expect(plannedValueToDate(4, 10, 2, 6000)).toBe(0);
  });
  it('is the full cost after the phase ends', () => {
    expect(plannedValueToDate(0, 10, 12, 6000)).toBe(6000);
  });
  it('is linear in the middle', () => {
    expect(plannedValueToDate(0, 10, 5, 6000)).toBe(3000);
  });
  it('returns null when asOfWeek is null (no schedule)', () => {
    expect(plannedValueToDate(0, 10, null, 6000)).toBeNull();
  });
  it('treats a zero-length phase as fully earned once reached', () => {
    expect(plannedValueToDate(5, 5, 6, 6000)).toBe(6000);
    expect(plannedValueToDate(5, 5, 4, 6000)).toBe(0);
  });
});

describe('indexStatus', () => {
  it('green at or above 1', () => {
    expect(indexStatus(1)).toBe('success');
    expect(indexStatus(1.25)).toBe('success');
  });
  it('amber between 0.9 and 1', () => {
    expect(indexStatus(0.9)).toBe('warning');
    expect(indexStatus(0.95)).toBe('warning');
  });
  it('red below 0.9', () => {
    expect(indexStatus(0.8)).toBe('error');
  });
  it('neutral for null (N/A)', () => {
    expect(indexStatus(null)).toBe('neutral');
  });
});

describe('computeEvm', () => {
  const rates = { INTERNAL_RATE: 80, CONSULTANT_RATES: { Dev: { Senior: 100 } } };
  const project = {
    settings: { startDate: '2026-01-01' },
    phases: [
      {
        id: 'p1',
        name: 'P1',
        durationWeeks: 10,
        teamMembers: [{ role: 'Dev', level: 'Senior', quantity: 1, allocation: 100 }],
      },
    ],
  };
  const progress = { p1: { earned: 8, est: 20, taskCount: 2, earnedCount: 1 } }; // pct 0.4
  const actuals = { p1: { hours: 120, cost: 12000 } };

  it('computes EV/PV/AC and the indices on a worked example', () => {
    const r = computeEvm({ project, rates, progress, actuals, asOfWeek: 5 });
    expect(r.bac).toBe(37500);
    expect(r.pv).toBe(18750);
    expect(r.ev).toBe(15000);
    expect(r.ac).toBe(12000);
    expect(r.spi).toBeCloseTo(0.8, 5);
    expect(r.cpi).toBeCloseTo(1.25, 5);
    expect(r.eac).toBeCloseTo(30000, 5);
    expect(r.etc).toBeCloseTo(18000, 5);
    expect(r.vac).toBeCloseTo(7500, 5);
    expect(r.byPhase).toHaveLength(1);
    expect(r.byPhase[0].phaseId).toBe('p1');
  });

  it('marks PV and SPI as null when there is no start date (asOfWeek null)', () => {
    const r = computeEvm({ project, rates, progress, actuals, asOfWeek: null });
    expect(r.pv).toBeNull();
    expect(r.spi).toBeNull();
    expect(r.ev).toBe(15000);
    expect(r.cpi).toBeCloseTo(1.25, 5);
  });

  it('marks CPI and EAC as null when AC is 0', () => {
    const r = computeEvm({ project, rates, progress, actuals: {}, asOfWeek: 5 });
    expect(r.ac).toBe(0);
    expect(r.cpi).toBeNull();
    expect(r.eac).toBeNull();
    expect(r.etc).toBeNull();
    expect(r.vac).toBeNull();
  });
});
