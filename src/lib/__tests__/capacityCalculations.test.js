import { describe, it, expect } from 'vitest';
import { projectAssignmentsWithPlan, addWeeksToMonth } from '../capacityCalculations';

// ---------------------------------------------------------------------------
// addWeeksToMonth
// ---------------------------------------------------------------------------
describe('addWeeksToMonth', () => {
  it('returns same month for 0 weeks', () => {
    expect(addWeeksToMonth('2026-01', 0)).toBe('2026-01');
  });

  it('advances 4 weeks within January', () => {
    // 1 + 4*7 = 29 → still January
    expect(addWeeksToMonth('2026-01', 4)).toBe('2026-01');
  });

  it('crosses into February after 5 weeks', () => {
    // 1 + 5*7 = 36 → February
    expect(addWeeksToMonth('2026-01', 5)).toBe('2026-02');
  });

  it('handles year boundary', () => {
    expect(addWeeksToMonth('2026-12', 5)).toBe('2027-01');
  });
});

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const makeAssignment = (overrides) => ({
  id: 1,
  resource_id: 10,
  project_id: 100,
  phase_id: null,
  allocation: 100,
  start_month: '2026-01',
  end_month: '2026-12',
  project_name: 'Proj A',
  ...overrides,
});

const makePlan = (transitions) => ({
  id: 1,
  name: 'Plan 1',
  status: 'draft',
  data: { transitions },
});

// ---------------------------------------------------------------------------
// projectAssignmentsWithPlan — empty / no-match
// ---------------------------------------------------------------------------
describe('projectAssignmentsWithPlan — empty plan', () => {
  it('returns original assignments unchanged when transitions array is empty', () => {
    const assignments = [makeAssignment()];
    const plan = makePlan([]);
    const { assignments: result, changes } = projectAssignmentsWithPlan(assignments, plan);
    expect(result).toHaveLength(1);
    expect(result[0].end_month).toBe('2026-12');
    expect(changes.shortened).toHaveLength(0);
    expect(changes.added).toHaveLength(0);
  });

  it('returns original assignments when plan.data is a JSON string with no transitions', () => {
    const assignments = [makeAssignment()];
    const plan = { ...makePlan([]), data: JSON.stringify({ transitions: [] }) };
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    expect(result).toHaveLength(1);
    expect(result[0].end_month).toBe('2026-12');
  });

  it('returns original assignments when plan.data is null', () => {
    const assignments = [makeAssignment()];
    const plan = { id: 1, name: 'X', status: 'draft', data: null };
    const { assignments: result, changes } = projectAssignmentsWithPlan(assignments, plan);
    expect(result).toHaveLength(1);
    expect(changes.shortened).toHaveLength(0);
  });
});

describe('projectAssignmentsWithPlan — no matching consultant', () => {
  it('returns original assignments unmodified when consultant_resource_id has no assignment', () => {
    const assignments = [makeAssignment({ resource_id: 10 })];
    const plan = makePlan([{
      consultant_resource_id: 99, // no assignment for this resource
      replacement_resource_id: 20,
      transition_date: '2026-06',
      overlap_weeks: 2,
    }]);
    const { assignments: result, changes } = projectAssignmentsWithPlan(assignments, plan);
    expect(result).toHaveLength(1);
    expect(result[0].resource_id).toBe(10);
    expect(changes.shortened).toHaveLength(0);
    expect(changes.added).toHaveLength(0);
  });

  it('does not add spurious replacement when consultant has no matching assignment', () => {
    const assignments = [makeAssignment({ resource_id: 10 })];
    const plan = makePlan([{
      consultant_resource_id: 99,
      replacement_resource_id: 20,
      transition_date: '2026-06',
      overlap_weeks: 0,
    }]);
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    expect(result.some((a) => a.resource_id === 20)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Single transition (no overlap)
// ---------------------------------------------------------------------------
describe('projectAssignmentsWithPlan — single transition, no overlap', () => {
  const assignments = [makeAssignment({ id: 1, resource_id: 10, end_month: '2026-12' })];
  const plan = makePlan([{
    consultant_resource_id: 10,
    replacement_resource_id: 20,
    transition_date: '2026-06',
    overlap_weeks: 0,
  }]);

  it('shortens consultant end_month to transition_date', () => {
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    const consultant = result.find((a) => a.resource_id === 10);
    expect(consultant.end_month).toBe('2026-06');
  });

  it('creates replacement assignment starting at transition_date', () => {
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    const replacement = result.find((a) => a.resource_id === 20);
    expect(replacement).toBeDefined();
    expect(replacement.start_month).toBe('2026-06');
  });

  it('replacement ends at consultant original end_month', () => {
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    const replacement = result.find((a) => a.resource_id === 20);
    expect(replacement.end_month).toBe('2026-12');
  });

  it('records shortened change with correct originalEndMonth', () => {
    const { changes } = projectAssignmentsWithPlan(assignments, plan);
    expect(changes.shortened).toHaveLength(1);
    expect(changes.shortened[0].originalEndMonth).toBe('2026-12');
    expect(changes.shortened[0].newEndMonth).toBe('2026-06');
  });

  it('records added change for replacement', () => {
    const { changes } = projectAssignmentsWithPlan(assignments, plan);
    expect(changes.added).toHaveLength(1);
    expect(changes.added[0].resource_id).toBe(20);
  });

  it('does not mutate original assignments array', () => {
    const originalEnd = assignments[0].end_month;
    projectAssignmentsWithPlan(assignments, plan);
    expect(assignments[0].end_month).toBe(originalEnd);
  });
});

// ---------------------------------------------------------------------------
// Single transition WITH overlap
// ---------------------------------------------------------------------------
describe('projectAssignmentsWithPlan — single transition with overlap', () => {
  const assignments = [makeAssignment({ id: 1, resource_id: 10, end_month: '2026-12' })];

  it('consultant end_month = transition_date + overlap_weeks (4 weeks → same month)', () => {
    const plan = makePlan([{
      consultant_resource_id: 10,
      replacement_resource_id: 20,
      transition_date: '2026-06',
      overlap_weeks: 4,
    }]);
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    const consultant = result.find((a) => a.resource_id === 10);
    // 2026-06-01 + 4*7 days = 2026-06-29 → still June
    expect(consultant.end_month).toBe('2026-06');
  });

  it('consultant end_month = transition_date + overlap_weeks (5 weeks → next month)', () => {
    const plan = makePlan([{
      consultant_resource_id: 10,
      replacement_resource_id: 20,
      transition_date: '2026-06',
      overlap_weeks: 5,
    }]);
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    const consultant = result.find((a) => a.resource_id === 10);
    // 2026-06-01 + 5*7 = 2026-07-06 → July
    expect(consultant.end_month).toBe('2026-07');
  });

  it('consultant new end_month is capped at original end_month', () => {
    // original end = 2026-06 but overlap would push to 2026-07
    const earlyEndAssignment = [makeAssignment({ id: 2, resource_id: 10, end_month: '2026-06' })];
    const plan = makePlan([{
      consultant_resource_id: 10,
      replacement_resource_id: 20,
      transition_date: '2026-05',
      overlap_weeks: 8, // would push to 2026-06 or beyond
    }]);
    const { assignments: result } = projectAssignmentsWithPlan(earlyEndAssignment, plan);
    const consultant = result.find((a) => a.resource_id === 10);
    expect(consultant.end_month <= '2026-06').toBe(true);
  });

  it('overlap window is tracked on shortened entry', () => {
    const plan = makePlan([{
      consultant_resource_id: 10,
      replacement_resource_id: 20,
      transition_date: '2026-06',
      overlap_weeks: 5,
    }]);
    const { changes } = projectAssignmentsWithPlan(assignments, plan);
    expect(changes.shortened[0].overlapStart).toBe('2026-06');
    expect(changes.shortened[0].overlapEnd).toBe('2026-07');
  });
});

// ---------------------------------------------------------------------------
// Multiple transitions in same plan
// ---------------------------------------------------------------------------
describe('projectAssignmentsWithPlan — multiple transitions', () => {
  const assignments = [
    makeAssignment({ id: 1, resource_id: 10, project_id: 100, end_month: '2026-12' }),
    makeAssignment({ id: 2, resource_id: 11, project_id: 200, end_month: '2026-10' }),
  ];

  const plan = makePlan([
    {
      consultant_resource_id: 10,
      replacement_resource_id: 20,
      transition_date: '2026-06',
      overlap_weeks: 0,
    },
    {
      consultant_resource_id: 11,
      replacement_resource_id: 21,
      transition_date: '2026-07',
      overlap_weeks: 0,
    },
  ]);

  it('applies both transitions independently', () => {
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    const c1 = result.find((a) => a.resource_id === 10);
    const c2 = result.find((a) => a.resource_id === 11);
    expect(c1.end_month).toBe('2026-06');
    expect(c2.end_month).toBe('2026-07');
  });

  it('creates both replacement assignments without cross-contamination', () => {
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    const r1 = result.find((a) => a.resource_id === 20);
    const r2 = result.find((a) => a.resource_id === 21);
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1.project_id).toBe(100);
    expect(r2.project_id).toBe(200);
  });

  it('records two shortened and two added changes', () => {
    const { changes } = projectAssignmentsWithPlan(assignments, plan);
    expect(changes.shortened).toHaveLength(2);
    expect(changes.added).toHaveLength(2);
  });

  it('replacement for resource 20 uses original end of resource 10', () => {
    const { assignments: result } = projectAssignmentsWithPlan(assignments, plan);
    const r1 = result.find((a) => a.resource_id === 20);
    expect(r1.end_month).toBe('2026-12');
  });
});

// ---------------------------------------------------------------------------
// plan.data as JSON string (DB format)
// ---------------------------------------------------------------------------
describe('projectAssignmentsWithPlan — plan.data as JSON string', () => {
  it('parses JSON string and applies transitions correctly', () => {
    const assignments = [makeAssignment({ id: 1, resource_id: 10, end_month: '2026-09' })];
    const plan = {
      id: 1,
      name: 'Plan JSON',
      status: 'draft',
      data: JSON.stringify({
        transitions: [{
          consultant_resource_id: 10,
          replacement_resource_id: 20,
          transition_date: '2026-06',
          overlap_weeks: 0,
        }],
      }),
    };
    const { assignments: result, changes } = projectAssignmentsWithPlan(assignments, plan);
    expect(result.find((a) => a.resource_id === 10).end_month).toBe('2026-06');
    expect(changes.shortened).toHaveLength(1);
    expect(changes.added).toHaveLength(1);
  });
});
