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

export function getCostByCategory(project, rates, labourLabel = "Main-d'oeuvre") {
  const catMap = { [labourLabel]: calculateLabourCost(project, rates) };
  for (const cost of (project.nonLabourCosts || [])) {
    catMap[cost.category] = (catMap[cost.category] || 0) + cost.amount;
  }
  return catMap;
}

export function calculateProjectDurationWithDependencies(project) {
  const phases = project.phases || [];
  if (phases.length === 0) return { totalWeeks: 0, phaseSchedule: [] };

  const phaseMap = new Map(phases.map((p) => [p.id, p]));
  const hasDependencies = phases.some((p) => p.dependencies && p.dependencies.length > 0);

  // Fall back to sequential if no dependencies are defined
  if (!hasDependencies) {
    let offset = 0;
    const phaseSchedule = phases.map((p) => {
      const entry = { phaseId: p.id, startWeek: offset, endWeek: offset + p.durationWeeks };
      offset += p.durationWeeks;
      return entry;
    });
    return { totalWeeks: offset, phaseSchedule };
  }

  // Detect circular dependencies via topological sort attempt
  const visited = new Set();
  const visiting = new Set();
  let hasCycle = false;

  function detectCycle(id) {
    if (visiting.has(id)) { hasCycle = true; return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const phase = phaseMap.get(id);
    if (phase && phase.dependencies) {
      for (const depId of phase.dependencies) {
        if (phaseMap.has(depId)) detectCycle(depId);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const p of phases) {
    detectCycle(p.id);
    if (hasCycle) break;
  }

  // If circular, fall back to sequential
  if (hasCycle) {
    let offset = 0;
    const phaseSchedule = phases.map((p) => {
      const entry = { phaseId: p.id, startWeek: offset, endWeek: offset + p.durationWeeks };
      offset += p.durationWeeks;
      return entry;
    });
    return { totalWeeks: offset, phaseSchedule };
  }

  // Calculate start/end using dependency graph
  const endWeekMap = new Map();

  function getEndWeek(id) {
    if (endWeekMap.has(id)) return endWeekMap.get(id);
    const phase = phaseMap.get(id);
    if (!phase) return 0;

    let startWeek = 0;
    const deps = (phase.dependencies || []).filter((d) => phaseMap.has(d));
    for (const depId of deps) {
      startWeek = Math.max(startWeek, getEndWeek(depId));
    }
    const endWeek = startWeek + phase.durationWeeks;
    endWeekMap.set(id, endWeek);
    return endWeek;
  }

  for (const p of phases) getEndWeek(p.id);

  const phaseSchedule = phases.map((p) => {
    const endWeek = endWeekMap.get(p.id);
    return { phaseId: p.id, startWeek: endWeek - p.durationWeeks, endWeek };
  });

  const totalWeeks = phaseSchedule.length > 0 ? Math.max(...phaseSchedule.map((s) => s.endWeek)) : 0;

  return { totalWeeks, phaseSchedule };
}

export function formatCurrency(amount, currency = 'CAD') {
  const curr = CURRENCIES.find((c) => c.code === currency) || CURRENCIES[0];
  return new Intl.NumberFormat(curr.locale, {
    style: 'currency',
    currency: curr.code,
    minimumFractionDigits: 2,
  }).format(amount);
}
