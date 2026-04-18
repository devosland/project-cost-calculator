/**
 * Pure calculation helpers for the capacity-planning module.
 * Converts between week offsets and calendar months, enumerates month ranges,
 * aggregates per-resource utilization, and computes the financial impact of
 * consultant-to-permanent transitions.
 *
 * All functions are side-effect-free and safe to call in unit tests without
 * mocking anything.
 */
import { getHourlyRate, HOURS_PER_WEEK } from './costCalculations';

/**
 * Convert a project start month + week offset into a YYYY-MM calendar month.
 *
 * Adds `weekOffset * 7` days to the 1st of startMonth. The day-based arithmetic
 * naturally handles month and year rollovers (e.g. week 5 of January → February).
 *
 * @param {string} startMonth  - Project start month in YYYY-MM format.
 * @param {number} weekOffset  - Number of weeks after the project start.
 * @returns {string} YYYY-MM string for the resulting calendar month.
 */
export function weekToMonth(startMonth, weekOffset) {
  const [year, month] = startMonth.split('-').map(Number);
  const date = new Date(year, month - 1, 1 + weekOffset * 7);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Return an inclusive array of YYYY-MM strings covering every calendar month
 * from `start` to `end`.
 *
 * Used by the Gantt to enumerate column headers and by utilization aggregators
 * that need to iterate over a date window.
 *
 * @param {string} start - First month in YYYY-MM format.
 * @param {string} end   - Last month in YYYY-MM format (inclusive).
 * @returns {string[]} Ordered array of YYYY-MM strings.
 */
export function getMonthRange(start, end) {
  const [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  const result = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return result;
}

/**
 * Sum the total allocation percentage for a given resource during a specific
 * calendar month across all their active assignments.
 *
 * An assignment is "active" in a month when start_month <= month <= end_month.
 * Returns 0 if the resource has no assignments in that month.
 * Values above 100 indicate over-allocation — the Gantt uses this to highlight
 * cells in red.
 *
 * @param {object[]} assignments - All assignments to search.
 * @param {string}   resourceId  - Resource to filter by.
 * @param {string}   month       - Target month in YYYY-MM format.
 * @returns {number} Total allocation percentage (can exceed 100).
 */
export function calculateUtilization(assignments, resourceId, month) {
  return assignments
    .filter(
      (a) =>
        a.resource_id === resourceId &&
        a.start_month <= month &&
        a.end_month >= month
    )
    .reduce((sum, a) => sum + a.allocation, 0);
}

/**
 * Compute the full cost impact of replacing a consultant with a permanent
 * internal employee over their remaining engagement.
 *
 * Calculation breakdown:
 * - consultantCost  = consultant hourly rate × HOURS_PER_WEEK × remainingWeeks × allocation factor
 * - replacementCost = replacement hourly rate × same window
 * - overlapCost     = (consultantRate + replacementRate) × HOURS_PER_WEEK × overlapWeeks × factor
 *   (during the knowledge-transfer overlap both resources are paid simultaneously)
 * - savings         = consultantCost - replacementCost - overlapCost
 *   (net saving over the remaining engagement, after paying for overlap)
 * - annualSavings   = (consultantRate - replacementRate) × HOURS_PER_WEEK × 52 × factor
 *   (projected saving per year once the transition is complete)
 *
 * The 4.33 weeks/month factor used elsewhere does NOT appear here because this
 * function works exclusively in weeks, not months.
 *
 * @param {object} params
 * @param {string} params.consultantRole     - Role key of the departing consultant.
 * @param {string} params.consultantLevel    - Level key of the departing consultant.
 * @param {string} params.replacementRole    - Role key of the incoming permanent employee.
 * @param {string} params.replacementLevel   - Level key of the incoming permanent employee.
 * @param {number} params.allocation         - Shared allocation percentage (0–100).
 * @param {number} params.remainingWeeks     - Weeks left in the consultant's engagement.
 * @param {number} params.overlapWeeks       - Knowledge-transfer overlap period in weeks.
 * @param {object} params.rates              - Rates table (INTERNAL_RATE, CONSULTANT_RATES).
 * @returns {{ consultantCost: number, replacementCost: number, overlapCost: number,
 *             savings: number, annualSavings: number }}
 */
/**
 * Adds a number of weeks to a YYYY-MM string, returning the resulting YYYY-MM.
 * Mirrors the addWeeksToMonth helper in server/capacity.js (applyFn).
 *
 * @param {string} ym    - Base month in YYYY-MM format.
 * @param {number} weeks - Number of weeks to add (0 = no change).
 * @returns {string} Resulting month in YYYY-MM format.
 */
export function addWeeksToMonth(ym, weeks) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1 + weeks * 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Computes the projected list of resource assignments if the given transition
 * plan were applied. Pure function — no DB or side effects. Mirrors the
 * server-side apply logic in server/capacity.js (applyFn), used for client-side
 * what-if preview on the Gantt.
 *
 * Algorithm (mirrors applyFn 3-pass logic):
 *   Pass 1 — collect original end dates before any mutation.
 *   Pass 2 — for each transition, shorten the matching consultant assignment
 *             and create a new "temp" replacement assignment.
 *   Changes are tracked so the Gantt can color-code the diff.
 *
 * @param {Array}  currentAssignments - Existing assignments from /api/capacity/assignments.
 * @param {object} draftPlan          - Draft transition plan from transition_plans table.
 * @returns {{ assignments: Array, changes: { shortened: Array, added: Array } }}
 *   assignments — projected list with modifications applied (immutable copies).
 *   changes.shortened — [{ id, originalEndMonth, newEndMonth }] for red diff.
 *   changes.added     — [{ tempId, resource_id, project_id, phase_id, … }] for green diff.
 *   The overlap window (yellow) is derivable from shortened + added entries and is
 *   included as `overlapStart`/`overlapEnd` on each shortened entry.
 */
export function projectAssignmentsWithPlan(currentAssignments, draftPlan) {
  // Parse plan.data if it arrives as a JSON string (as stored in SQLite).
  let planData = draftPlan.data;
  if (typeof planData === 'string') {
    try { planData = JSON.parse(planData); } catch { planData = {}; }
  }
  const transitions = (planData && planData.transitions) ? planData.transitions : [];

  if (transitions.length === 0) {
    return { assignments: currentAssignments.slice(), changes: { shortened: [], added: [] } };
  }

  // Work on a shallow-copy array; individual assignment objects are replaced
  // (not mutated) when modified.
  let projected = currentAssignments.slice();
  const shortened = [];
  const added = [];
  let tempIdCounter = -1; // Negative IDs flag temp/projected assignments.

  // Pass 1: collect original end dates for all consultant assignments that will
  // be touched — critical because pass 2 may modify them in-place.
  const originalEndDates = {}; // key = `${resource_id}-${project_id}-${phase_id}`
  for (const t of transitions) {
    if (!t.consultant_resource_id) continue;
    const transitionDate = t.transition_date;
    if (!transitionDate) continue;
    for (const a of currentAssignments) {
      if (a.resource_id === t.consultant_resource_id && a.end_month >= transitionDate) {
        const key = `${a.resource_id}-${a.project_id}-${a.phase_id}`;
        if (!originalEndDates[key]) originalEndDates[key] = a.end_month;
      }
    }
  }

  // Pass 2: apply each transition.
  for (const t of transitions) {
    if (!t.consultant_resource_id || !t.transition_date) continue;
    const transitionDate = t.transition_date;
    const overlapWeeks = t.overlap_weeks || 0;

    // Find all consultant assignments that extend into/past the transition date.
    const consultantAssignments = currentAssignments.filter(
      (a) => a.resource_id === t.consultant_resource_id && a.end_month >= transitionDate
    );

    for (const a of consultantAssignments) {
      const key = `${a.resource_id}-${a.project_id}-${a.phase_id}`;
      const originalEnd = originalEndDates[key] || a.end_month;

      // Consultant stays until transition_date + overlap_weeks, capped at their original end.
      const consultantNewEnd = overlapWeeks > 0
        ? addWeeksToMonth(transitionDate, overlapWeeks)
        : transitionDate;
      const cappedEnd = consultantNewEnd > originalEnd ? originalEnd : consultantNewEnd;

      // Replace the consultant's assignment with a shortened copy.
      projected = projected.map((pa) =>
        pa.id === a.id ? { ...pa, end_month: cappedEnd } : pa
      );

      // Track shortened entry with overlap window for Gantt diff coloring.
      shortened.push({
        id: a.id,
        originalEndMonth: originalEnd,
        newEndMonth: cappedEnd,
        overlapStart: transitionDate,
        overlapEnd: cappedEnd,
      });

      // Create replacement assignment (temp, positive duration only).
      if (t.replacement_resource_id && transitionDate <= originalEnd) {
        const tempAssignment = {
          ...a,
          id: tempIdCounter--,
          resource_id: t.replacement_resource_id,
          start_month: transitionDate,
          end_month: originalEnd,
          _isPreview: true,
        };
        projected.push(tempAssignment);
        added.push({ ...tempAssignment });
      }
    }
  }

  return { assignments: projected, changes: { shortened, added } };
}

export function calculateTransitionCostImpact({
  consultantRole,
  consultantLevel,
  replacementRole,
  replacementLevel,
  allocation,
  remainingWeeks,
  overlapWeeks,
  rates,
}) {
  const consultantRate = getHourlyRate(rates, consultantRole, consultantLevel);
  const replacementRate = getHourlyRate(rates, replacementRole, replacementLevel);
  const factor = allocation / 100;

  const consultantCost = consultantRate * HOURS_PER_WEEK * remainingWeeks * factor;
  const replacementCost = replacementRate * HOURS_PER_WEEK * remainingWeeks * factor;
  // During overlap, both the consultant and the replacement are active and
  // billable simultaneously — hence the sum of both rates.
  const overlapCost = (consultantRate + replacementRate) * HOURS_PER_WEEK * overlapWeeks * factor;
  const savings = consultantCost - replacementCost - overlapCost;
  // Annualised saving assumes full-year engagement at the post-transition rate.
  const annualSavings = (consultantRate - replacementRate) * HOURS_PER_WEEK * 52 * factor;

  return { consultantCost, replacementCost, overlapCost, savings, annualSavings };
}
