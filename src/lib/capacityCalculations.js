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
