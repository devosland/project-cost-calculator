import { getHourlyRate, HOURS_PER_WEEK } from './costCalculations';

/**
 * Convert a project start month + week offset to YYYY-MM.
 * Adds weekOffset * 7 days to the 1st of startMonth.
 */
export function weekToMonth(startMonth, weekOffset) {
  const [year, month] = startMonth.split('-').map(Number);
  const date = new Date(year, month - 1, 1 + weekOffset * 7);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Return an inclusive array of YYYY-MM strings from start to end.
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
 * Sum allocation % for a resource in a given month.
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
 * Compute the cost impact of replacing a consultant with an internal resource.
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
  const overlapCost = (consultantRate + replacementRate) * HOURS_PER_WEEK * overlapWeeks * factor;
  const savings = consultantCost - replacementCost - overlapCost;
  const annualSavings = (consultantRate - replacementRate) * HOURS_PER_WEEK * 52 * factor;

  return { consultantCost, replacementCost, overlapCost, savings, annualSavings };
}
