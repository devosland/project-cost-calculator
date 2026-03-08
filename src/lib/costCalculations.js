export const HOURS_PER_DAY = 7.5;
export const DAYS_PER_WEEK = 5;
export const HOURS_PER_WEEK = HOURS_PER_DAY * DAYS_PER_WEEK;
export const TAX_MULTIPLIER = 1.049875;

export const CURRENCIES = [
  { code: 'CAD', label: 'CAD ($)', locale: 'fr-CA' },
  { code: 'USD', label: 'USD ($)', locale: 'en-US' },
  { code: 'EUR', label: 'EUR (\u20ac)', locale: 'fr-FR' },
  { code: 'GBP', label: 'GBP (\u00a3)', locale: 'en-GB' },
];

export function getHourlyRate(rates, role, level) {
  if (level === 'Employ\u00e9 interne') {
    return rates.INTERNAL_RATE;
  }
  return rates.CONSULTANT_RATES[role]?.[level] || 0;
}

export function calculatePhaseWeeklyCost(phase, rates) {
  return phase.teamMembers.reduce((total, member) => {
    const hourlyRate = getHourlyRate(rates, member.role, member.level);
    return total + hourlyRate * HOURS_PER_WEEK * member.quantity * (member.allocation / 100);
  }, 0);
}

export function calculatePhaseTotalCost(phase, rates) {
  return calculatePhaseWeeklyCost(phase, rates) * phase.durationWeeks;
}

export function calculateLabourCost(project, rates) {
  return project.phases.reduce(
    (sum, phase) => sum + calculatePhaseTotalCost(phase, rates),
    0
  );
}

export function calculateNonLabourCost(project) {
  return (project.nonLabourCosts || []).reduce((sum, c) => sum + c.amount, 0);
}

export function calculateProjectCost(project, rates) {
  let labourCost = calculateLabourCost(project, rates);

  if (project.settings.includeContingency) {
    labourCost *= 1 + project.settings.contingencyPercentage / 100;
  }
  if (project.settings.includeTaxes) {
    labourCost *= TAX_MULTIPLIER;
  }

  return labourCost + calculateNonLabourCost(project);
}

export function calculateProjectDurationWeeks(project) {
  return project.phases.reduce((sum, phase) => sum + phase.durationWeeks, 0);
}

export function calculateBurnRate(project, rates) {
  const totalWeeks = calculateProjectDurationWeeks(project);
  if (totalWeeks === 0) return 0;
  const totalCost = calculateProjectCost(project, rates);
  return totalCost / totalWeeks;
}

export function getCostByRole(project, rates) {
  const roleMap = {};
  for (const phase of project.phases) {
    for (const member of phase.teamMembers) {
      const hourlyRate = getHourlyRate(rates, member.role, member.level);
      const cost = hourlyRate * HOURS_PER_WEEK * member.quantity * (member.allocation / 100) * phase.durationWeeks;
      roleMap[member.role] = (roleMap[member.role] || 0) + cost;
    }
  }
  return roleMap;
}

export function getCostByPhase(project, rates) {
  const phaseMap = {};
  for (const phase of project.phases) {
    phaseMap[phase.name] = calculatePhaseTotalCost(phase, rates);
  }
  return phaseMap;
}

export function getCostByCategory(project, rates) {
  const catMap = { 'Main-d\'oeuvre': calculateLabourCost(project, rates) };
  for (const cost of (project.nonLabourCosts || [])) {
    catMap[cost.category] = (catMap[cost.category] || 0) + cost.amount;
  }
  return catMap;
}

export function formatCurrency(amount, currency = 'CAD') {
  const curr = CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0];
  return new Intl.NumberFormat(curr.locale, {
    style: 'currency',
    currency: curr.code,
    minimumFractionDigits: 2,
  }).format(amount);
}
