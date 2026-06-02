/**
 * Suggestions de nivellement de ressources (SP4) — pur, sans effet de bord.
 *
 * Croise les phases qui se chevauchent et partagent un rôle+niveau dont la
 * somme des allocations dépasse 100 %, et propose de décaler la phase ayant de
 * la marge (CPM, SP2) — appliqué via une contrainte SNET (SP3). Raisonne sur les
 * teamMembers du projet (pas le pool capacité cross-projets).
 */
import { calculateCriticalPath } from './criticalPath';

/** Demande par `role|level` d'une phase = Σ (allocation × quantity). */
function phaseDemand(phase) {
  const map = {};
  for (const m of phase.teamMembers || []) {
    const key = `${m.role}|${m.level}`;
    map[key] = (map[key] || 0) + (m.allocation || 0) * (m.quantity || 1);
  }
  return map;
}

/**
 * @param {object} project
 * @returns {Array<{ phaseId, phaseName, role, level, delayWeeks, newStart }>}
 */
export function suggestLeveling(project) {
  const phases = project.phases || [];
  const { byPhase } = calculateCriticalPath(project);
  const info = phases.map((p) => {
    const cp = byPhase[p.id] || { earlyStart: 0, earlyEnd: p.durationWeeks, totalFloat: 0 };
    return {
      id: p.id,
      name: p.name,
      start: cp.earlyStart,
      end: cp.earlyEnd,
      float: cp.totalFloat,
      demand: phaseDemand(p),
    };
  });

  const byId = {};
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const A = info[i];
      const B = info[j];
      const overlap = Math.min(A.end, B.end) - Math.max(A.start, B.start);
      if (overlap <= 0) continue;
      for (const key of Object.keys(A.demand)) {
        if (!(key in B.demand)) continue;
        if (A.demand[key] + B.demand[key] <= 100) continue;
        const floated = A.float > 0 ? A : B.float > 0 ? B : null;
        if (!floated) continue;
        const delay = Math.min(floated.float, overlap);
        if (delay <= 0) continue;
        const [role, level] = key.split('|');
        const candidate = {
          phaseId: floated.id,
          phaseName: floated.name,
          role,
          level,
          delayWeeks: delay,
          newStart: floated.start + delay,
        };
        const cur = byId[floated.id];
        if (!cur || delay > cur.delayWeeks) byId[floated.id] = candidate;
      }
    }
  }
  return Object.values(byId);
}
