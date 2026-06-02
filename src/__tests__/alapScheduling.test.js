import { describe, it, expect } from 'vitest';
import { calculateProjectDurationWithDependencies } from '../lib/costCalculations';

describe('ALAP scheduling', () => {
  // A(1) et Long(4) → End(1). A a de la marge (0..3) ; Long est critique.
  const base = () => [
    { id: 'a', name: 'A', durationWeeks: 1 },
    { id: 'long', name: 'Long', durationWeeks: 4 },
    {
      id: 'end',
      name: 'End',
      durationWeeks: 1,
      dependencies: [
        { id: 'a', type: 'FS', lag: 0 },
        { id: 'long', type: 'FS', lag: 0 },
      ],
    },
  ];

  it('pins an ALAP phase with float to its late start (just-in-time)', () => {
    const phases = base();
    phases[0].constraint = { type: 'ALAP' };
    const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies({ phases });
    const a = phaseSchedule.find((s) => s.phaseId === 'a');
    expect(a.startWeek).toBe(3); // late start (End a besoin de A en semaine 4)
    expect(a.endWeek).toBe(4);
    expect(totalWeeks).toBe(5); // inchangé
  });

  it('leaves a critical ALAP phase and totalWeeks unchanged', () => {
    const phases = base();
    phases[1].constraint = { type: 'ALAP' }; // Long est critique (marge 0)
    const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies({ phases });
    const long = phaseSchedule.find((s) => s.phaseId === 'long');
    expect(long.startWeek).toBe(0);
    expect(totalWeeks).toBe(5);
  });

  it('is a no-op for projects without any ALAP phase (regression)', () => {
    const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies({
      phases: base(),
    });
    const a = phaseSchedule.find((s) => s.phaseId === 'a');
    expect(a.startWeek).toBe(0); // ASAP par défaut
    expect(totalWeeks).toBe(5);
  });
});
