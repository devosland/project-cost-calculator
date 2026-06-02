import { describe, it, expect } from 'vitest';
import { computeLateEnds } from '../lib/costCalculations';

describe('computeLateEnds', () => {
  it('FS chain: predecessor late end bounded by successor late start', () => {
    // A(2) -> B(2). totalWeeks 4. B lateEnd 4 (no succ), A lateEnd 2.
    const phases = [
      { id: 'a', durationWeeks: 2 },
      { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
    ];
    const le = computeLateEnds(phases, 4);
    expect(le.get('b')).toBe(4);
    expect(le.get('a')).toBe(2);
  });

  it('a phase with float has late end earlier than totalWeeks', () => {
    // A(1) and Long(4) both -> End(1). totalWeeks 5.
    const phases = [
      { id: 'a', durationWeeks: 1 },
      { id: 'long', durationWeeks: 4 },
      {
        id: 'end',
        durationWeeks: 1,
        dependencies: [
          { id: 'a', type: 'FS', lag: 0 },
          { id: 'long', type: 'FS', lag: 0 },
        ],
      },
    ];
    const le = computeLateEnds(phases, 5);
    expect(le.get('end')).toBe(5);
    expect(le.get('long')).toBe(4); // critique : lateEnd == earlyEnd
    expect(le.get('a')).toBe(4); // marge : lateEnd 4 > earlyEnd 1
  });
});
