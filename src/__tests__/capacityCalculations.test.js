import { describe, it, expect } from 'vitest';
import {
  weekToMonth,
  getMonthRange,
  calculateUtilization,
  calculateTransitionCostImpact,
  getMonthlyCapacity,
  capacityStatus,
} from '../lib/capacityCalculations';

describe('weekToMonth', () => {
  it('returns the same month for week offset 0', () => {
    expect(weekToMonth('2026-01', 0)).toBe('2026-01');
  });

  it('stays in the same month for week 4 (28 days from Jan 1)', () => {
    expect(weekToMonth('2026-01', 4)).toBe('2026-01');
  });

  it('moves to next month for week 5 (35 days from Jan 1)', () => {
    expect(weekToMonth('2026-01', 5)).toBe('2026-02');
  });

  it('handles year boundary', () => {
    expect(weekToMonth('2026-11', 9)).toBe('2027-01');
  });

  it('basic mid-year conversion', () => {
    expect(weekToMonth('2026-06', 2)).toBe('2026-06');
  });
});

describe('getMonthRange', () => {
  it('returns inclusive range of months', () => {
    expect(getMonthRange('2026-01', '2026-04')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
  });

  it('returns single month when start equals end', () => {
    expect(getMonthRange('2026-03', '2026-03')).toEqual(['2026-03']);
  });

  it('handles year boundary', () => {
    expect(getMonthRange('2026-11', '2027-02')).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
    ]);
  });
});

describe('calculateUtilization', () => {
  const assignments = [
    { resource_id: 1, start_month: '2026-01', end_month: '2026-03', allocation: 50 },
    { resource_id: 1, start_month: '2026-02', end_month: '2026-04', allocation: 30 },
    { resource_id: 2, start_month: '2026-01', end_month: '2026-06', allocation: 100 },
  ];

  it('returns allocation for a single overlapping assignment', () => {
    expect(calculateUtilization(assignments, 1, '2026-01')).toBe(50);
  });

  it('sums overlapping assignments for the same resource', () => {
    expect(calculateUtilization(assignments, 1, '2026-02')).toBe(80);
  });

  it('returns 0 when no assignments match', () => {
    expect(calculateUtilization(assignments, 1, '2026-05')).toBe(0);
  });

  it('returns 0 for unknown resource', () => {
    expect(calculateUtilization(assignments, 99, '2026-01')).toBe(0);
  });

  it('includes boundary months', () => {
    expect(calculateUtilization(assignments, 1, '2026-03')).toBe(80);
  });
});

describe('calculateTransitionCostImpact', () => {
  // Consultant Sénior at 95$/h, replacement Employé interne at 55$/h
  // 100% allocation, 20 weeks remaining, 2 weeks overlap
  const HOURS_PER_WEEK = 37.5;
  const rates = {
    CONSULTANT_RATES: {
      'Développeur Full-Stack': { 'Sénior': 95 },
    },
    INTERNAL_RATE: 55,
  };

  const params = {
    consultantRole: 'Développeur Full-Stack',
    consultantLevel: 'Sénior',
    replacementRole: 'Développeur Full-Stack',
    replacementLevel: 'Employé interne',
    allocation: 100,
    remainingWeeks: 20,
    overlapWeeks: 2,
    rates,
  };

  it('calculates consultantCost correctly', () => {
    const result = calculateTransitionCostImpact(params);
    // 95 * 37.5 * 20 * 1 = 71250
    expect(result.consultantCost).toBe(95 * HOURS_PER_WEEK * 20);
  });

  it('calculates replacementCost correctly', () => {
    const result = calculateTransitionCostImpact(params);
    // 55 * 37.5 * 20 * 1 = 41250
    expect(result.replacementCost).toBe(55 * HOURS_PER_WEEK * 20);
  });

  it('calculates overlapCost correctly', () => {
    const result = calculateTransitionCostImpact(params);
    // (95 + 55) * 37.5 * 2 * 1 = 11250
    expect(result.overlapCost).toBe((95 + 55) * HOURS_PER_WEEK * 2);
  });

  it('calculates savings correctly', () => {
    const result = calculateTransitionCostImpact(params);
    // savings = consultantCost - replacementCost - overlapCost
    // 71250 - 41250 - 11250 = 18750
    const expectedSavings =
      95 * HOURS_PER_WEEK * 20 - 55 * HOURS_PER_WEEK * 20 - (95 + 55) * HOURS_PER_WEEK * 2;
    expect(result.savings).toBe(expectedSavings);
  });

  it('calculates annualSavings correctly', () => {
    const result = calculateTransitionCostImpact(params);
    // (95 - 55) * 37.5 * 52 * 1 = 78000
    expect(result.annualSavings).toBe((95 - 55) * HOURS_PER_WEEK * 52);
  });
});

describe('getMonthlyCapacity', () => {
  const overrides = [
    { resource_id: 1, month: '2026-03', available_pct: 50 },
    { resource_id: 1, month: '2026-07', available_pct: 0 },
    { resource_id: 2, month: '2026-03', available_pct: 80 },
  ];

  it('returns the override when one exists for that resource/month', () => {
    expect(getMonthlyCapacity(1, '2026-03', overrides, 100)).toBe(50);
    expect(getMonthlyCapacity(1, '2026-07', overrides, 100)).toBe(0);
  });

  it('falls back to base capacity when no override exists', () => {
    expect(getMonthlyCapacity(1, '2026-04', overrides, 100)).toBe(100);
    expect(getMonthlyCapacity(2, '2026-04', overrides, 60)).toBe(60);
  });

  it('defaults base capacity to 100 when undefined', () => {
    expect(getMonthlyCapacity(3, '2026-01', overrides, undefined)).toBe(100);
  });

  it('matches resource ids regardless of string/number type', () => {
    expect(getMonthlyCapacity('1', '2026-03', overrides, 100)).toBe(50);
  });
});

describe('time-phased over-allocation', () => {
  const assignments = [
    { resource_id: 1, allocation: 60, start_month: '2026-03', end_month: '2026-03' },
  ];

  it('flags over-allocation when demand exceeds reduced availability', () => {
    const overrides = [{ resource_id: 1, month: '2026-03', available_pct: 50 }];
    const demand = calculateUtilization(assignments, 1, '2026-03'); // 60
    const capacity = getMonthlyCapacity(1, '2026-03', overrides, 100); // 50
    expect(demand > capacity).toBe(true);
  });

  it('does not flag when demand is within base capacity and no override', () => {
    const demand = calculateUtilization(assignments, 1, '2026-03'); // 60
    const capacity = getMonthlyCapacity(1, '2026-03', [], 100); // 100
    expect(demand > capacity).toBe(false);
  });
});

describe('capacityStatus', () => {
  it('returns success well under capacity', () => {
    expect(capacityStatus(40, 100)).toBe('success');
    expect(capacityStatus(0, 100)).toBe('success');
  });

  it('returns warning in the 80-99% band (inclusive of 80)', () => {
    expect(capacityStatus(80, 100)).toBe('warning');
    expect(capacityStatus(99, 100)).toBe('warning');
  });

  it('returns error at or above 100% utilization', () => {
    expect(capacityStatus(100, 100)).toBe('error');
    expect(capacityStatus(120, 100)).toBe('error');
  });

  it('respects reduced capacity (part-time / vacation months)', () => {
    expect(capacityStatus(60, 50)).toBe('error'); // 120% util
    expect(capacityStatus(40, 50)).toBe('warning'); // 80% util
    expect(capacityStatus(30, 50)).toBe('success'); // 60% util
  });

  it('handles zero capacity', () => {
    expect(capacityStatus(10, 0)).toBe('error');
    expect(capacityStatus(0, 0)).toBe('success');
  });
});
