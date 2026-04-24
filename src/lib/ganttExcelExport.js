/**
 * Excel export for the capacity Gantt.
 *
 * Produces a multi-sheet XLSX (one sheet per project that has at least one
 * assignment in the current Gantt window) matching the layout used by the
 * finance team internally: a top summary block (Budget / Estimé / RAF / Écart),
 * a monthly context row (business days + hours + tax multiplier), and a
 * resource table with live Excel formulas so the user can tweak allocations in
 * Excel and see costs recompute.
 *
 * Layout per project sheet (A1 origin):
 *
 *   Row 1 : [Project name] (merged, bold, 16pt)
 *   Row 3 : Summary header  — Poste | Budget | Estimé | RAF | Écart
 *   Row 4 : Main d'œuvre    — "—" | =SUM(cost row) | =budget - estimate | =écart
 *   Row 5 : Non-labour      — "—" | =SUM(non-labour) | ...
 *   Row 6 : Total           — budget | =D4+D5 | =B6-D6 | =B6-D6
 *
 *   Row 8 : (blank)
 *   Row 9 : "" | months (localised short labels)
 *   Row 10: "Nb jrs ouvrables" | <business-days per month>
 *   Row 11: "Nb heures"        | =row10 × HOURS_PER_DAY
 *   (Taxes cell at the right end of Row 11)
 *
 *   Row 13: Resource header — Rôle | Niveau | Ressource | Type | Taux/h | <months × 2 cols>
 *           (Alloc col | Coût col per month)
 *   Row 14+: One row per resource with:
 *     - allocation cells = literal %
 *     - cost cells       = formula `=alloc × rate × hours_for_that_month`
 *   Row N : Total prévisionnel hors tx | — | =SUM(col) for each Coût column
 *   Row N+1: Total prévisionnel avec tx | — | =hors_tx × tax_multiplier
 *
 *   Row N+3: Non-labour section: Nom | Catégorie | Montant
 *   Row N+4+: one row per project.nonLabourCosts entry
 *
 * Hourly rate is resolved from the user's rates card via getHourlyRate — same
 * convention used everywhere else in the app (INTERNAL_RATE flat, consultants
 * keyed by role+level).
 *
 * The allocation % per resource per month is derived from overlapping
 * assignments: for each month and resource×project pair, we sum the allocation
 * of all assignments active that month (can exceed 100 if the user has
 * legitimately stacked assignments — we surface the raw sum, matching the
 * Gantt's "over-allocation" semantics).
 */

import ExcelJS from 'exceljs';
import { getHourlyRate, HOURS_PER_DAY } from './costCalculations';

const LABELS = {
  fr: {
    summary: 'Sommaire',
    poste: 'Poste',
    budget: 'Budget',
    estimate: 'Estimé',
    raf: 'RAF',
    ecart: 'Écart',
    labour: "Main d'œuvre",
    nonLabour: 'Non-labour',
    total: 'Total',
    nbDays: 'Nb jrs ouvrables',
    nbHours: 'Nb heures',
    taxes: 'Taxes',
    role: 'Rôle',
    level: 'Niveau',
    resource: 'Ressource',
    type: 'Type',
    rate: 'Taux/h',
    alloc: 'Alloc %',
    cost: 'Coût',
    totalHT: 'Total prévisionnel (hors tx.)',
    totalTTC: 'Total prévisionnel (avec tx.)',
    nlHeader: 'Non-labour',
    nlName: 'Nom',
    nlCat: 'Catégorie',
    nlAmount: 'Montant',
    typePerm: 'Permanent',
    typeConsultant: 'Consultant',
  },
  en: {
    summary: 'Summary',
    poste: 'Item',
    budget: 'Budget',
    estimate: 'Estimate',
    raf: 'ETC',
    ecart: 'Variance',
    labour: 'Labour',
    nonLabour: 'Non-labour',
    total: 'Total',
    nbDays: 'Business days',
    nbHours: 'Hours',
    taxes: 'Taxes',
    role: 'Role',
    level: 'Level',
    resource: 'Resource',
    type: 'Type',
    rate: 'Rate/h',
    alloc: 'Alloc %',
    cost: 'Cost',
    totalHT: 'Forecast (pre-tax)',
    totalTTC: 'Forecast (tax incl.)',
    nlHeader: 'Non-labour',
    nlName: 'Name',
    nlCat: 'Category',
    nlAmount: 'Amount',
    typePerm: 'Permanent',
    typeConsultant: 'Consultant',
  },
};

/**
 * Count Monday-Friday days in a given `YYYY-MM` month.
 * @param {string} ym `YYYY-MM`.
 * @returns {number} Number of business days.
 */
function businessDaysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

/**
 * Localised short month label, e.g. "janv. 2026" / "Jan 2026".
 */
function formatMonthLabel(ym, locale) {
  const [y, m] = ym.split('-').map(Number);
  const loc = locale === 'fr' ? 'fr-CA' : 'en-CA';
  return new Date(y, m - 1, 1).toLocaleDateString(loc, { month: 'short', year: 'numeric' });
}

/**
 * Excel sheet names are capped at 31 chars and forbid `\ / ? * [ ] :`.
 */
function sanitizeSheetName(name, fallback = 'Project') {
  const cleaned = (name || fallback).replace(/[\\/?*[\]:]/g, ' ').trim();
  return cleaned.length > 31 ? cleaned.slice(0, 31) : cleaned || fallback;
}

/**
 * True iff an assignment is active in `ym` (inclusive on both ends).
 * start_month/end_month are `YYYY-MM` strings — lexicographic compare works.
 */
function isActiveInMonth(a, ym) {
  const starts = a.start_month || '0000-00';
  const ends = a.end_month || '9999-12';
  return starts <= ym && ym <= ends;
}

/**
 * Sum a resource's allocation % for a given project in a given month, across
 * all overlapping assignments. Mirrors the Gantt's over-allocation semantics.
 */
function allocationForMonth(assignments, resourceId, projectId, ym) {
  return assignments
    .filter((a) => a.resource_id === resourceId && a.project_id === projectId && isActiveInMonth(a, ym))
    .reduce((sum, a) => sum + (a.allocation || 0), 0);
}

/**
 * Build the project sheet in-place.
 *
 * All cell references use 1-indexed row/col. For formulas we build A1-style
 * strings via `colLetter(col) + row`. We thread key row numbers through this
 * function so the summary formulas at the top can reference the monthly-totals
 * rows written at the bottom without guessing layout.
 */
function buildProjectSheet(ws, ctx) {
  const {
    project, projectAssignments, months, resourceById, rates, labels, projectResourceIds,
  } = ctx;

  const taxRate = project?.settings?.taxRate ?? 4.9875;
  const taxMult = 1 + taxRate / 100;
  const budget = project?.budget || null;

  // --- Title row -----------------------------------------------------------
  ws.getCell('A1').value = project?.name || '—';
  ws.getCell('A1').font = { name: 'Calibri', size: 16, bold: true };
  ws.mergeCells('A1:F1');

  // --- Summary header (Row 3) ----------------------------------------------
  const summaryHeaders = [labels.poste, labels.budget, labels.estimate, labels.raf, labels.ecart];
  summaryHeaders.forEach((h, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAE0D5' } };
    c.border = { bottom: { style: 'thin' } };
  });

  // We'll fill rows 4/5/6 (labour / non-labour / total) after knowing the
  // bottom total row. Leave placeholders for now.
  ws.getCell(4, 1).value = labels.labour;
  ws.getCell(5, 1).value = labels.nonLabour;
  ws.getCell(6, 1).value = labels.total;
  ws.getCell(6, 1).font = { bold: true };
  if (budget != null) ws.getCell(6, 2).value = budget;

  // --- Context rows (9/10/11): months + business days + hours + tax --------
  // First 5 columns reserved for resource metadata; months start at col F (6).
  const FIRST_MONTH_COL = 6;
  const MONTH_COLS_PER_MONTH = 2; // alloc + cost
  const nMonths = months.length;

  // R9 header: merge 2 cells per month into the localised label.
  months.forEach((ym, i) => {
    const startCol = FIRST_MONTH_COL + i * MONTH_COLS_PER_MONTH;
    const endCol = startCol + 1;
    ws.mergeCells(9, startCol, 9, endCol);
    const c = ws.getCell(9, startCol);
    c.value = formatMonthLabel(ym, labels.__locale);
    c.font = { bold: true };
    c.alignment = { horizontal: 'center' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAE0D5' } };
  });

  // R10: Nb jrs ouvrables (first alloc col holds the value, skip cost col)
  ws.getCell(10, 5).value = labels.nbDays;
  ws.getCell(10, 5).font = { italic: true, color: { argb: 'FF6B5B4A' } };
  months.forEach((ym, i) => {
    const col = FIRST_MONTH_COL + i * MONTH_COLS_PER_MONTH;
    ws.getCell(10, col).value = businessDaysInMonth(ym);
    ws.getCell(10, col).alignment = { horizontal: 'center' };
  });

  // R11: Nb heures = days × HOURS_PER_DAY
  ws.getCell(11, 5).value = labels.nbHours;
  ws.getCell(11, 5).font = { italic: true, color: { argb: 'FF6B5B4A' } };
  months.forEach((ym, i) => {
    const col = FIRST_MONTH_COL + i * MONTH_COLS_PER_MONTH;
    const daysAddr = cellAddr(10, col);
    ws.getCell(11, col).value = { formula: `${daysAddr}*${HOURS_PER_DAY}` };
    ws.getCell(11, col).alignment = { horizontal: 'center' };
  });

  // Tax multiplier — placed two cols past last month header for visibility.
  const lastMonthCol = FIRST_MONTH_COL + (nMonths - 1) * MONTH_COLS_PER_MONTH + 1;
  const taxLabelCol = lastMonthCol + 2;
  const taxValueCol = taxLabelCol + 1;
  ws.getCell(11, taxLabelCol).value = `${labels.taxes}:`;
  ws.getCell(11, taxLabelCol).font = { italic: true };
  ws.getCell(11, taxValueCol).value = taxMult;
  ws.getCell(11, taxValueCol).numFmt = '0.000000';
  const taxCellAddr = `$${colLetter(taxValueCol)}$11`;

  // --- Resource table header (Row 13) --------------------------------------
  const baseHeaders = [labels.role, labels.level, labels.resource, labels.type, labels.rate];
  baseHeaders.forEach((h, i) => {
    const c = ws.getCell(13, i + 1);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAE0D5' } };
    c.border = { bottom: { style: 'thin' } };
  });
  months.forEach((_, i) => {
    const allocCol = FIRST_MONTH_COL + i * MONTH_COLS_PER_MONTH;
    const costCol = allocCol + 1;
    const a = ws.getCell(13, allocCol);
    const c = ws.getCell(13, costCol);
    a.value = labels.alloc;
    c.value = labels.cost;
    [a, c].forEach((cell) => {
      cell.font = { bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5EDE0' } };
      cell.alignment = { horizontal: 'center' };
      cell.border = { bottom: { style: 'thin' } };
    });
  });

  // --- Resource rows -------------------------------------------------------
  let currentRow = 14;
  const resourceStartRow = currentRow;
  for (const rid of projectResourceIds) {
    const resource = resourceById.get(rid);
    if (!resource) continue;
    const role = resource.role || '';
    const level = resource.level || '';
    const name = resource.name || '';
    // Canonical rule used across the app (ResourcePool, projectStore): a
    // resource is permanent iff its level is the sentinel "Employé interne",
    // otherwise it is a consultant. No separate `type` field is stored.
    const type = level === 'Employé interne' ? labels.typePerm : labels.typeConsultant;
    const rate = getHourlyRate(rates, role, level);

    ws.getCell(currentRow, 1).value = role;
    ws.getCell(currentRow, 2).value = level;
    ws.getCell(currentRow, 3).value = name;
    ws.getCell(currentRow, 4).value = type;
    ws.getCell(currentRow, 5).value = rate;
    ws.getCell(currentRow, 5).numFmt = '0.00';

    const rateAddr = `$${colLetter(5)}${currentRow}`;

    months.forEach((ym, i) => {
      const allocCol = FIRST_MONTH_COL + i * MONTH_COLS_PER_MONTH;
      const costCol = allocCol + 1;
      const allocPct = allocationForMonth(projectAssignments, rid, project?.id, ym);

      const allocCell = ws.getCell(currentRow, allocCol);
      allocCell.value = allocPct / 100; // store as fraction, format as %
      allocCell.numFmt = '0%';
      allocCell.alignment = { horizontal: 'center' };

      const costCell = ws.getCell(currentRow, costCol);
      const allocAddr = `${colLetter(allocCol)}${currentRow}`;
      const hoursAddr = `${colLetter(allocCol)}$11`;
      costCell.value = { formula: `${allocAddr}*${rateAddr}*${hoursAddr}` };
      costCell.numFmt = '#,##0.00';
    });

    currentRow++;
  }
  const resourceEndRow = currentRow - 1;

  // --- Monthly totals: hors tx + avec tx ----------------------------------
  const totalHTRow = currentRow;
  const totalTTCRow = currentRow + 1;
  ws.getCell(totalHTRow, 4).value = labels.totalHT;
  ws.getCell(totalHTRow, 4).font = { bold: true };
  ws.getCell(totalTTCRow, 4).value = labels.totalTTC;
  ws.getCell(totalTTCRow, 4).font = { bold: true };

  months.forEach((_, i) => {
    const costCol = FIRST_MONTH_COL + i * MONTH_COLS_PER_MONTH + 1;
    const colL = colLetter(costCol);
    const htCell = ws.getCell(totalHTRow, costCol);
    const ttcCell = ws.getCell(totalTTCRow, costCol);
    if (resourceEndRow >= resourceStartRow) {
      htCell.value = { formula: `SUM(${colL}${resourceStartRow}:${colL}${resourceEndRow})` };
    } else {
      htCell.value = 0;
    }
    ttcCell.value = { formula: `${colL}${totalHTRow}*${taxCellAddr}` };
    htCell.numFmt = '#,##0.00';
    ttcCell.numFmt = '#,##0.00';
    htCell.font = { bold: true };
    ttcCell.font = { bold: true };
  });

  currentRow = totalTTCRow + 2; // leave a blank row

  // --- Non-labour block ----------------------------------------------------
  const nlItems = project?.nonLabourCosts || [];
  ws.getCell(currentRow, 1).value = labels.nlHeader;
  ws.getCell(currentRow, 1).font = { bold: true };
  currentRow++;
  ws.getCell(currentRow, 1).value = labels.nlName;
  ws.getCell(currentRow, 2).value = labels.nlCat;
  ws.getCell(currentRow, 3).value = labels.nlAmount;
  [1, 2, 3].forEach((c) => {
    const cell = ws.getCell(currentRow, c);
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAE0D5' } };
    cell.border = { bottom: { style: 'thin' } };
  });
  currentRow++;
  const nlItemsStartRow = currentRow;
  for (const item of nlItems) {
    ws.getCell(currentRow, 1).value = item.name || '';
    ws.getCell(currentRow, 2).value = item.category || '';
    ws.getCell(currentRow, 3).value = item.amount || 0;
    ws.getCell(currentRow, 3).numFmt = '#,##0.00';
    currentRow++;
  }
  const nlItemsEndRow = currentRow - 1;
  const nlTotalRow = currentRow;
  ws.getCell(nlTotalRow, 1).value = labels.total;
  ws.getCell(nlTotalRow, 1).font = { bold: true };
  ws.getCell(nlTotalRow, 3).value =
    nlItems.length > 0
      ? { formula: `SUM(C${nlItemsStartRow}:C${nlItemsEndRow})` }
      : 0;
  ws.getCell(nlTotalRow, 3).numFmt = '#,##0.00';
  ws.getCell(nlTotalRow, 3).font = { bold: true };

  // --- Back-fill summary rows 4/5/6 now we know the totals rows ------------
  // D (col 4) = Estimé, E (col 5) = RAF, F (col 6) = Écart
  // Labour estimate = last cost of totalTTCRow... actually sum all TTC cells.
  const ttcRange = `${colLetter(FIRST_MONTH_COL + 1)}${totalTTCRow}:${colLetter(
    FIRST_MONTH_COL + (nMonths - 1) * MONTH_COLS_PER_MONTH + 1
  )}${totalTTCRow}`;
  ws.getCell(4, 3).value = { formula: `SUM(${ttcRange})` };
  ws.getCell(4, 3).numFmt = '#,##0.00';

  ws.getCell(5, 3).value =
    nlItems.length > 0
      ? { formula: `C${nlTotalRow}` }
      : 0;
  ws.getCell(5, 3).numFmt = '#,##0.00';

  // Total row: Budget | =sum estimate | =budget - estimate | =budget - estimate
  ws.getCell(6, 3).value = { formula: `C4+C5` };
  ws.getCell(6, 3).numFmt = '#,##0.00';
  if (budget != null) {
    ws.getCell(6, 4).value = { formula: `B6-C6` };
    ws.getCell(6, 5).value = { formula: `B6-C6` };
  } else {
    ws.getCell(6, 4).value = '—';
    ws.getCell(6, 5).value = '—';
  }
  ws.getCell(6, 4).numFmt = '#,##0.00';
  ws.getCell(6, 5).numFmt = '#,##0.00';
  [6].forEach((r) => {
    for (let c = 1; c <= 5; c++) {
      ws.getCell(r, c).border = { top: { style: 'thin' }, bottom: { style: 'double' } };
    }
  });

  // --- Column widths -------------------------------------------------------
  ws.getColumn(1).width = 22; // Role
  ws.getColumn(2).width = 14; // Level
  ws.getColumn(3).width = 26; // Name
  ws.getColumn(4).width = 14; // Type
  ws.getColumn(5).width = 11; // Rate
  for (let i = 0; i < nMonths; i++) {
    ws.getColumn(FIRST_MONTH_COL + i * MONTH_COLS_PER_MONTH).width = 8;
    ws.getColumn(FIRST_MONTH_COL + i * MONTH_COLS_PER_MONTH + 1).width = 12;
  }

  // Freeze the header/meta block so scrolling months keeps summary visible.
  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 13 }];
}

// --- Address helpers -------------------------------------------------------

function colLetter(col) {
  let n = col;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellAddr(row, col) {
  return `${colLetter(col)}${row}`;
}

// --- Public API ------------------------------------------------------------

/**
 * Generate the workbook as an ArrayBuffer.
 *
 * Accepts already-fetched data so the caller can decide whether to use cached
 * state or re-fetch (avoids surprise network calls inside this function).
 *
 * @param {object} params
 * @param {Array}  params.projects    - Full project objects (need .id, .name, .budget, .settings, .nonLabourCosts).
 * @param {Array}  params.resources   - Resource pool entries.
 * @param {Array}  params.assignments - Current-window assignments (resource_id, project_id, allocation, start_month, end_month).
 * @param {Array<string>} params.months - `YYYY-MM` labels defining the export window (typically the Gantt's 12-month range).
 * @param {object} params.rates       - User rate card ({ INTERNAL_RATE, CONSULTANT_RATES }).
 * @param {string} [params.locale]    - 'fr' or 'en' — drives header labels and month formatting.
 * @returns {Promise<ArrayBuffer>}
 */
export async function generateGanttExcelBuffer({ projects, resources, assignments, months, rates, locale = 'fr' }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Prism';
  wb.created = new Date();

  const labels = { ...LABELS[locale] || LABELS.fr, __locale: locale };
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const byProject = new Map();
  for (const a of assignments) {
    if (!byProject.has(a.project_id)) byProject.set(a.project_id, []);
    byProject.get(a.project_id).push(a);
  }

  // Only export projects that have at least one assignment in-window.
  const projectIds = [...byProject.keys()].sort((a, b) => {
    const na = projectById.get(a)?.name || '';
    const nb = projectById.get(b)?.name || '';
    return na.localeCompare(nb);
  });

  if (projectIds.length === 0) {
    const ws = wb.addWorksheet('Gantt');
    ws.getCell('A1').value = locale === 'fr' ? 'Aucune donnée à exporter.' : 'No data to export.';
    return wb.xlsx.writeBuffer();
  }

  for (const projectId of projectIds) {
    const project = projectById.get(projectId);
    const projectAssignments = byProject.get(projectId);
    const projectResourceIds = [...new Set(projectAssignments.map((a) => a.resource_id))];
    const sheetName = sanitizeSheetName(project?.name, `Project ${projectId}`);
    const ws = wb.addWorksheet(sheetName);
    buildProjectSheet(ws, {
      project,
      projectAssignments,
      months,
      resourceById,
      rates,
      labels,
      projectResourceIds,
    });
  }

  return wb.xlsx.writeBuffer();
}

/**
 * Trigger a browser download of the generated workbook.
 * Filename: `gantt-capacite-<YYYY-MM>-<YYYY-MM>.xlsx`.
 */
export async function downloadGanttExcel(params) {
  const buffer = await generateGanttExcelBuffer(params);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const first = params.months[0];
  const last = params.months[params.months.length - 1];
  const filename = `gantt-capacite-${first}_${last}.xlsx`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
