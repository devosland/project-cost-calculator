import React from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Download } from 'lucide-react';
import { useLocale, getDateLocale } from '../lib/i18n';
import {
  calculateProjectCost,
  calculateProjectDurationWeeks,
  calculateLabourCost,
  calculateNonLabourCost,
  calculatePhaseWeeklyCost,
  calculatePhaseTotalCost,
  calculateBurnRate,
  formatCurrency,
} from '../lib/costCalculations';

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
          <div className="border-b pb-6">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {t('summary.generatedOn')}{new Date().toLocaleDateString(getDateLocale(locale))}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-primary/5 rounded-xl print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{t('summary.totalCost')}</div>
              <div className="text-2xl font-bold text-primary">{fmt(totalCost)}</div>
            </div>
            <div className="p-4 bg-secondary rounded-xl print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{t('summary.duration')}</div>
              <div className="text-xl font-bold">{totalWeeks} {t('dashboard.weeks')}</div>
            </div>
            <div className="p-4 bg-secondary rounded-xl print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{t('summary.members')}</div>
              <div className="text-xl font-bold">{totalMembers}</div>
            </div>
            <div className="p-4 bg-secondary rounded-xl print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{t('summary.ratePerWeek')}</div>
              <div className="text-xl font-bold">{fmt(burnRate)}</div>
            </div>
          </div>

          {hasBudget && (
            <div className="p-4 border rounded-xl">
              <div className="flex justify-between">
                <span className="text-sm font-semibold">{t('summary.budget')}</span>
                <span className="font-bold">{fmt(budget)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-sm text-muted-foreground">{t('summary.variance')}</span>
                <span className={`font-semibold ${budget >= totalCost ? 'text-emerald-600' : 'text-red-600'}`}>
                  {budget >= totalCost ? '-' : '+'}{fmt(Math.abs(budget - totalCost))}
                </span>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-3">{t('summary.costBreakdown')}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between p-3 bg-secondary rounded-xl print:bg-white print:border">
                <span>{t('summary.labour')}</span>
                <span className="font-semibold">{fmt(labourCost)}</span>
              </div>
              <div className="flex justify-between p-3 bg-secondary rounded-xl print:bg-white print:border">
                <span>{t('summary.otherCosts')}</span>
                <span className="font-semibold">{fmt(nonLabourCost)}</span>
              </div>
            </div>
            {project.settings.includeContingency && (
              <p className="text-xs text-muted-foreground mt-2">
                {t('summary.contingencyIncluded', { percent: project.settings.contingencyPercentage })}
              </p>
            )}
            {project.settings.includeTaxes && (
              <p className="text-xs text-muted-foreground">{t('summary.taxesIncluded')}</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-3">{t('summary.phases')}</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 text-muted-foreground font-medium">{t('summary.phase')}</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">{t('summary.duration')}</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">{t('summary.members')}</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">{t('summary.costPerWeek')}</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">{t('summary.total')}</th>
                </tr>
              </thead>
              <tbody>
                {project.phases.map((phase) => {
                  const wc = calculatePhaseWeeklyCost(phase, rates);
                  const tc = calculatePhaseTotalCost(phase, rates);
                  const mc = phase.teamMembers.reduce((s, m) => s + m.quantity, 0);
                  return (
                    <tr key={phase.id} className="border-b last:border-b-0">
                      <td className="p-2 font-medium">{phase.name}</td>
                      <td className="p-2 text-center">{phase.durationWeeks} {t('dashboard.stats.weeks')}</td>
                      <td className="p-2 text-center">{mc}</td>
                      <td className="p-2 text-right">{fmt(wc)}</td>
                      <td className="p-2 text-right font-semibold">{fmt(tc)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(project.nonLabourCosts || []).length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">{t('summary.nonLabourCosts')}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 text-muted-foreground font-medium">{t('summary.name')}</th>
                    <th className="p-2 text-muted-foreground font-medium">{t('summary.category')}</th>
                    <th className="p-2 text-right text-muted-foreground font-medium">{t('summary.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {project.nonLabourCosts.map((cost) => (
                    <tr key={cost.id} className="border-b last:border-b-0">
                      <td className="p-2">{cost.name}</td>
                      <td className="p-2">{cost.category}</td>
                      <td className="p-2 text-right font-medium">{fmt(cost.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {allMilestones.length > 0 && (
            <div>
              <h3 className="font-semibold mb-3">{t('summary.milestones')}</h3>
              <div className="space-y-1 text-sm">
                {allMilestones.map((m, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b last:border-b-0">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground">{m.phase} — {t('summary.weekNum', { week: m.week })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-4 text-xs text-muted-foreground text-center">
            {t('summary.footer')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectSummary;
