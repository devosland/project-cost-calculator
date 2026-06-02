/**
 * Chemin critique + marges (CPM au niveau phase) — pur, sans effet de bord (SP2).
 *
 * Réutilise l'ordonnanceur SP1 pour la passe avant (early start/finish), puis
 * fait une passe arrière (late start/finish) en inversant les contraintes
 * FS/SS/FF/SF + lag. `lateEnd` est plafonné à `totalWeeks` (aucune phase ne
 * finit après la fin du projet). Marge totale = late − early ; critique = marge ≤ 0.
 *
 * Dégradation : sur un cycle (l'ordonnanceur retombe en séquentiel) ou en
 * l'absence de dépendances, toutes les phases sont marquées critiques (marge 0).
 */
import { calculateProjectDurationWithDependencies, normalizeDependency } from './costCalculations';

/**
 * @param {object} project
 * @returns {{ totalWeeks: number, byPhase: Object<string,{earlyStart,earlyEnd,lateStart,lateEnd,totalFloat,critical}> }}
 */
export function calculateCriticalPath(project) {
  const phases = project.phases || [];
  const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies(project);
  const early = Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));
  const phaseMap = new Map(phases.map((p) => [p.id, p]));

  const depsOf = (phase) =>
    (phase.dependencies || []).map(normalizeDependency).filter((d) => phaseMap.has(d.id));

  const allCritical = () => {
    const byPhase = {};
    for (const p of phases) {
      const e = early[p.id] || { startWeek: 0, endWeek: p.durationWeeks };
      byPhase[p.id] = {
        earlyStart: e.startWeek,
        earlyEnd: e.endWeek,
        lateStart: e.startWeek,
        lateEnd: e.endWeek,
        totalFloat: 0,
        critical: true,
      };
    }
    return { totalWeeks, byPhase };
  };

  const hasDependencies = phases.some((p) => depsOf(p).length > 0);
  if (!hasDependencies) return allCritical();

  const visited = new Set();
  const visiting = new Set();
  let hasCycle = false;
  function detect(id) {
    if (visiting.has(id)) {
      hasCycle = true;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const phase = phaseMap.get(id);
    if (phase) for (const dep of depsOf(phase)) detect(dep.id);
    visiting.delete(id);
    visited.add(id);
  }
  for (const p of phases) {
    detect(p.id);
    if (hasCycle) break;
  }
  if (hasCycle) return allCritical();

  const successors = new Map(phases.map((p) => [p.id, []]));
  for (const succ of phases) {
    for (const dep of depsOf(succ)) {
      successors.get(dep.id).push({ succId: succ.id, type: dep.type, lag: dep.lag });
    }
  }

  const lateEndMap = new Map();
  function getLateEnd(id) {
    if (lateEndMap.has(id)) return lateEndMap.get(id);
    const phase = phaseMap.get(id);
    const d = phase.durationWeeks;
    let lateEnd = totalWeeks;
    for (const s of successors.get(id)) {
      const succPhase = phaseMap.get(s.succId);
      const sLateEnd = getLateEnd(s.succId);
      const sLateStart = sLateEnd - succPhase.durationWeeks;
      let bound;
      switch (s.type) {
        case 'FF':
          bound = sLateEnd - s.lag;
          break;
        case 'SS':
          bound = sLateStart - s.lag + d;
          break;
        case 'SF':
          bound = sLateEnd - s.lag + d;
          break;
        case 'FS':
        default:
          bound = sLateStart - s.lag;
          break;
      }
      lateEnd = Math.min(lateEnd, bound);
    }
    lateEndMap.set(id, lateEnd);
    return lateEnd;
  }

  const byPhase = {};
  for (const p of phases) {
    const e = early[p.id];
    const lateEnd = getLateEnd(p.id);
    const lateStart = lateEnd - p.durationWeeks;
    const totalFloat = lateStart - e.startWeek;
    byPhase[p.id] = {
      earlyStart: e.startWeek,
      earlyEnd: e.endWeek,
      lateStart,
      lateEnd,
      totalFloat,
      critical: totalFloat <= 0,
    };
  }
  return { totalWeeks, byPhase };
}
