import { describe, it, expect } from 'vitest';
import { getDependencyLinks } from '../lib/dependencyLinks';

describe('getDependencyLinks', () => {
  it('builds one link per dependency (fromId=pred, toId=succ, type)', () => {
    const links = getDependencyLinks({
      phases: [
        { id: 'a', name: 'A', durationWeeks: 2 },
        { id: 'b', name: 'B', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      ],
    });
    expect(links).toHaveLength(1);
    expect(links[0].fromId).toBe('a');
    expect(links[0].toId).toBe('b');
    expect(links[0].type).toBe('FS');
  });

  it('normalizes string-form dependencies to type FS', () => {
    const links = getDependencyLinks({
      phases: [
        { id: 'a', name: 'A', durationWeeks: 2 },
        { id: 'b', name: 'B', durationWeeks: 2, dependencies: ['a'] },
      ],
    });
    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('FS');
  });

  it('marks a link critical only when both endpoints are critical', () => {
    const links = getDependencyLinks({
      phases: [
        { id: 'long', name: 'Long', durationWeeks: 4 },
        { id: 'short', name: 'Short', durationWeeks: 1 },
        {
          id: 'end',
          name: 'End',
          durationWeeks: 1,
          dependencies: [
            { id: 'long', type: 'FS', lag: 0 },
            { id: 'short', type: 'FS', lag: 0 },
          ],
        },
      ],
    });
    const longLink = links.find((l) => l.fromId === 'long');
    const shortLink = links.find((l) => l.fromId === 'short');
    expect(longLink.critical).toBe(true); // long + end sont sur le chemin critique
    expect(shortLink.critical).toBe(false); // short a de la marge
  });

  it('returns [] when there are no dependencies', () => {
    const links = getDependencyLinks({
      phases: [
        { id: 'a', name: 'A', durationWeeks: 2 },
        { id: 'b', name: 'B', durationWeeks: 2 },
      ],
    });
    expect(links).toEqual([]);
  });
});
