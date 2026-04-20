/**
 * Maps a validated roadmap import payload to the internal project data structure
 * expected by the frontend (projectStore shape). This is the single place that
 * translates the external API's duration model into the app's week-based model.
 */

// Industry-standard approximation used consistently across the codebase.
// Do not change this constant without updating capacity.js impact calculations
// and the frontend's costCalculations.js, which use the same factor.
const WEEKS_PER_MONTH = 4.33;

/**
 * Converts a month count to weeks using the shared approximation factor.
 * @param {number} months
 * @returns {number} Rounded week count.
 */
function monthsToWeeks(months) {
  return Math.round(months * WEEKS_PER_MONTH);
}

/**
 * Calculates the number of weeks between two ISO date strings based on calendar days.
 * Used when both startDate and endDate are provided (preferred over durationMonths
 * because explicit dates are more precise for projects with irregular month lengths).
 * @param {string} startDate - ISO 8601 date (YYYY-MM-DD).
 * @param {string} endDate   - ISO 8601 date (YYYY-MM-DD).
 * @returns {number} Rounded week count.
 */
function datesToWeeks(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round(diffDays / 7);
}

/**
 * Maps a validated roadmap payload to the internal project data object.
 *
 * Key transformation decisions:
 *   - Phases are sorted by `order` before mapping so the Gantt renders correctly
 *     regardless of the order phases were submitted in the API payload.
 *   - durationWeeks is computed from dates when both startDate+endDate are provided
 *     (more precise), falling back to monthsToWeeks(durationMonths). The validator
 *     guarantees at least one source exists.
 *   - teamMembers and milestones are initialised to empty arrays — they cannot be
 *     imported via the roadmap API and must be populated through the capacity UI.
 *     This keeps the external API contract minimal and avoids accidental overwrites
 *     during upserts (publicApi.js re-applies existing teamMembers on update).
 *   - settings, budget, and nonLabourCosts are initialised to safe defaults that
 *     match a freshly created project so the frontend renders without null checks.
 *
 * @param {{ project: object, phases: object[] }} payload - Output of validateRoadmapImport.
 * @returns {object} Internal project data object ready for JSON serialisation and DB storage.
 */
export function mapRoadmapToProject(payload) {
  const { project, phases } = payload;
  // Sort by order so phase index in the array matches visual position on the Gantt.
  const sorted = [...phases].sort((a, b) => a.order - b.order);

  const mapped = sorted.map(p => ({
    id: p.id,
    name: p.name,
    order: p.order,
    // Dates take priority over durationMonths for greater precision.
    durationWeeks: (p.startDate && p.endDate)
      ? datesToWeeks(p.startDate, p.endDate)
      : (p.durationMonths !== undefined ? monthsToWeeks(p.durationMonths) : 0),
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    dependsOn: p.dependsOn ?? [],
    description: p.description ?? null,
    // teamMembers are intentionally empty — they are managed through the capacity module,
    // not the roadmap import API. On upsert, publicApi.js restores existing teamMembers.
    teamMembers: [],
    milestones: [],
  }));

  const now = new Date().toISOString();

  return {
    externalId: project.externalId,
    description: project.description ?? null,
    createdAt: now,
    updatedAt: now,
    // Default settings mirror what the "New Project" UI creates, ensuring all
    // required fields are present so frontend components don't need null guards.
    settings: {
      includeContingency: false,
      contingencyPercentage: 10,
      includeTaxes: false,
      taxRate: 4.9875,
      currency: 'CAD',
      startDate: project.startDate,
    },
    budget: null,
    nonLabourCosts: [],
    phases: mapped,
  };
}
