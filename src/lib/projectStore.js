/**
 * Factory functions and helpers for creating, duplicating, deleting, and
 * exporting projects. This module owns the project data shape — all other
 * modules that need a new project or phase should call these factories rather
 * than constructing the objects inline.
 *
 * No React state is managed here; callers (App.jsx, Dashboard, etc.) own the
 * projects array and pass it in or receive a new immutable copy back.
 */
import { calculateProjectDurationWithDependencies } from './costCalculations';

/**
 * Generate a compact unique ID for projects, phases, and milestones.
 *
 * Format: `<timestamp base-36><random base-36 suffix>`
 * Example: `lrz2k9abc1` (10-ish chars)
 *
 * Chosen over UUID (crypto.randomUUID) because:
 * - No dependency on the Web Crypto API (works in all environments, including
 *   older mobile browsers and test environments).
 * - Shorter and human-readable in database rows and exported JSON.
 * - Collision probability is negligible for the expected data volume (hundreds
 *   of projects per user, not millions).
 *
 * @returns {string} Compact alphanumeric ID.
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a default phase with sensible initial values.
 * Internal helper — callers use `createPhase()` for the public API.
 *
 * @param {string} [name='Phase 1'] - Display name for the phase.
 * @returns {object} Phase object ready to be pushed into project.phases.
 */
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

/**
 * Create a new project with a single default phase and sensible settings.
 * Used by the Dashboard when the user clicks "New project" and by the API
 * import handler when creating a project from an external roadmap.
 *
 * @param {string} [name] - Display name for the project. Defaults to 'New project'.
 * @returns {object} Full project object matching the shape expected by the frontend.
 */
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
      taxRate: 4.9875,
      currency: 'CAD',
      startDate: null,
    },
    budget: null,
    nonLabourCosts: [],
    phases: [createDefaultPhase()],
  };
}

/**
 * Create a named phase. Thin wrapper around `createDefaultPhase` exposed for
 * use by the PhaseEditor "Add phase" button.
 *
 * @param {string} name  - Display name for the new phase.
 * @param {number} order - Intended display order (not currently enforced by the store).
 * @returns {object} Phase object.
 */
export function createPhase(name, order) {
  return createDefaultPhase(name, order);
}

/**
 * Duplicate an existing project, assigning fresh IDs to the copy, all its
 * phases, and all milestones within those phases.
 *
 * Deep-clones via JSON round-trip to avoid accidental reference sharing
 * between the original and the copy (team members, milestones arrays, etc.).
 * IDs are regenerated so the copy is fully independent in the database.
 *
 * @param {object[]} projects  - Current projects array.
 * @param {string}   projectId - ID of the project to duplicate.
 * @param {string}   [copyLabel='copie'] - Suffix appended to the copy's name.
 * @returns {object[]} New projects array with the duplicate appended.
 */
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
  // Regenerate phase and milestone IDs so the copy is fully independent.
  // Without this, drag-and-drop and dependency resolution would confuse the
  // original and duplicate phases.
  copy.phases = copy.phases.map((phase) => ({
    ...phase,
    id: generateId(),
    milestones: phase.milestones.map((m) => ({ ...m, id: generateId() })),
  }));
  return [...projects, copy];
}

/**
 * Remove a project from the projects array by ID.
 *
 * @param {object[]} projects  - Current projects array.
 * @param {string}   projectId - ID of the project to remove.
 * @returns {object[]} New array without the deleted project.
 */
export function deleteProject(projects, projectId) {
  return projects.filter((p) => p.id !== projectId);
}

/**
 * Trigger a browser file download of the project as a pretty-printed JSON file.
 * Non-alphanumeric characters in the project name are replaced with underscores
 * to ensure a valid filename on all platforms.
 *
 * @param {object} project - Project to export.
 */
export function exportProject(project) {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-zA-Z0-9À-ÿ ]/g, '_')}.json`;
  a.click();
  // Revoke immediately after click — the browser queues the download and no
  // longer needs the object URL.
  URL.revokeObjectURL(url);
}

/**
 * Export a project's cost breakdown as a CSV file suitable for opening in
 * Excel or Google Sheets.
 *
 * Columns: Type, Phase, Item/Role, Level, Quantity, Allocation%, Duration (weeks),
 * Weekly Cost, Total Cost.
 *
 * Note: this function uses its own local HOURS_PER_WEEK constant (37.5) rather
 * than importing from costCalculations to keep the export self-contained and
 * avoid pulling calculation dependencies into the CSV path. The value must
 * remain in sync with the constant in costCalculations.js.
 *
 * @param {object} project - Project to export.
 * @param {object} rates   - User rate card (INTERNAL_RATE, CONSULTANT_RATES).
 */
export function exportProjectCSV(project, rates) {
  // Must match HOURS_PER_WEEK in costCalculations.js (7.5h/day × 5 days).
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

/**
 * Export all project milestones as an iCalendar (.ics) file.
 *
 * Each milestone becomes a VEVENT with a DATE (all-day) start and a next-day
 * end (required by the iCal spec for all-day events). Milestone dates are
 * computed by adding the phase's startWeek offset + milestone.weekOffset weeks
 * to today's date (since projects don't have a mandatory real start date).
 *
 * ICS ESCAPE RULES (RFC 5545 §3.3.11):
 * The escapeICS helper escapes characters that are special in iCal text
 * properties: backslash → \\, semicolon → \;, comma → \,, newline → \n.
 * Carriage returns are stripped (Windows line endings use \r\n at the record
 * level, not within field values). Unescaped commas or semicolons would break
 * parsers in Apple Calendar, Outlook, and Google Calendar.
 *
 * @param {object} project - Project with phases and milestones.
 */
export function exportCalendar(project) {
  const { phaseSchedule } = calculateProjectDurationWithDependencies(project);
  const scheduleMap = new Map(phaseSchedule.map((s) => [s.phaseId, s]));

  const today = new Date();
  // Anchor to midnight so week offsets produce consistent dates regardless
  // of the time of day the export is triggered.
  today.setHours(0, 0, 0, 0);

  function addWeeks(date, weeks) {
    const result = new Date(date);
    result.setDate(result.getDate() + weeks * 7);
    return result;
  }

  /** Format a date as YYYYMMDD for DATE-type iCal fields. */
  function formatDateICS(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  /** Format a date as YYYYMMDDTHHmmss for DTSTAMP (local time, no Z). */
  function formatDateTimeICS(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}${m}${d}T${h}${min}${s}`;
  }

  /**
   * Escape a string for use in an iCal text property (RFC 5545 §3.3.11).
   * Order matters: backslash must be escaped first to avoid double-escaping.
   */
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
      // iCal all-day DTEND is exclusive — the event ends at the start of the
      // next day, which is correct for a single-day milestone marker.
      const nextDay = new Date(milestoneDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // UID format: <milestone-id>-<project-id>@domain — globally unique per
      // the iCal spec so calendar apps can de-duplicate on re-import.
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

  // iCal records use CRLF line endings per RFC 5545 §3.5.
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

/**
 * Open a native file picker, read the selected JSON file, and return a
 * resolved project object with fresh IDs.
 *
 * New IDs are assigned to the project, all phases, and all milestones so the
 * imported project is treated as a brand-new entity and does not conflict with
 * any existing IDs in the database.
 *
 * Rejects with a descriptive Error for the following failure cases:
 * - No file selected (user cancels the picker).
 * - File does not parse as JSON.
 * - Parsed JSON is missing required fields (name, phases).
 *
 * @returns {Promise<object>} Parsed and ID-refreshed project object.
 */
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
          // Minimal structure validation — name and phases are the two fields
          // every valid project export must have.
          if (!project.name || !project.phases) {
            return reject(new Error('Invalid project file'));
          }
          // Assign new IDs so the imported project is independent.
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
