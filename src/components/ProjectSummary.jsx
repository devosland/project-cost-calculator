import React from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Printer } from 'lucide-react';
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
          <Printer className="w-4 h-4" />
          Imprimer
        </Button>
      </div>

      <Card className="print:shadow-none print:border-0">
        <CardContent className="py-8 space-y-8">
          <div className="border-b pb-6">
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-sm text-muted-foreground mt-2">
              {"Rapport g\u00e9n\u00e9r\u00e9 le "}{new Date().toLocaleDateString('fr-CA')}
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-primary/5 rounded-xl print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{"Co\u00fbt total"}</div>
              <div className="text-2xl font-bold text-primary">{fmt(totalCost)}</div>
            </div>
            <div className="p-4 bg-secondary rounded-xl print:bg-white print:border">
              <div className="text-xs text-muted-foreground">{"Dur\u00e9e"}</div>
              <div className="text-xl font-bold">{totalWeeks} semaines</div>
            </div>
            <div className="p-4 bg-secondary rounded-xl print:bg-white print:border">
              <div className="text-xs text-muted-foreground">Membres</div>
              <div className="text-xl font-bold">{totalMembers}</div>
            </div>
            <div className="p-4 bg-secondary rounded-xl print:bg-white print:border">
              <div className="text-xs text-muted-foreground">Taux/semaine</div>
              <div className="text-xl font-bold">{fmt(burnRate)}</div>
            </div>
          </div>

          {hasBudget && (
            <div className="p-4 border rounded-xl">
              <div className="flex justify-between">
                <span className="text-sm font-semibold">Budget</span>
                <span className="font-bold">{fmt(budget)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-sm text-muted-foreground">Variance</span>
                <span className={`font-semibold ${budget >= totalCost ? 'text-emerald-600' : 'text-red-600'}`}>
                  {budget >= totalCost ? '-' : '+'}{fmt(Math.abs(budget - totalCost))}
                </span>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-3">{"Ventilation des co\u00fbts"}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between p-3 bg-secondary rounded-xl print:bg-white print:border">
                <span>{"Main-d\u2019\u0153uvre"}</span>
                <span className="font-semibold">{fmt(labourCost)}</span>
              </div>
              <div className="flex justify-between p-3 bg-secondary rounded-xl print:bg-white print:border">
                <span>{"Autres co\u00fbts"}</span>
                <span className="font-semibold">{fmt(nonLabourCost)}</span>
              </div>
            </div>
            {project.settings.includeContingency && (
              <p className="text-xs text-muted-foreground mt-2">
                Contingence de {project.settings.contingencyPercentage}% incluse
              </p>
            )}
            {project.settings.includeTaxes && (
              <p className="text-xs text-muted-foreground">Taxes (4,9875%) incluses</p>
            )}
          </div>

          <div>
            <h3 className="font-semibold mb-3">Phases</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 text-muted-foreground font-medium">Phase</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">{"Dur\u00e9e"}</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">Membres</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">{"Co\u00fbt/sem."}</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">Total</th>
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
                      <td className="p-2 text-center">{phase.durationWeeks} sem.</td>
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
              <h3 className="font-semibold mb-3">{"Co\u00fbts non li\u00e9s \u00e0 la main-d\u2019\u0153uvre"}</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 text-muted-foreground font-medium">Nom</th>
                    <th className="p-2 text-muted-foreground font-medium">{"Cat\u00e9gorie"}</th>
                    <th className="p-2 text-right text-muted-foreground font-medium">Montant</th>
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
              <h3 className="font-semibold mb-3">Jalons</h3>
              <div className="space-y-1 text-sm">
                {allMilestones.map((m, i) => (
                  <div key={i} className="flex justify-between py-1.5 border-b last:border-b-0">
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted-foreground">{m.phase} — Semaine {m.week}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t pt-4 text-xs text-muted-foreground text-center">
            {"Calculateur de co\u00fbts de projet"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProjectSummary;
