/**
 * Visual timeline (Gantt-style) for project phases with cost breakdown table
 * and milestone list. Phase bars are positioned using percentage offsets
 * derived from calculateProjectDurationWithDependencies so parallel phases
 * (with dependency links) are placed correctly. Week markers adapt their
 * density to the total duration (every 1, 2, or 4 weeks). Supports iCal
 * export of milestones via exportCalendar.
 */
import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Flag, Calendar } from 'lucide-react';
import { exportCalendar } from '../lib/projectStore';
import {
  calculatePhaseWeeklyCost,
  calculatePhaseTotalCost,
  calculateProjectDurationWithDependencies,
  formatCurrency,
} from '../lib/costCalculations';
import { useLocale } from '../lib/i18n';

const COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
];

const LIGHT_COLORS = [
  'bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700', 'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700', 'bg-teal-100 text-teal-700',
];

/**
 * @param {Object} props
 * @param {Object} props.project        - Full project with phases, milestones, settings.
 * @param {Object} props.rates          - Enterprise rate table for cost calculations.
 * @param {string} [props.currency='CAD'] - ISO currency code for the cost breakdown table.
 */
const TimelineView = ({ project, rates, currency = 'CAD' }) => {
  const { t } = useLocale();
  const fmt = (v) => formatCurrency(v, currency);
  const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies(project);

  if (totalWeeks === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          {t('timeline.empty')}
        </CardContent>
      </Card>
    );
  }

  const scheduleMap = new Map(phaseSchedule.map((s) => [s.phaseId, s]));

  const weekMarkers = [];
  // Adapt marker density to avoid label crowding on long timelines.
  const markerStep = totalWeeks <= 12 ? 1 : totalWeeks <= 24 ? 2 : 4;
  for (let i = 0; i <= totalWeeks; i += markerStep) weekMarkers.push(i);
  if (weekMarkers[weekMarkers.length - 1] !== totalWeeks) weekMarkers.push(totalWeeks);

  const phasesWithOffsets = project.phases.map((phase, index) => {
    const schedule = scheduleMap.get(phase.id);
    const offset = schedule ? schedule.startWeek : 0;
    return { ...phase, offset, colorIndex: index % COLORS.length };
  });

  let runningTotal = 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>{t('timeline.title')}</CardTitle>
          {phasesWithOffsets.some((p) => p.milestones.length > 0) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCalendar(project)}
              className="flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              {t('timeline.calendar')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-8">
          <div className="space-y-3">
            <div className="relative h-6 ml-20 sm:ml-36">
              {weekMarkers.map((week) => (
                <div
                  key={week}
                  className="absolute text-xs text-muted-foreground -translate-x-1/2 font-medium"
                  style={{ left: `${(week / totalWeeks) * 100}%` }}
                >
                  {t('timeline.weekLabel', { week })}
                </div>
              ))}
            </div>

            {phasesWithOffsets.map((phase) => {
              const left = (phase.offset / totalWeeks) * 100;
              const width = (phase.durationWeeks / totalWeeks) * 100;

              return (
                <div key={phase.id} className="flex items-center gap-3">
                  <div className="w-20 sm:w-36 text-sm font-medium truncate text-right pr-2">
                    {phase.name}
                  </div>
                  <div className="flex-1 relative h-9">
                    <div className="absolute inset-0">
                      {weekMarkers.map((week) => (
                        <div
                          key={week}
                          className="absolute top-0 bottom-0 border-l border-border/50"
                          style={{ left: `${(week / totalWeeks) * 100}%` }}
                        />
                      ))}
                    </div>
                    <div
                      className={`absolute top-0 h-full rounded-lg ${COLORS[phase.colorIndex]} opacity-90 flex items-center justify-center shadow-sm`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <span className="text-white text-xs font-semibold truncate px-2">
                        {phase.durationWeeks} {t('budget.weeksAbbr')}
                      </span>
                    </div>
                    {phase.milestones.map((milestone) => {
                      const milestoneLeft = ((phase.offset + milestone.weekOffset) / totalWeeks) * 100;
                      return (
                        <div
                          key={milestone.id}
                          className="absolute top-0 h-full flex items-center z-10"
                          style={{ left: `${milestoneLeft}%` }}
                          title={`${milestone.name} (${t('timeline.weekLabel', { week: phase.offset + milestone.weekOffset })})`}
                        >
                          <Flag className="w-3.5 h-3.5 text-amber-500 -translate-x-1/2 drop-shadow-sm" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t pt-6">
            <h4 className="font-semibold mb-4">{t('timeline.costBreakdown')}</h4>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2 text-muted-foreground font-medium">{t('timeline.phase')}</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">{t('timeline.duration')}</th>
                  <th className="p-2 text-center text-muted-foreground font-medium">{t('timeline.members')}</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">{t('timeline.costPerWeek')}</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">{t('timeline.phaseCost')}</th>
                  <th className="p-2 text-right text-muted-foreground font-medium">{t('timeline.cumulative')}</th>
                </tr>
              </thead>
              <tbody>
                {phasesWithOffsets.map((phase) => {
                  const weeklyCost = calculatePhaseWeeklyCost(phase, rates);
                  const phaseTotalCost = calculatePhaseTotalCost(phase, rates);
                  runningTotal += phaseTotalCost;
                  const memberCount = phase.teamMembers.reduce((s, m) => s + m.quantity, 0);

                  return (
                    <tr key={phase.id} className="border-b last:border-b-0 hover:bg-secondary/30 transition-colors">
                      <td className="p-2">
                        <span className={`inline-block w-3 h-3 rounded-sm mr-2 ${COLORS[phase.colorIndex]}`} />
                        {phase.name}
                      </td>
                      <td className="p-2 text-center">{phase.durationWeeks} {t('budget.weeksAbbr')}</td>
                      <td className="p-2 text-center">{memberCount}</td>
                      <td className="p-2 text-right">{fmt(weeklyCost)}</td>
                      <td className="p-2 text-right font-semibold">{fmt(phaseTotalCost)}</td>
                      <td className="p-2 text-right text-muted-foreground">{fmt(runningTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          {phasesWithOffsets.some((p) => p.milestones.length > 0) && (
            <div className="border-t pt-6">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Flag className="w-4 h-4 text-amber-500" />
                {t('timeline.milestones')}
              </h4>
              <div className="space-y-1">
                {phasesWithOffsets.flatMap((phase) =>
                  phase.milestones.map((m) => ({
                    ...m,
                    phaseName: phase.name,
                    absoluteWeek: phase.offset + m.weekOffset,
                    colorIndex: phase.colorIndex,
                  }))
                )
                  .sort((a, b) => a.absoluteWeek - b.absoluteWeek)
                  .map((m) => (
                    <div key={m.id} className="flex items-center justify-between text-sm py-1.5">
                      <div className="flex items-center gap-2">
                        <Flag className="w-3 h-3 text-amber-500" />
                        <span className="font-medium">{m.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LIGHT_COLORS[m.colorIndex]}`}>
                          {m.phaseName}
                        </span>
                      </div>
                      <span className="text-muted-foreground">{t('timeline.weekLabel', { week: m.absoluteWeek })}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default TimelineView;
