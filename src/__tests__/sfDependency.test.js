/**
 * Characterization tests for Start-to-Finish (SF) dependencies, in both the
 * forward (ASAP) and backward (ALAP) scheduling passes.
 *
 * Context: the 2026-06-12 review flagged, at medium confidence, that the SF
 * branch of the ALAP path *might* use an inverted formula. A two-agent
 * investigation (analyst + adversarial verifier) independently hand-computed
 * the schedule and concluded the implementation is CORRECT in all three passes
 * — no fix needed. These tests pin that correct behavior so a future "fix"
 * can't silently invert it.
 *
 * SF semantics: the successor must FINISH after the predecessor STARTS (+lag):
 *   succEnd >= predStart + lag   ⇒   succStart = predStart + lag - succDuration
 */
import { describe, it, expect } from 'vitest';
import { calculateProjectDurationWithDependencies } from '../lib/costCalculations';

describe('SF (Start-to-Finish) dependency scheduling', () => {
  it('forward pass: successor finishes relative to the predecessor start', () => {
    // X(5) ─FS→ A(4) ─SF→ B(2). No ALAP, so B sits at its early start.
    const phases = [
      { id: 'x', name: 'X', durationWeeks: 5 },
      { id: 'a', name: 'A', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }] },
      { id: 'b', name: 'B', durationWeeks: 2, dependencies: [{ id: 'a', type: 'SF', lag: 0 }] },
    ];
    const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies({ phases });
    const a = phaseSchedule.find((s) => s.phaseId === 'a');
    const b = phaseSchedule.find((s) => s.phaseId === 'b');

    // A: starts when X finishes → {5,9}
    expect(a.startWeek).toBe(5);
    expect(a.endWeek).toBe(9);
    // B: SF on A → start = A.start(5) + 0 - 2 = 3, end = 5 → {3,5}
    expect(b.startWeek).toBe(3);
    expect(b.endWeek).toBe(5);
    // SF constraint satisfied: B.end(5) >= A.start(5)
    expect(b.endWeek).toBeGreaterThanOrEqual(a.startWeek);
    expect(totalWeeks).toBe(9);
  });

  it('ALAP pins an SF successor to its late start without violating the link', () => {
    // Same chain, but B is ALAP: it should slide to its latest start while
    // still finishing no earlier than A's start.
    const phases = [
      { id: 'x', name: 'X', durationWeeks: 5 },
      { id: 'a', name: 'A', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }] },
      { id: 'b', name: 'B', durationWeeks: 2, dependencies: [{ id: 'a', type: 'SF', lag: 0 }], constraint: { type: 'ALAP' } },
    ];
    const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies({ phases });
    const a = phaseSchedule.find((s) => s.phaseId === 'a');
    const b = phaseSchedule.find((s) => s.phaseId === 'b');

    // lateEnd[B] = 9 (project end), lateStart = 9 - 2 = 7 → B pinned to {7,9}
    expect(b.startWeek).toBe(7);
    expect(b.endWeek).toBe(9);
    // SF constraint still satisfied: B.end(9) >= A.start(5)
    expect(b.endWeek).toBeGreaterThanOrEqual(a.startWeek);
    // B is off the critical path → totalWeeks unchanged
    expect(totalWeeks).toBe(9);
  });

  it('ALAP respects a positive lag on the SF link', () => {
    // X(3) ─FS→ A(4) ─SF lag1→ B(2), B is ALAP.
    const phases = [
      { id: 'x', name: 'X', durationWeeks: 3 },
      { id: 'a', name: 'A', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }] },
      { id: 'b', name: 'B', durationWeeks: 2, dependencies: [{ id: 'a', type: 'SF', lag: 1 }], constraint: { type: 'ALAP' } },
    ];
    const { phaseSchedule } = calculateProjectDurationWithDependencies({ phases });
    const a = phaseSchedule.find((s) => s.phaseId === 'a');
    const b = phaseSchedule.find((s) => s.phaseId === 'b');

    // A: {3,7}. lateEnd[B] = 7, lateStart = 5 → B pinned to {5,7}.
    expect(a.startWeek).toBe(3);
    expect(a.endWeek).toBe(7);
    expect(b.startWeek).toBe(5);
    expect(b.endWeek).toBe(7);
    // SF + lag satisfied: B.end(7) >= A.start(3) + lag(1) = 4
    expect(b.endWeek).toBeGreaterThanOrEqual(a.startWeek + 1);
  });
});
