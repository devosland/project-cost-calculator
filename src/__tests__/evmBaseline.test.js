import { describe, it, expect } from 'vitest';
import { computeEvm, buildBaseline } from '../lib/evmCalculations';

const rates = { INTERNAL_RATE: 100, CONSULTANT_RATES: {} };

describe('buildBaseline', () => {
  it('snapshots per-phase schedule + cost + capturedAt + startDate', () => {
    const project = {
      settings: { startDate: '2026-01' },
      phases: [{ id: 'p1', name: 'P1', durationWeeks: 4, teamMembers: [] }],
    };
    const bl = buildBaseline(project, rates, '2026-06-02');
    expect(bl.capturedAt).toBe('2026-06-02');
    expect(bl.startDate).toBe('2026-01');
    expect(bl.phases.p1.startWeek).toBe(0);
    expect(bl.phases.p1.endWeek).toBe(4);
    expect(bl.phases.p1).toHaveProperty('bac');
  });
});

describe('computeEvm with a frozen baseline', () => {
  // Phase à équipe vide → coût vivant 0 ; la baseline fige bac=1000.
  const project = {
    settings: { startDate: '2026-01' },
    baseline: {
      capturedAt: '2026-06-02',
      startDate: '2026-01',
      phases: { p1: { startWeek: 0, endWeek: 4, bac: 1000 } },
    },
    phases: [{ id: 'p1', name: 'P1', durationWeeks: 4, teamMembers: [] }],
  };

  it('measures PV/BAC/EV against the baseline, not the live plan', () => {
    const evm = computeEvm({
      project,
      rates,
      progress: { p1: { earned: 1, est: 2 } }, // pct 0.5
      actuals: { p1: { cost: 400 } },
      asOfWeek: 2, // mi-parcours
    });
    expect(evm.bac).toBe(1000); // budget baseline, pas le coût vivant (0)
    expect(evm.pv).toBe(500); // 1000 * 2/4
    expect(evm.ev).toBe(500); // 0.5 * 1000
    expect(evm.spi).toBe(1); // 500/500
    expect(evm.cpi).toBeCloseTo(1.25); // 500/400
    expect(evm.hasBaseline).toBe(true);
    expect(evm.baselineCapturedAt).toBe('2026-06-02');
  });

  it('falls back to the live plan when there is no baseline (regression)', () => {
    const live = { settings: { startDate: '2026-01' }, phases: project.phases };
    const evm = computeEvm({
      project: live,
      rates,
      progress: { p1: { earned: 1, est: 2 } },
      actuals: {},
      asOfWeek: 2,
    });
    expect(evm.bac).toBe(0); // coût vivant (équipe vide)
    expect(evm.hasBaseline).toBe(false);
    expect(evm.baselineCapturedAt).toBe(null);
  });
});
