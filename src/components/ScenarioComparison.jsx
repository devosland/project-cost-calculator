/**
 * Side-by-side comparison of two or more project scenarios. Renders a metric
 * table (total cost, labour, non-labour, duration, burn rate, phases, members,
 * budget) with a delta column showing the spread between the min and max values.
 * The cheapest total cost is highlighted green, the most expensive red. A
 * proportional bar chart below the table gives a quick visual cost comparison.
 *
 * Scenarios are existing projects from the project list — no separate
 * scenario store. Comparison is computed entirely client-side.
 */
import React from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { X } from 'lucide-react';
import { useLocale } from '../lib/i18n';
import {
  calculateProjectCost,
  calculateProjectDurationWeeks,
  calculateLabourCost,
  calculateNonLabourCost,
  calculateBurnRate,
  formatCurrency,
} from '../lib/costCalculations';

/**
 * @param {Object} props
 * @param {Array<Object>} props.projects    - Full project list; filtered by selectedIds.
 * @param {Object}        props.rates       - Enterprise rate table for cost calculations.
 * @param {Array<string>} props.selectedIds - IDs of projects to compare (≥ 2).
 * @param {function(): void} props.onClose  - Return to the Dashboard.
 */
const ScenarioComparison = ({ projects, rates, selectedIds, onClose }) => {
  const { t } = useLocale();
  const selected = projects.filter((p) => selectedIds.includes(p.id));

  if (selected.length < 2) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {t('scenario.selectTwo')}
        </CardContent>
      </Card>
    );
  }

  const currency = selected[0]?.settings?.currency || 'CAD';
  const fmt = (v) => formatCurrency(v, currency);

  const metrics = selected.map((p) => ({
    id: p.id,
    name: p.name,
    totalCost: calculateProjectCost(p, rates),
    labourCost: calculateLabourCost(p, rates),
    nonLabourCost: calculateNonLabourCost(p),
    duration: calculateProjectDurationWeeks(p),
    burnRate: calculateBurnRate(p, rates),
    phases: p.phases.length,
    members: p.phases.reduce(
      (sum, ph) => sum + ph.teamMembers.reduce((s, m) => s + m.quantity, 0),
      0
    ),
    budget: p.budget,
  }));

  const minCost = Math.min(...metrics.map((m) => m.totalCost));
  const maxCost = Math.max(...metrics.map((m) => m.totalCost));

  const rows = [
    { label: t('scenario.totalCost'), key: 'totalCost', format: fmt },
    { label: t('scenario.labour'), key: 'labourCost', format: fmt },
    { label: t('scenario.otherCosts'), key: 'nonLabourCost', format: fmt },
    { label: t('scenario.duration'), key: 'duration', format: (v) => `${v} ${t('dashboard.stats.weeks')}` },
    { label: t('scenario.burnRate'), key: 'burnRate', format: fmt },
    { label: t('scenario.phases'), key: 'phases', format: (v) => v },
    { label: t('scenario.members'), key: 'members', format: (v) => v },
    { label: t('scenario.budget'), key: 'budget', format: (v) => (v ? fmt(v) : '\u2014') },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight">{t('scenario.title')}</h1>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4 mr-1" />
          {t('scenario.close')}
        </Button>
      </div>

      <Card>
        <CardContent className="py-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left font-medium text-muted-foreground w-40"></th>
                  {metrics.map((m) => (
                    <th key={m.id} className="p-3 text-center font-semibold">{m.name}</th>
                  ))}
                  <th className="p-3 text-center font-medium text-muted-foreground">{"\u0394"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const values = metrics.map((m) => m[row.key]);
                  const numericValues = values.filter((v) => typeof v === 'number' && v > 0);
                  const diff =
                    numericValues.length >= 2
                      ? Math.max(...numericValues) - Math.min(...numericValues)
                      : null;

                  return (
                    <tr key={row.key} className="border-b border-border last:border-b-0 hover:bg-muted/60 transition-colors">
                      <td className="p-3 font-medium text-muted-foreground">{row.label}</td>
                      {metrics.map((m) => {
                        const val = m[row.key];
                        const isBest = row.key === 'totalCost' && val === minCost && minCost !== maxCost;
                        const isWorst = row.key === 'totalCost' && val === maxCost && minCost !== maxCost;
                        const highlightToken = isBest ? '--prism-success' : isWorst ? '--prism-error' : null;
                        return (
                          <td
                            key={m.id}
                            className={`p-3 text-center font-mono tabular-nums ${highlightToken ? 'font-bold' : ''}`}
                            style={highlightToken ? { color: `var(${highlightToken})` } : undefined}
                          >
                            {row.format(val)}
                          </td>
                        );
                      })}
                      <td className="p-3 text-center text-muted-foreground font-mono tabular-nums">
                        {diff !== null ? row.format(diff) : '\u2014'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border pt-6 mt-6">
            <h4 className="font-display font-semibold mb-4 text-sm tracking-tight">{t('scenario.visualComparison')}</h4>
            <div className="space-y-3">
              {metrics.map((m) => {
                const barToken =
                  m.totalCost === minCost && minCost !== maxCost ? '--prism-success'
                  : m.totalCost === maxCost && minCost !== maxCost ? '--prism-error'
                  : null;
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-40 truncate">{m.name}</span>
                    <div className="flex-1 h-7 bg-muted rounded-lg overflow-hidden">
                      <div
                        className="h-full rounded-lg transition-all duration-500"
                        style={{
                          width: maxCost > 0 ? `${(m.totalCost / maxCost) * 100}%` : '0%',
                          backgroundColor: barToken ? `var(${barToken})` : 'hsl(var(--primary))',
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold font-mono tabular-nums w-32 text-right">{fmt(m.totalCost)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScenarioComparison;
