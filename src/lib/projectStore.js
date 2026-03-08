const STORAGE_KEY = 'project-cost-calculator-projects';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createDefaultPhase(name = 'Phase 1') {
  return {
    id: generateId(),
    name,
    durationWeeks: 4,
    teamMembers: [],
    milestones: [],
    order: 0,
  };
}

export function createProject(name = 'Nouveau projet') {
  return {
    id: generateId(),
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      includeContingency: false,
      contingencyPercentage: 10,
      includeTaxes: false,
      currency: 'CAD',
    },
    budget: null,
    nonLabourCosts: [],
    phases: [createDefaultPhase()],
  };
}

export function createPhase(name, order) {
  return createDefaultPhase(name, order);
}

export function loadProjects() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return [];
}

export function saveProjects(projects) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function addProject(projects, project) {
  const updated = [...projects, project];
  saveProjects(updated);
  return updated;
}

export function updateProject(projects, projectId, changes) {
  const updated = projects.map((p) =>
    p.id === projectId ? { ...p, ...changes, updatedAt: new Date().toISOString() } : p
  );
  saveProjects(updated);
  return updated;
}

export function deleteProject(projects, projectId) {
  const updated = projects.filter((p) => p.id !== projectId);
  saveProjects(updated);
  return updated;
}

export function duplicateProject(projects, projectId) {
  const source = projects.find((p) => p.id === projectId);
  if (!source) return projects;
  const copy = {
    ...JSON.parse(JSON.stringify(source)),
    id: generateId(),
    name: `${source.name} (copie)`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // regenerate phase/milestone IDs
  copy.phases = copy.phases.map((phase) => ({
    ...phase,
    id: generateId(),
    milestones: phase.milestones.map((m) => ({ ...m, id: generateId() })),
  }));
  const updated = [...projects, copy];
  saveProjects(updated);
  return updated;
}

export function exportProject(project) {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-zA-Z0-9À-ÿ ]/g, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportProjectCSV(project, rates) {
  const HOURS_PER_WEEK = 37.5;
  const lines = ['Type,Phase,Item/Role,Level,Quantity,Allocation %,Duration (weeks),Weekly Cost,Total Cost'];

  for (const phase of project.phases) {
    for (const member of phase.teamMembers) {
      const hourlyRate =
        member.level === 'Employ\u00e9 interne'
          ? rates.INTERNAL_RATE
          : rates.CONSULTANT_RATES[member.role]?.[member.level] || 0;
      const weeklyCost = hourlyRate * HOURS_PER_WEEK * member.quantity * (member.allocation / 100);
      const phaseCost = weeklyCost * phase.durationWeeks;
      lines.push(
        [
          'Labour',
          `"${phase.name}"`,
          `"${member.role}"`,
          `"${member.level}"`,
          member.quantity,
          member.allocation,
          phase.durationWeeks,
          weeklyCost.toFixed(2),
          phaseCost.toFixed(2),
        ].join(',')
      );
    }
  }

  for (const cost of (project.nonLabourCosts || [])) {
    lines.push(
      [
        'Non-Labour',
        '""',
        `"${cost.name}"`,
        `"${cost.category}"`,
        1,
        '',
        '',
        '',
        cost.amount.toFixed(2),
      ].join(',')
    );
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-zA-Z0-9À-ÿ ]/g, '_')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importProjectFromFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return reject(new Error('No file selected'));
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const project = JSON.parse(ev.target.result);
          if (!project.name || !project.phases) {
            return reject(new Error('Invalid project file'));
          }
          // assign new IDs
          project.id = generateId();
          project.createdAt = new Date().toISOString();
          project.updatedAt = new Date().toISOString();
          project.phases = project.phases.map((phase) => ({
            ...phase,
            id: generateId(),
            milestones: (phase.milestones || []).map((m) => ({ ...m, id: generateId() })),
          }));
          resolve(project);
        } catch {
          reject(new Error('Invalid JSON'));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  });
}
