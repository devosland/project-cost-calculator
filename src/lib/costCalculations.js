/**
 * Core project cost calculation engine.
 *
 * Handles two independent concerns:
 * 1. Rate lookup — maps role/level keys to hourly rates from the user's rate card.
 * 2. Cost calculation — computes weekly cost, total cost (with optional prorating),
 *    burn rate, cost breakdowns by role/phase/category, and project duration
 *    with topological dependency resolution.
 *
 * PRORATING RULE (key invariant):
 * When any team member in a phase has explicit startMonth/endMonth dates, that
 * member's cost is calculated over their actual constrained weeks rather than
 * the full phase.durationWeeks. Members without date constraints always use
 * the full phase duration. See `calculatePhaseTotalCost` and `getCostByRole`.
 */

// --- Constants ---

/**
 * Standard working hours per day (7.5h = 37.5h/week at 5 days).
 * Source: Exo enterprise convention.
 */
export const HOURS_PER_DAY = 7.5;

/** Standard working days per week. */
export const DAYS_PER_WEEK = 5;

/**
 * Standard billable hours per week (7.5 × 5 = 37.5).
 * Used in every cost formula: weeklyCost = hourlyRate × HOURS_PER_WEEK × quantity × allocation.
 */
export const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;

/**
 * Default tax rate, in percent, applied to labour costs when
 * `project.settings.includeTaxes` is true and no per-project `taxRate` is set.
 * 4.9875% corresponds to Quebec's QST on labour (half of 9.975%, the combined
 * QST+GST effective rate). Kept as the default for backward compatibility with
 * projects created before the rate became editable.
 */
export const DEFAULT_TAX_RATE = 4.9875;

/**
 * @deprecated Prefer reading `project.settings.taxRate` (percent) and computing
 * `1 + rate/100`. Retained because a legacy, currently-unmounted
 * `ProjectCostCalculator` still imports it.
 */
export const TAX_MULTIPLIER = 1 + DEFAULT_TAX_RATE / 100;

/** Supported display currencies with their Intl locale strings. */
export const CURRENCIES = [
  { code: 'CAD', label: 'CAD ($)', locale: 'fr-CA' },
  { code: 'USD', label: 'USD ($)', locale: 'en-US' },
  { code: 'EUR', label: 'EUR (\u20ac)', locale: 'fr-FR' },
  { code: 'GBP', label: 'GBP (\u00a3)', locale: 'en-GB' },
];

// --- Rate helpers ---

/**
 * Look up the hourly rate for a given role + level combination.
 *
 * Internal employees use a flat INTERNAL_RATE regardless of role — they are
 * not differentiated by seniority in the rate card. Consultants are looked up
 * in the nested CONSULTANT_RATES[role][level] structure. Returns 0 when the
 * combination is not found (safe default — results in $0 cost rather than NaN).
 *
 * @param {object} rates  - User rate card ({ INTERNAL_RATE, CONSULTANT_RATES }).
 * @param {string} role   - Role key (e.g. 'Développeur').
 * @param {string} level  - Level key (e.g. 'Sénior', 'Employé interne').
 * @returns {number} Hourly rate in the project's selected currency.
 */
export function getHourlyRate(rates, role, level) {
  if (level === 'Employ\u00e9 interne') {
    // Internal employees have a single flat rate — role doesn't affect cost.
    return rates.INTERNAL_RATE;
  }
  return rates.CONSULTANT_RATES[role]?.[level] || 0;
}

/**
 * Determine how many weeks a team member contributes to a phase.
 *
 * When a member has explicit startMonth/endMonth, their effective weeks are
 * capped at phase.durationWeeks so they never exceed the phase boundary.
 * Without date constraints the member is assumed to work the full phase duration.
 *
 * Note: the `projectStartMonth` parameter is accepted for API symmetry but the
 * phase-offset calculation is handled by the caller — this function only
 * computes the member's own date span.
 *
 * @param {object} member            - Team member with optional startMonth/endMonth.
 * @param {object} phase             - Phase with durationWeeks.
 * @param {string} projectStartMonth - Project start month (YYYY-MM), used by caller.
 * @returns {number} Effective weeks for cost calculation.
 */
export function getMemberWeeks(member, phase, projectStartMonth) {
  // If member has explicit period, calculate overlap with phase
  if (member.startMonth && member.endMonth && projectStartMonth) {
    const phaseStartMonth = projectStartMonth; // simplified: assume single-phase offset handled by caller
    const memberWeeks = monthDiffInWeeks(member.startMonth, member.endMonth);
    return Math.min(memberWeeks, phase.durationWeeks);
  }
  return phase.durationWeeks;
}

/**
 * Convert a month range into an approximate number of weeks.
 *
 * Uses the 4.33 factor (365.25 days / 12 months / 7 days per week ≈ 4.33).
 * This is an industry-standard approximation — real calendar months vary from
 * 28 to 31 days, but for cost estimation purposes 4.33 weeks/month is the
 * accepted convention at Exo.
 *
 * Math.round is applied so fractional weeks don't accumulate into noticeable
 * rounding errors on long projects.
 *
 * @param {string} startMonth - YYYY-MM
 * @param {string} endMonth   - YYYY-MM
 * @returns {number} Approximate number of weeks (non-negative integer).
 */
export function monthDiffInWeeks(startMonth, endMonth) {
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  const months = (ey - sy) * 12 + (em - sm);
  // 4.33 = average weeks per month (365.25 / 12 / 7)
  return Math.max(0, Math.round(months * 4.33));
}

/**
 * Calculate the prorated labour cost for a single team member within a phase.
 *
 * If the member has explicit startMonth/endMonth constraints, their effective
 * weeks are capped at phase.durationWeeks (same rule as calculatePhaseTotalCost).
 * Without date constraints the full phase duration is used.
 *
 * This helper exists so callers outside costCalculations.js (e.g. ProjectSummary)
 * can reuse the canonical prorating formula without duplicating it.
 *
 * @param {object} member           - Team member with role, level, quantity,
 *   allocation, and optional startMonth/endMonth.
 * @param {object} rates            - User rate card.
 * @param {number} phaseDurationWeeks - Duration of the containing phase in weeks.
 * @returns {number} Total labour cost for this member in this phase.
 */
export function calculateMemberProratedCost(member, rates, phaseDurationWeeks) {
  const hourlyRate = getHourlyRate(rates, member.role, member.level);
  const weeks = (member.startMonth && member.endMonth)
    ? Math.min(monthDiffInWeeks(member.startMonth, member.endMonth), phaseDurationWeeks)
    : phaseDurationWeeks;
  return hourlyRate * HOURS_PER_WEEK * member.quantity * (member.allocation / 100) * weeks;
}

// --- Phase-level cost calculations ---

/**
 * Calculate the weekly labour cost for a phase (assuming all members work the
 * full week with no date constraints).
 *
 * This is the "steady-state" burn rate: useful for displaying weekly cost in
 * the Timeline and Budget tabs. It does NOT apply prorating.
 *
 * @param {object} phase - Phase with teamMembers[].
 * @param {object} rates - User rate card.
 * @returns {number} Total weekly cost for all team members in this phase.
 */
export function calculatePhaseWeeklyCost(phase, rates) {
  return phase.teamMembers.reduce((total, member) => {
    const hourlyRate = getHourlyRate(rates, member.role, member.level);
    return total + hourlyRate * HOURS_PER_WEEK * member.quantity * (member.allocation / 100);
  }, 0);
}

/**
 * Calculate the total labour cost for a phase, applying prorating when any
 * team member has explicit period constraints (startMonth/endMonth).
 *
 * PRORATING LOGIC:
 * - If at least one member has startMonth AND endMonth → per-member calculation.
 *   Each member's weeks = min(monthDiffInWeeks(start, end), phase.durationWeeks).
 * - If no member has date constraints → simple formula:
 *   phaseWeeklyCost × phase.durationWeeks.
 *
 * This two-branch approach avoids a regression where constrained members would
 * otherwise inflate the total by using the full phase duration instead of their
 * actual availability window.
 *
 * @param {object} phase - Phase with durationWeeks and teamMembers[].
 * @param {object} rates - User rate card.
 * @returns {number} Total phase labour cost (prorated where applicable).
 */
export function calculatePhaseTotalCost(phase, rates) {
  // Prorating gate: if any member has a constrained period, switch to
  // per-member calculation for the whole phase (so unconstrained members
  // still use phase.durationWeeks, while constrained ones use their own span).
  const hasConstrainedMembers = phase.teamMembers.some(m => m.startMonth && m.endMonth);
  if (hasConstrainedMembers) {
    return phase.teamMembers.reduce((total, member) => {
      const hourlyRate = getHourlyRate(rates, member.role, member.level);
      const weeklyCost = hourlyRate * HOURS_PER_WEEK * member.quantity * (member.allocation / 100);
      const memberWeeks = (member.startMonth && member.endMonth)
        ? Math.min(monthDiffInWeeks(member.startMonth, member.endMonth), phase.durationWeeks)
        : phase.durationWeeks;
      return total + weeklyCost * memberWeeks;
    }, 0);
  }
  // Fast path when no member has date constraints.
  return calculatePhaseWeeklyCost(phase, rates) * phase.durationWeeks;
}

// --- Project-level aggregates ---

/**
 * Sum the total labour cost across all phases of a project.
 * Each phase uses `calculatePhaseTotalCost` so prorating is respected.
 *
 * @param {object} project - Project with phases[].
 * @param {object} rates   - User rate card.
 * @returns {number} Total project labour cost.
 */
export function calculateLabourCost(project, rates) {
  return project.phases.reduce(
    (sum, phase) => sum + calculatePhaseTotalCost(phase, rates),
    0
  );
}

/**
 * Sum all non-labour cost line items (infrastructure, licenses, SaaS, etc.).
 * Returns 0 when the project has no non-labour costs array.
 *
 * @param {object} project - Project with optional nonLabourCosts[].
 * @returns {number} Total non-labour cost.
 */
export function calculateNonLabourCost(project) {
  return (project.nonLabourCosts || []).reduce((sum, c) => sum + c.amount, 0);
}

/**
 * Calculate the full project cost including optional contingency and taxes.
 *
 * Application order matters: contingency is applied first (it is a percentage
 * of labour), then taxes are applied on top (they apply to the contingency-
 * adjusted labour total). Non-labour costs are never taxed or contingency-adjusted.
 *
 * @param {object} project - Full project object.
 * @param {object} rates   - User rate card.
 * @returns {number} Grand total cost.
 */
export function calculateProjectCost(project, rates) {
  let labourCost = calculateLabourCost(project, rates);

  if (project.settings.includeContingency) {
    labourCost *= 1 + project.settings.contingencyPercentage / 100;
  }
  if (project.settings.includeTaxes) {
    const taxRate = project.settings.taxRate ?? DEFAULT_TAX_RATE;
    labourCost *= 1 + taxRate / 100;
  }

  return labourCost + calculateNonLabourCost(project);
}

/**
 * Sum the duration of all phases in weeks (sequential, no dependency logic).
 * Used as a quick project length estimate for display purposes.
 *
 * @param {object} project - Project with phases[].
 * @returns {number} Total weeks.
 */
export function calculateProjectDurationWeeks(project) {
  return project.phases.reduce((sum, phase) => sum + phase.durationWeeks, 0);
}

/**
 * Calculate weekly burn rate (total project cost divided by total weeks).
 * Returns 0 when the project has no phases to avoid division by zero.
 *
 * @param {object} project - Full project object.
 * @param {object} rates   - User rate card.
 * @returns {number} Cost per week.
 */
export function calculateBurnRate(project, rates) {
  const totalWeeks = calculateProjectDurationWeeks(project);
  if (totalWeeks === 0) return 0;
  const totalCost = calculateProjectCost(project, rates);
  return totalCost / totalWeeks;
}

// --- Cost breakdowns ---

/**
 * Return total cost grouped by role across all phases, respecting prorating.
 *
 * Like `calculatePhaseTotalCost`, constrained members use their actual week
 * span (capped at phase.durationWeeks) rather than the full phase duration.
 * This ensures the role breakdown matches the phase total exactly.
 *
 * @param {object} project - Project with phases[].
 * @param {object} rates   - User rate card.
 * @returns {object} Map of { [roleName]: totalCost }.
 */
export function getCostByRole(project, rates) {
  const roleMap = {};
  for (const phase of project.phases) {
    for (const member of phase.teamMembers) {
      const hourlyRate = getHourlyRate(rates, member.role, member.level);
      // Apply the same prorating logic as calculatePhaseTotalCost so this
      // breakdown always reconciles with the phase totals.
      const weeks = (member.startMonth && member.endMonth)
        ? Math.min(monthDiffInWeeks(member.startMonth, member.endMonth), phase.durationWeeks)
        : phase.durationWeeks;
      const cost = hourlyRate * HOURS_PER_WEEK * member.quantity * (member.allocation / 100) * weeks;
      roleMap[member.role] = (roleMap[member.role] || 0) + cost;
    }
  }
  return roleMap;
}

/**
 * Return total cost grouped by phase name.
 * Delegates to `calculatePhaseTotalCost` so prorating is included.
 *
 * @param {object} project - Project with phases[].
 * @param {object} rates   - User rate card.
 * @returns {object} Map of { [phaseName]: totalCost }.
 */
export function getCostByPhase(project, rates) {
  const phaseMap = {};
  for (const phase of project.phases) {
    phaseMap[phase.name] = calculatePhaseTotalCost(phase, rates);
  }
  return phaseMap;
}

/**
 * Return total cost grouped by category (labour + non-labour line items).
 * Labour is aggregated under a single key (labourLabel).
 * Non-labour costs are grouped by their own category field.
 *
 * @param {object} project                  - Full project object.
 * @param {object} rates                    - User rate card.
 * @param {string} [labourLabel="Main-d'oeuvre"] - Display label for the labour bucket.
 * @returns {object} Map of { [category]: totalCost }.
 */
export function getCostByCategory(project, rates, labourLabel = "Main-d'oeuvre") {
  const catMap = { [labourLabel]: calculateLabourCost(project, rates) };
  for (const cost of (project.nonLabourCosts || [])) {
    catMap[cost.category] = (catMap[cost.category] || 0) + cost.amount;
  }
  return catMap;
}

// --- Dependency-aware scheduling ---

/** Types de dépendance supportés (Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish). */
export const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'];

/**
 * Normalise une entrée de dépendance de phase en { id, type, lag }.
 * Rétro-compat : une dépendance stockée en string (ancien format) devient FS / lag 0.
 *
 * @param {string|{id:string,type?:string,lag?:number}} dep
 * @returns {{ id: string|undefined, type: 'FS'|'SS'|'FF'|'SF', lag: number }}
 *   Les entrées malformées donnent id:undefined ; les consommateurs (scheduler depsOf,
 *   UI par id) les ignorent (aucune phase ne correspond).
 */
export function normalizeDependency(dep) {
  if (typeof dep === 'string') return { id: dep, type: 'FS', lag: 0 };
  if (dep && typeof dep === 'object') {
    return {
      id: dep.id,
      type: DEPENDENCY_TYPES.includes(dep.type) ? dep.type : 'FS',
      lag: Number.isFinite(dep.lag) ? dep.lag : 0,
    };
  }
  return { id: undefined, type: 'FS', lag: 0 };
}

/**
 * Applique une contrainte de date de phase au start piloté par les dépendances.
 * @param {number} depStart
 * @param {number} duration
 * @param {{type:'SNET'|'FNLT'|'MSO'|'MFO', week:number}|undefined} constraint
 * @returns {{ start:number, end:number, conflict:('SNET'|'FNLT'|'MSO'|'MFO'|null) }}
 */
export function applyConstraint(depStart, duration, constraint) {
  let start = Math.max(0, depStart);
  let conflict = null;
  if (constraint && Number.isFinite(constraint.week)) {
    const w = constraint.week;
    if (constraint.type === 'SNET') {
      start = Math.max(start, w);
    } else if (constraint.type === 'MSO') {
      if (start > w) conflict = 'MSO';
      start = w;
    } else if (constraint.type === 'MFO') {
      const cs = w - duration;
      if (start > cs) conflict = 'MFO';
      start = cs;
    }
    start = Math.max(0, start);
  }
  const end = start + duration;
  if (constraint && constraint.type === 'FNLT' && Number.isFinite(constraint.week) && end > constraint.week) {
    conflict = 'FNLT';
  }
  return { start, end, conflict };
}

/**
 * Passe arrière CPM : fin au plus tard (late end) de chaque phase, plafonnée à
 * totalWeeks. Pur, sans effet de bord. **Source unique** de la passe arrière,
 * partagée par le chemin critique (SP2) et l'ordonnancement ALAP (SP3b).
 * Suppose un graphe acyclique (appelé hors cycle par les deux consommateurs).
 *
 * @param {Array<{id:string,durationWeeks:number,dependencies?:Array}>} phases
 * @param {number} totalWeeks - Fin du projet (passe avant).
 * @returns {Map<string, number>} id → lateEnd (semaine de fin au plus tard).
 */
export function computeLateEnds(phases, totalWeeks) {
  const phaseMap = new Map(phases.map((p) => [p.id, p]));
  const depsOf = (phase) =>
    (phase.dependencies || []).map(normalizeDependency).filter((d) => phaseMap.has(d.id));
  const successors = new Map(phases.map((p) => [p.id, []]));
  for (const succ of phases) {
    for (const dep of depsOf(succ)) {
      successors.get(dep.id).push({ succId: succ.id, type: dep.type, lag: dep.lag });
    }
  }
  const lateEndMap = new Map();
  const getLateEnd = (id) => {
    if (lateEndMap.has(id)) return lateEndMap.get(id);
    const phase = phaseMap.get(id);
    const d = phase.durationWeeks;
    let lateEnd = totalWeeks;
    for (const s of successors.get(id)) {
      const succPhase = phaseMap.get(s.succId);
      const sLateEnd = getLateEnd(s.succId);
      const sLateStart = sLateEnd - succPhase.durationWeeks;
      let bound;
      switch (s.type) {
        case 'FF':
          bound = sLateEnd - s.lag;
          break;
        case 'SS':
          bound = sLateStart - s.lag + d;
          break;
        case 'SF':
          bound = sLateEnd - s.lag + d;
          break;
        case 'FS':
        default:
          bound = sLateStart - s.lag;
          break;
      }
      lateEnd = Math.min(lateEnd, bound);
    }
    lateEndMap.set(id, lateEnd);
    return lateEnd;
  };
  for (const p of phases) getLateEnd(p.id);
  return lateEndMap;
}

/**
 * Calcule le planning des phases en respectant le type de dépendance
 * (FS/SS/FF/SF) et le décalage (lag, en semaines ; négatif = avance).
 * Détecte les cycles (repli séquentiel) et retombe en séquentiel sans dépendance.
 *
 * The returned phaseSchedule array preserves the original phase order so
 * the Timeline tab can render phases in the same order as the Phases tab.
 *
 * @param {object} project - Project with phases[] (each phase may have a
 *                           `dependencies` array of sibling phase IDs or dep objects,
 *                           and an optional `constraint` for date enforcement).
 * @returns {{ totalWeeks: number, phaseSchedule: Array<{phaseId:string,startWeek:number,endWeek:number}>, conflicts: object }}
 */
export function calculateProjectDurationWithDependencies(project) {
  const phases = project.phases || [];
  if (phases.length === 0) return { totalWeeks: 0, phaseSchedule: [], conflicts: {} };
  const phaseMap = new Map(phases.map((p) => [p.id, p]));

  // Dépendances normalisées d'une phase, filtrées aux prédécesseurs existants.
  const depsOf = (phase) =>
    (phase.dependencies || []).map(normalizeDependency).filter((d) => phaseMap.has(d.id));

  const sequential = () => {
    let offset = 0;
    const conflicts = {};
    const phaseSchedule = phases.map((p) => {
      const { start, end, conflict } = applyConstraint(offset, p.durationWeeks, p.constraint);
      if (conflict) conflicts[p.id] = conflict;
      offset = end;
      return { phaseId: p.id, startWeek: start, endWeek: end };
    });
    return { totalWeeks: offset, phaseSchedule, conflicts };
  };

  const hasDependencies = phases.some((p) => depsOf(p).length > 0);
  if (!hasDependencies) return sequential();

  // Détection de cycle (DFS trois couleurs) sur les ids normalisés.
  const visited = new Set();
  const visiting = new Set();
  let hasCycle = false;
  function detectCycle(id) {
    if (visiting.has(id)) { hasCycle = true; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const phase = phaseMap.get(id);
    if (phase) {
      for (const dep of depsOf(phase)) detectCycle(dep.id);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const p of phases) {
    detectCycle(p.id);
    if (hasCycle) break;
  }
  if (hasCycle) return sequential();

  // Planning mémoïsé { startWeek, endWeek } respectant type + lag.
  const conflicts = {};
  const scheduleMap = new Map();
  function getSchedule(id) {
    if (scheduleMap.has(id)) return scheduleMap.get(id);
    const phase = phaseMap.get(id);
    if (!phase) return { startWeek: 0, endWeek: 0 };
    const duration = phase.durationWeeks;
    let depStart = 0;
    for (const dep of depsOf(phase)) {
      const { startWeek: ps, endWeek: pe } = getSchedule(dep.id);
      let candidate;
      switch (dep.type) {
        case 'SS': candidate = ps + dep.lag; break;
        case 'FF': candidate = pe + dep.lag - duration; break;
        case 'SF': candidate = ps + dep.lag - duration; break;
        case 'FS':
        default: candidate = pe + dep.lag; break;
      }
      depStart = Math.max(depStart, candidate);
    }
    const { start, end, conflict } = applyConstraint(depStart, duration, phase.constraint);
    if (conflict) conflicts[id] = conflict;
    const entry = { startWeek: start, endWeek: end };
    scheduleMap.set(id, entry);
    return entry;
  }

  const phaseSchedule = phases.map((p) => {
    const { startWeek, endWeek } = getSchedule(p.id);
    return { phaseId: p.id, startWeek, endWeek };
  });
  const totalWeeks = phaseSchedule.length > 0 ? Math.max(...phaseSchedule.map((s) => s.endWeek)) : 0;
  return { totalWeeks, phaseSchedule, conflicts };
}

// --- Formatting ---

/**
 * Format a numeric amount as a localised currency string.
 * Uses Intl.NumberFormat for correct decimal separators and currency symbols.
 * Falls back to CAD when the currency code is not in CURRENCIES.
 *
 * @param {number} amount            - Numeric amount to format.
 * @param {string} [currency='CAD']  - ISO 4217 currency code.
 * @returns {string} Formatted string (e.g. '12 500,00 $' or '$12,500.00').
 */
export function formatCurrency(amount, currency = 'CAD') {
  const curr = CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0];
  return new Intl.NumberFormat(curr.locale, {
    style: 'currency',
    currency: curr.code,
    minimumFractionDigits: 2,
  }).format(amount);
}
