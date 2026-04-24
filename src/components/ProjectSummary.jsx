/**
 * Print-ready project summary report. Renders total cost, duration, burn rate,
 * budget variance, per-phase breakdown, named resource cost table, non-labour
 * costs, and chronological milestones. Includes a browser-print button.
 *
 * Resource cost calculation in this component mirrors the logic in
 * costCalculations but is applied locally per member with prorating by
 * startMonth/endMonth, capped to the phase duration — kept local to avoid
 * changing the shared library for a single display use-case.
 */
import React, { useState, useEffect } from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Download } from 'lucide-react';
import { useLocale, getDateLocale } from '../lib/i18n';
import { executionApi } from '../lib/executionApi';
import {
  calculateProjectCost,
  calculateProjectDurationWeeks,
  calculateLabourCost,
  calculateNonLabourCost,
  calculatePhaseTotalCost,
  calculateMemberProratedCost,
  calculateBurnRate,
  formatCurrency,
} from '../lib/costCalculations';

/**
 * @param {Object} props
 * @param {Object} props.project - Full project object with phases, settings,
 *   budget, and nonLabourCosts.
 * @param {Object} props.rates - Enterprise rate table for labour cost derivation.
 */
const ProjectSummary = ({ project, rates }) => {
  const { t, locale } = useLocale();
  const currency = project.settings?.currency || 'CAD';
  const fmt = (v) => formatCurrency(v, currency);

  const totalCost = calculateProjectCost(project, rates);
  const labourCost = calculateLabourCost(project, rates);
  const nonLabourCost = calculateNonLabourCost(project);
  const totalWeeks = calculateProjectDurationWeeks(project);
  const burnRate = calculateBurnRate(project, rates);
  const budget = project.budget;
  const hasBudget = budget !== null && budget !== undefined && budget > 0;

  // Actuals pulled from the execution module. Non-fatal: empty projects
  // and shares without execution visibility still render the rest of the
  // summary normally; the actuals row falls back to zeros.
  const [actuals, setActuals] = useState({ hours: 0, cost: 0 });
  useEffect(() => {
    let cancelled = false;
    executionApi.getActuals(project.id)
      .then((d) => { if (!cancelled) setActuals({ hours: d.hours || 0, cost: d.cost || 0 }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project.id]);

  const totalMembers = project.phases.reduce(
    (sum, p) => sum + p.teamMembers.reduce((s, m) => s + m.quantity, 0),
    0
  );

  const allMilestones = [];
  let weekOffset = 0;
  for (const phase of project.phases) {
    for (const m of phase.milestones) {
      allMilestones.push({ name: m.name, phase: phase.name, week: weekOffset + m.weekOffset });
    }
    weekOffset += phase.durationWeeks;
  }
  allMilestones.sort((a, b) => a.week - b.week);

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden">
        <Button onClick={() => window.print()} className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          {t('summary.export')}
        </Button>
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardContent className="py-8 space-y-8">
          <div className="border-b border-border pb-6">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {t('summary.generatedOn')}{new Date().toLocaleDateString(getDateLocale(locale))}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-primary/10 rounded-lg print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{t('summary.totalCost')}</div>
              <div className="font-mono text-2xl font-semibold tabular-nums text-primary">{fmt(totalCost)}</div>
            </div>
            <div className="p-4 bg-muted rounded-lg print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{t('summary.duration')}</div>
              <div className="font-mono text-xl font-semibold tabular-nums">{totalWeeks} {t('dashboard.weeks')}</div>
            </div>
            <div className="p-4 bg-muted rounded-lg print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{t('summary.members')}</div>
              <div className="font-mono text-xl font-semibold tabular-nums">{totalMembers}</div>
            </div>
            <div className="p-4 bg-muted rounded-lg print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{t('summary.ratePerWeek')}</div>
              <div className="font-mono text-xl font-semibold tabular-nums">{fmt(burnRate)}</div>
            </div>
          </div>

          {hasBudget && (
            <div className="p-4 border border-border rounded-lg">
              <div className="flex justify-between">
                <span className="text-sm font-semibold">{t('summary.budget')}</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(budget)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-sm text-muted-foreground">{t('summary.variance')}</span>
                <span
                  className="font-mono font-semibold tabular-nums"
                  style={{ color: `var(${budget >= totalCost ? '--prism-success' : '--prism-error'})` }}
                >
                  {budget >= totalCost ? '-' : '+'}{fmt(Math.abs(budget - totalCost))}
                </span>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-display font-semibold mb-3 tracking-tight">{t('summary.costBreakdown')}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between p-3 bg-muted rounded-lg print:bg-white print:border">
                <span>{t('summary.labour')}</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(labourCost)}</span>
              </div>
              <div className="flex justify-between p-3 bg-muted rounded-lg print:bg-white print:border">
                <span>{t('summary.otherCosts')}</span>
                <span className="font-mono font-semibold tabular-nums">{fmt(nonLabourCost)}</span>
              </div>
            </div>
            {project.settings.includeContingency && (
              <p className="text-xs text-muted-foreground mt-2">
                {t('summary.contingencyIncluded', { percent: project.settings.contingencyPercentage })}
              </p>
            )}
            {project.settings.includeTaxes && (
              <p className="text-xs text-muted-foreground">
                {t('summary.taxesIncluded', { percent: project.settings.taxRate ?? 4.9875 })}
              </p>
            )}

            {/* Actuals from logged time — appears even when zero so the loop
                between execution and pilotage is always visible on the report. */}
            <div className="mt-4 pt-3 border-t border-border print:break-inside-avoid">
              <h4 className="text-sm font-semibold mb-2">{t('summary.actualsTitle')}</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between p-2 bg-muted rounded print:bg-white print:border">
                  <span>{t('summary.hoursLogged')}</span>
                  <span className="font-mono font-semibold tabular-nums">{actuals.hours.toFixed(2)} h</span>
                </div>
                <div className="flex justify-between p-2 bg-muted rounded print:bg-white print:border">
                  <span>{t('summary.actualCost')}</span>
                  <span className="font-mono font-semibold tabular-nums">{fmt(actuals.cost)}</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-display font-semibold mb-3 tracking-tight">{t('summary.phases')}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="p-2 text-muted-foreground font-medium">{t('summary.phase')}</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">{t('summary.duration')}</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">{t('summary.members')}</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">{t('summary.costPerWeek')}</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">{t('summary.total')}</th>
                </tr>
              </thead>
              <tbody>
                {project.phases.map((phase) => {
                  const tc = calculatePhaseTotalCost(phase, rates);
                  const wc = phase.durationWeeks > 0 ? tc / phase.durationWeeks : 0;
                  const mc = phase.teamMembers.reduce((s, m) => s + m.quantity, 0);
                  return (
                    <tr key={phase.id} className="border-b border-border last:border-b-0">
                      <td className="p-2 font-medium">{phase.name}</td>
                      <td className="p-2 text-center font-mono tabular-nums">{phase.durationWeeks} {t('dashboard.stats.weeks')}</td>
                      <td className="p-2 text-center font-mono tabular-nums">{mc}</td>
                      <td className="p-2 text-right font-mono tabular-nums">{fmt(wc)}</td>
                      <td className="p-2 text-right font-mono tabular-nums font-semibold">{fmt(tc)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {project.phases.some(p => p.teamMembers?.some(m => m.resourceName)) && (
            <div>
              <h3 className="font-display font-semibold mb-3 tracking-tight">{t('capacity.resources')}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="p-2 text-muted-foreground font-medium">{t('resources.name')}</th>
                    <th className="p-2 text-muted-foreground font-medium">{t('resources.role')}</th>
                    <th className="p-2 text-muted-foreground font-medium">{t('resources.type')}</th>
                    <th className="p-2 text-center text-muted-foreground font-medium">{t('phase.period')}</th>
                    <th className="p-2 text-right text-muted-foreground font-medium">{t('summary.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {project.phases.flatMap(phase =>
                    (phase.teamMembers || [])
                      .filter(m => m.resourceName)
                      .map(m => {
                        const cost = calculateMemberProratedCost(m, rates, phase.durationWeeks);
                        // 'Employé interne' is the canonical level key for permanent staff;
                        // the Permanent badge is derived at runtime, not stored separately.
                        const isPermanent = m.level === 'Employé interne';
                        const badgeToken = isPermanent ? '--prism-success' : '--prism-warning';
                        return (
                          <tr key={`${phase.id}-${m.resourceName}`} className="border-b border-border last:border-b-0">
                            <td className="p-2 font-medium">{m.resourceName}</td>
                            <td className="p-2">{m.role}</td>
                            <td className="p-2">
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{
                                  backgroundColor: `color-mix(in srgb, var(${badgeToken}) 18%, transparent)`,
                                  color: `var(${badgeToken})`,
                                }}
                              >
                                {isPermanent ? t('capacity.permanent') : t('capacity.consultant')}
                              </span>
                            </td>
                            <td className="p-2 text-center text-xs font-mono tabular-nums">
                              {m.startMonth && m.endMonth ? `${m.startMonth} → ${m.endMonth}` : `${phase.durationWeeks} ${t('dashboard.stats.weeks')}`}
                            </td>
                            <td className="p-2 text-right font-mono tabular-nums font-medium">{fmt(cost)}</td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {(project.nonLabourCosts || []).length > 0 && (
            <div>
              <h3 className="font-display font-semibold mb-3 tracking-tight">{t('summary.nonLabourCosts')}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="p-2 text-muted-foreground font-medium">{t('summary.name')}</th>
                    <th className="p-2 text-muted-foreground font-medium">{t('summary.category')}</th>
                    <th className="p-2 text-right text-muted-foreground font-medium">{t('summary.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {project.nonLabourCosts.map((cost) => (
                    <tr key={cost.id} className="border-b border-border last:border-b-0">
                      <td className="p-2">{cost.name}</td>
                      <td className="p-2">{cost.category}</td>
                      <td className="p-2 text-right font-mono tabular-nums font-medium">{fmt(cost.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {allMilestones.length > 0 && (
            <div>
              <h3 className="font-display font-semibold mb-3 tracking-tight">{t('summary.milestones')}</h3>
              <div className="space-y-1 text-sm">
                {allMilestones.map((m, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b border-border last:border-b-0">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground">{m.phase} — <span className="font-mono tabular-nums">{t('summary.weekNum', { week: m.week })}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border pt-4 text-xs text-muted-foreground text-center">
            {t('summary.footer')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectSummary;
