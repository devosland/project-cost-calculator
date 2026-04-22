/**
 * Unit test for the Gantt Excel export generator.
 *
 * We don't validate the rendered spreadsheet pixel-for-pixel — exceljs handles
 * the serialisation. Instead we exercise the generator end-to-end with
 * synthetic data and re-read the produced buffer to assert that:
 *   1. One sheet is created per project that has assignments.
 *   2. The summary block references the labour-total row via a formula.
 *   3. A resource's monthly cost cell contains a formula multiplying the
 *      allocation cell, the rate cell, and the hours cell.
 *   4. The tax multiplier cell holds `1 + taxRate/100`.
 */
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { generateGanttExcelBuffer } from '../ganttExcelExport';

const MONTHS = ['2026-01', '2026-02', '2026-03'];
const RATES = {
  INTERNAL_RATE: 85,
  CONSULTANT_RATES: { Dev: { Senior: 120, Junior: 80 } },
};
const RESOURCES = [
  { id: 1, name: 'Alice', role: 'Dev', level: 'Senior', type: 'permanent' },
  { id: 2, name: 'Bob', role: 'Dev', level: 'Junior', type: 'consultant' },
];
const ASSIGNMENTS = [
  { resource_id: 1, project_id: 10, allocation: 50, start_month: '2026-01', end_month: '2026-02' },
  { resource_id: 2, project_id: 10, allocation: 80, start_month: '2026-01', end_month: '2026-03' },
  { resource_id: 1, project_id: 11, allocation: 100, start_month: '2026-02', end_month: '2026-03' },
];
const PROJECTS = [
  {
    id: 10,
    name: 'Portail Client',
    budget: 500000,
    settings: { taxRate: 4.9875 },
    nonLabourCosts: [
      { id: 'a', name: 'Azure', category: 'Licences', amount: 12000 },
    ],
  },
  { id: 11, name: 'Migration ERP', budget: 800000, settings: { taxRate: 10 }, nonLabourCosts: [] },
];

async function reload(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer));
  return wb;
}

describe('ganttExcelExport', () => {
  it('creates one sheet per project with assignments', async () => {
    const buf = await generateGanttExcelBuffer({
      projects: PROJECTS, resources: RESOURCES, assignments: ASSIGNMENTS, months: MONTHS, rates: RATES,
    });
    const wb = await reload(buf);
    expect(wb.worksheets).toHaveLength(2);
    const names = wb.worksheets.map((w) => w.name).sort();
    expect(names).toEqual(['Migration ERP', 'Portail Client']);
  });

  it('titles the sheet with the project name and fills the summary header', async () => {
    const buf = await generateGanttExcelBuffer({
      projects: PROJECTS, resources: RESOURCES, assignments: ASSIGNMENTS, months: MONTHS, rates: RATES, locale: 'fr',
    });
    const wb = await reload(buf);
    const ws = wb.getWorksheet('Portail Client');
    expect(ws.getCell('A1').value).toBe('Portail Client');
    expect(ws.getCell(3, 1).value).toBe('Poste');
    expect(ws.getCell(3, 2).value).toBe('Budget');
    expect(ws.getCell(3, 3).value).toBe('Estimé');
    expect(ws.getCell(3, 4).value).toBe('RAF');
    expect(ws.getCell(3, 5).value).toBe('Écart');
  });

  it('writes the project budget on the Total row and RAF / Écart as formulas', async () => {
    const buf = await generateGanttExcelBuffer({
      projects: PROJECTS, resources: RESOURCES, assignments: ASSIGNMENTS, months: MONTHS, rates: RATES,
    });
    const wb = await reload(buf);
    const ws = wb.getWorksheet('Portail Client');
    expect(ws.getCell(6, 2).value).toBe(500000);
    const raf = ws.getCell(6, 4).value;
    const ecart = ws.getCell(6, 5).value;
    expect(raf).toHaveProperty('formula');
    expect(ecart).toHaveProperty('formula');
    expect(raf.formula).toContain('B6');
    expect(ecart.formula).toContain('B6');
  });

  it('stores the tax multiplier as (1 + taxRate/100)', async () => {
    const buf = await generateGanttExcelBuffer({
      projects: PROJECTS, resources: RESOURCES, assignments: ASSIGNMENTS, months: MONTHS, rates: RATES,
    });
    const wb = await reload(buf);
    const ws = wb.getWorksheet('Migration ERP');
    // Hunt the "Taxes:" label on row 11; the next cell holds the multiplier.
    for (let c = 1; c <= 40; c++) {
      const v = ws.getCell(11, c).value;
      if (typeof v === 'string' && v.toLowerCase().startsWith('taxes')) {
        const mult = ws.getCell(11, c + 1).value;
        // Migration ERP has taxRate=10 → multiplier 1.10
        expect(mult).toBeCloseTo(1.1, 6);
        return;
      }
    }
    throw new Error('Tax multiplier not found');
  });

  it('fills monthly cost cells with a formula referencing alloc × rate × hours', async () => {
    const buf = await generateGanttExcelBuffer({
      projects: PROJECTS, resources: RESOURCES, assignments: ASSIGNMENTS, months: MONTHS, rates: RATES,
    });
    const wb = await reload(buf);
    const ws = wb.getWorksheet('Portail Client');
    // Resource rows start at row 14. The first resource row's first cost cell is
    // at column G (7): col F=6 is alloc for month 0, col G=7 is cost for month 0.
    const cost = ws.getCell(14, 7).value;
    expect(cost).toHaveProperty('formula');
    // Should reference alloc cell (F14), rate cell (E14), and hours cell (F11).
    expect(cost.formula).toMatch(/F14.*E14.*F\$11|F14.*F\$11.*E14/);
  });

  it('exports a placeholder sheet when there are no assignments', async () => {
    const buf = await generateGanttExcelBuffer({
      projects: [], resources: [], assignments: [], months: MONTHS, rates: RATES, locale: 'fr',
    });
    const wb = await reload(buf);
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0].getCell('A1').value).toMatch(/aucune|no data/i);
  });
});
