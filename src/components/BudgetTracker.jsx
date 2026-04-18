/**
 * Budget health bar and alert panel for a project. Displays a colour-coded
 * progress bar (green / amber / red) against the project budget, a variance
 * card, and a cost/burn-rate/duration summary grid. Shows a configurable
 * threshold warning (default 80%) before the budget is fully exhausted.
 * Renders nothing special when no budget is set — the grid simply omits the
 * variance card.
 */
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { AlertTriangle } from 'lucide-react';
import {
  calculateProjectCost,
  calculateProjectDurationWeeks,
  calculateBurnRate,
  calculateLabourCost,
  calculateNonLabourCost,
  formatCurrency,
} from '../lib/costCalculations';
import { useLocale } from '../lib/i18n';

/**
 * @param {Object} props
 * @param {Object} props.project - Full project object including budget,
 *   settings (currency, budgetAlertThreshold, webhookUrl, includeContingency,
 *   includeTaxes), phases, and nonLabourCosts.
 * @param {Object} props.rates - Enterprise rate table ({ INTERNAL_RATE,
 *   CONSULTANT_RATES }) used to compute labour cost.
 */
const BudgetTracker = ({ project, rates }) => {
  const { t } = useLocale();
  const currency = project.settings?.currency || 'CAD';
  const fmt = (v) => formatCurrency(v, currency);

  const totalCost = calculateProjectCost(project, rates);
  const labourCost = calculateLabourCost(project, rates);
  const nonLabourCost = calculateNonLabourCost(project);
  const totalWeeks = calculateProjectDurationWeeks(project);
  const burnRate = calculateBurnRate(project, rates);
  const budget = project.budget;

  const hasBudget = budget !== null && budget !== undefined && budget > 0;
  const variance = hasBudget ? budget - totalCost : 0;
  const variancePercent = hasBudget ? (variance / budget) * 100 : 0;
  const usagePercent = hasBudget ? Math.min((totalCost / budget) * 100, 100) : 0;
  const isOverBudget = hasBudget && totalCost > budget;
  const weeksUntilBudgetExhausted = burnRate > 0 && hasBudget ? budget / burnRate : null;

  const alertThreshold = project.settings?.budgetAlertThreshold ?? 80;
  const isAboveThreshold = hasBudget && usagePercent >= alertThreshold && !isOverBudget;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('budget.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {hasBudget && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('budget.usage')}</span>
                <span className={isOverBudget ? 'text-red-600 font-semibold' : 'text-muted-foreground'}>
                  {usagePercent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-3 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isOverBudget
                      ? 'bg-red-500'
                      : usagePercent > alertThreshold
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{fmt(0)}</span>
                <span>{fmt(budget)}</span>
              </div>
            </div>
          )}

          {isAboveThreshold && (
            <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-800">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <div className="text-sm">
                <span className="font-semibold">{t('budget.alert')}</span>{' '}
                {t('budget.alertMessage', { cost: fmt(totalCost), percent: usagePercent.toFixed(1), threshold: alertThreshold })}
                {project.settings?.webhookUrl && ` ${t('budget.webhookConfigured')}`}
              </div>
            </div>
          )}

          <div className={`grid gap-4 ${hasBudget ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3'}`}>
            {hasBudget && (
              <div className={`p-4 rounded-xl border-2 ${isOverBudget ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <div className="text-xs text-muted-foreground">
                  {isOverBudget ? t('budget.overBudget') : t('budget.underBudget')}
                </div>
                <div className={`text-xl font-bold ${isOverBudget ? 'text-red-600' : 'text-emerald-600'}`}>
                  {isOverBudget ? '+' : ''}{fmt(Math.abs(variance))}
                </div>
                <div className="text-xs text-muted-foreground">
                  {variancePercent > 0 ? '+' : ''}{variancePercent.toFixed(1)}%
                </div>
              </div>
            )}

            <div className="p-4 rounded-xl bg-secondary/50">
              <div className="text-xs text-muted-foreground">{t('budget.estimatedCost')}</div>
              <div className="text-xl font-bold">{fmt(totalCost)}</div>
            </div>

            <div className="p-4 rounded-xl bg-secondary/50">
              <div className="text-xs text-muted-foreground">{t('budget.burnRate')}</div>
              <div className="text-xl font-bold">{fmt(burnRate)}</div>
              <div className="text-xs text-muted-foreground">{t('budget.perWeek')}</div>
            </div>

            <div className="p-4 rounded-xl bg-secondary/50">
              <div className="text-xs text-muted-foreground">{t('budget.duration')}</div>
              <div className="text-xl font-bold">{totalWeeks} {t('budget.weeksAbbr')}</div>
              {hasBudget && weeksUntilBudgetExhausted && (
                <div className="text-xs text-muted-foreground">
                  {t('budget.budgetFor', { weeks: weeksUntilBudgetExhausted.toFixed(1) })}
                </div>
              )}
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-semibold mb-3">{t('budget.breakdown')}</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm">{t('budget.labour')}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: totalCost > 0 ? `${(labourCost / totalCost) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-sm font-medium w-28 text-right">{fmt(labourCost)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">{t('budget.otherCosts')}</span>
                <div className="flex items-center gap-3">
                  <div className="w-32 h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full"
                      style={{ width: totalCost > 0 ? `${(nonLabourCost / totalCost) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-sm font-medium w-28 text-right">{fmt(nonLabourCost)}</span>
                </div>
              </div>
              {project.settings.includeContingency && (
                <div className="flex justify-between items-center text-muted-foreground">
                  <span className="text-sm">{t('budget.contingency', { percent: project.settings.contingencyPercentage })}</span>
                  <span className="text-sm">{t('budget.contingencyIncluded')}</span>
                </div>
              )}
              {project.settings.includeTaxes && (
                <div className="flex justify-between items-center text-muted-foreground">
                  <span className="text-sm">{t('budget.taxes')}</span>
                  <span className="text-sm">{t('budget.taxesIncluded')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default BudgetTracker;
