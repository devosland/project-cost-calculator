import React from 'react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { X } from 'lucide-react';
import {
  calculateProjectCost,
  calculateProjectDurationWeeks,
  calculateLabourCost,
  calculateNonLabourCost,
  calculateBurnRate,
  formatCurrency,
} from '../lib/costCalculations';

const ScenarioComparison = ({ projects, rates, selectedIds, onClose }) => {
  const selected = projects.filter((p) => selectedIds.includes(p.id));

  if (selected.length < 2) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {"S\u00e9lectionnez au moins 2 projets pour comparer."}
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
    { label: "Co\u00fbt total", key: 'totalCost', format: fmt },
    { label: "Main-d\u2019\u0153uvre", key: 'labourCost', format: fmt },
    { label: "Autres co\u00fbts", key: 'nonLabourCost', format: fmt },
    { label: "Dur\u00e9e", key: 'duration', format: (v) => `${v} sem.` },
    { label: 'Taux/sem.', key: 'burnRate', format: fmt },
    { label: 'Phases', key: 'phases', format: (v) => v },
    { label: 'Membres', key: 'members', format: (v) => v },
    { label: 'Budget', key: 'budget', format: (v) => (v ? fmt(v) : '\u2014') },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">{"Comparaison de sc\u00e9narios"}</h1>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="w-4 h-4 mr-1" />
          Fermer
        </Button>
      </div>

      <Card>
        <CardContent className="py-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
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
                    <tr key={row.key} className="border-b last:border-b-0 hover:bg-secondary/30 transition-colors">
                      <td className="p-3 font-medium text-muted-foreground">{row.label}</td>
                      {metrics.map((m) => {
                        const val = m[row.key];
                        const isBest = row.key === 'totalCost' && val === minCost && minCost !== maxCost;
                        const isWorst = row.key === 'totalCost' && val === maxCost && minCost !== maxCost;
                        return (
                          <td
                            key={m.id}
                            className={`p-3 text-center ${
                              isBest ? 'text-emerald-600 font-bold' : isWorst ? 'text-red-600 font-bold' : ''
                            }`}
                          >
                            {row.format(val)}
                          </td>
                        );
                      })}
                      <td className="p-3 text-center text-muted-foreground">
                        {diff !== null ? row.format(diff) : '\u2014'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t pt-6 mt-6">
            <h4 className="font-semibold mb-4 text-sm">{"Comparaison visuelle des co\u00fbts"}</h4>
            <div className="space-y-3">
              {metrics.map((m) => (
                <div key={m.id} className="flex items-center gap-3">
                  <span className="text-sm font-medium w-40 truncate">{m.name}</span>
                  <div className="flex-1 h-7 bg-secondary rounded-lg overflow-hidden">
                    <div
                      className={`h-full rounded-lg transition-all duration-500 ${
                        m.totalCost === minCost && minCost !== maxCost
                          ? 'bg-emerald-500'
                          : m.totalCost === maxCost && minCost !== maxCost
                            ? 'bg-red-400'
                            : 'bg-primary'
                      }`}
                      style={{ width: maxCost > 0 ? `${(m.totalCost / maxCost) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-32 text-right">{fmt(m.totalCost)}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScenarioComparison;
