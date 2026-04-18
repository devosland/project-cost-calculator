const WEEKS_PER_MONTH = 4.33;

function monthsToWeeks(months) {
  return Math.round(months * WEEKS_PER_MONTH);
}

function datesToWeeks(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return Math.round(diffDays / 7);
}

export function mapRoadmapToProject(payload) {
  const { project, phases } = payload;
  const sorted = [...phases].sort((a, b) => a.order - b.order);

  const mapped = sorted.map(p => ({
    id: p.id,
    name: p.name,
    order: p.order,
    durationWeeks: (p.startDate && p.endDate)
      ? datesToWeeks(p.startDate, p.endDate)
      : (p.durationMonths !== undefined ? monthsToWeeks(p.durationMonths) : 0),
    startDate: p.startDate ?? null,
    endDate: p.endDate ?? null,
    dependsOn: p.dependsOn ?? [],
    description: p.description ?? null,
    teamMembers: [],
    milestones: [],
  }));

  const now = new Date().toISOString();

  return {
    externalId: project.externalId,
    description: project.description ?? null,
    createdAt: now,
    updatedAt: now,
    settings: {
      includeContingency: false,
      contingencyPercentage: 10,
      includeTaxes: false,
      currency: 'CAD',
      startDate: project.startDate,
    },
    budget: null,
    nonLabourCosts: [],
    phases: mapped,
  };
}
