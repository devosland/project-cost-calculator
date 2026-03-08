import { calculateProjectDurationWithDependencies } from './costCalculations';

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

export function createProject(name) {
  name = name || 'New project';
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

export function duplicateProject(projects, projectId, copyLabel) {
  const source = projects.find((p) => p.id === projectId);
  if (!source) return projects;
  const copy = {
    ...JSON.parse(JSON.stringify(source)),
    id: generateId(),
    name: `${source.name} (${copyLabel || 'copie'})`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // regenerate phase/milestone IDs
  copy.phases = copy.phases.map((phase) => ({
    ...phase,
    id: generateId(),
    milestones: phase.milestones.map((m) => ({ ...m, id: generateId() })),
  }));
  return [...projects, copy];
}

export function deleteProject(projects, projectId) {
  return projects.filter((p) => p.id !== projectId);
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

export function exportCalendar(project) {
  const { phaseSchedule } = calculateProjectDurationWithDependencies(project);
  const scheduleMap = new Map(phaseSchedule.map((s) => [s.phaseId, s]));

  const today = new Date();
  // Reset to start of day
  today.setHours(0, 0, 0, 0);

  function addWeeks(date, weeks) {
    const result = new Date(date);
    result.setDate(result.getDate() + weeks * 7);
    return result;
  }

  function formatDateICS(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  function formatDateTimeICS(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}T${h}${min}${s}`;
  }

  function escapeICS(str) {
    return str.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n').replace(/\r/g, '');
  }

  const now = formatDateTimeICS(new Date());
  const events = [];

  for (const phase of project.phases) {
    const schedule = scheduleMap.get(phase.id);
    if (!schedule) continue;

    for (const milestone of phase.milestones) {
      const milestoneDate = addWeeks(today, schedule.startWeek + milestone.weekOffset);
      const nextDay = new Date(milestoneDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const uid = `${milestone.id}-${project.id}@project-cost-calculator`;

      events.push(
        [
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${now}`,
          `DTSTART;VALUE=DATE:${formatDateICS(milestoneDate)}`,
          `DTEND;VALUE=DATE:${formatDateICS(nextDay)}`,
          `SUMMARY:${escapeICS(milestone.name)}`,
          `DESCRIPTION:${escapeICS(phase.name)} — Week ${schedule.startWeek + milestone.weekOffset}`,
          'END:VEVENT',
        ].join('\r\n')
      );
    }
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ProjectCostCalculator//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(project.name)}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-zA-Z0-9À-ÿ ]/g, '_')}_milestones.ics`;
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
