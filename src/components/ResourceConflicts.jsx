import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { AlertTriangle, CheckCircle } from 'lucide-react';
import { calculateProjectDurationWithDependencies } from '../lib/costCalculations';

const ResourceConflicts = ({ project, rates }) => {
  const { phaseSchedule } = calculateProjectDurationWithDependencies(project);
  const phases = project.phases || [];

  if (phases.length === 0 || phaseSchedule.length === 0) return null;

  const scheduleMap = new Map(phaseSchedule.map((s) => [s.phaseId, s]));

  // Build a list of all role+level allocations per week
  const weekAllocations = {};

  for (const phase of phases) {
    const schedule = scheduleMap.get(phase.id);
    if (!schedule) continue;

    for (const member of phase.teamMembers) {
      const key = `${member.role}|${member.level}`;
      for (let w = schedule.startWeek; w < schedule.endWeek; w++) {
        if (!weekAllocations[key]) weekAllocations[key] = {};
        weekAllocations[key][w] = (weekAllocations[key][w] || 0) + member.allocation * member.quantity;
      }
    }
  }

  // Find conflicts (allocation > 100%)
  const conflicts = [];
  for (const [key, weeks] of Object.entries(weekAllocations)) {
    const [role, level] = key.split('|');
    // Group consecutive overallocated weeks into ranges
    const overWeeks = Object.entries(weeks)
      .filter(([, alloc]) => alloc > 100)
      .map(([w, alloc]) => ({ week: parseInt(w), alloc }))
      .sort((a, b) => a.week - b.week);

    if (overWeeks.length === 0) continue;

    // Group into ranges
    let rangeStart = overWeeks[0].week;
    let rangeEnd = overWeeks[0].week;
    let maxAlloc = overWeeks[0].alloc;

    for (let i = 1; i <= overWeeks.length; i++) {
      if (i < overWeeks.length && overWeeks[i].week === rangeEnd + 1) {
        rangeEnd = overWeeks[i].week;
        maxAlloc = Math.max(maxAlloc, overWeeks[i].alloc);
      } else {
        conflicts.push({ role, level, startWeek: rangeStart, endWeek: rangeEnd, totalAlloc: maxAlloc });
        if (i < overWeeks.length) {
          rangeStart = overWeeks[i].week;
          rangeEnd = overWeeks[i].week;
          maxAlloc = overWeeks[i].alloc;
        }
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {conflicts.length > 0 ? (
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          ) : (
            <CheckCircle className="w-5 h-5 text-green-500" />
          )}
          {"Conflits de ressources"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {conflicts.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600 text-sm p-3 bg-green-50 rounded-lg">
            <CheckCircle className="w-4 h-4" />
            {"Aucun conflit de ressources détecté"}
          </div>
        ) : (
          <div className="space-y-2">
            {conflicts.map((c, i) => (
              <div
                key={i}
                className="flex items-start gap-2 text-sm p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                <span>
                  {"Le rôle "}<strong>{c.role}</strong>{" ("}{c.level}{")"}{" est alloué à "}<strong>{c.totalAlloc}%</strong>
                  {" pendant les semaines "}{c.startWeek}{"-"}{c.endWeek}{" (maximum recommandé\u00a0: 100%)"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ResourceConflicts;
