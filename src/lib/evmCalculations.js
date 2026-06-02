/**
 * Calculs de valeur acquise (EVM) — purs, sans effet de bord (chantier D).
 *
 * Niveau de calcul : la phase est le « compte de contrôle ». On agrège ensuite
 * au projet. PV est dérivé du plan vivant (accrual linéaire sur la durée de
 * phase), EV de l'avancement (statuts Kanban remontés par le serveur), AC des
 * réels (time_entries). Baseline figée optionnelle (`project.baseline`) : si
 * présente, PV/BAC mesurés contre elle ; sinon plan vivant.
 */
import {
  calculatePhaseTotalCost,
  calculateProjectDurationWithDependencies,
} from './costCalculations';

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/**
 * Avancement [0..1] d'une phase à partir des agrégats du rollup serveur.
 * Pondéré par les heures estimées ; repli sur le nombre de tâches si aucune
 * estimation n'existe dans la phase.
 * @param {{earned?:number, est?:number, taskCount?:number, earnedCount?:number}} [agg]
 * @returns {number}
 */
export function phaseProgressPct(agg) {
  const { earned = 0, est = 0, taskCount = 0, earnedCount = 0 } = agg || {};
  if (est > 0) return earned / est;
  if (taskCount > 0) return earnedCount / taskCount;
  return 0;
}

/**
 * Valeur planifiée (PV) d'une phase à une date donnée — accrual LINÉAIRE.
 * @param {number} startWeek  Semaine de début de phase (depuis le début projet).
 * @param {number} endWeek    Semaine de fin de phase.
 * @param {number|null} asOfWeek  Semaine « aujourd'hui » (null = pas de planning).
 * @param {number} phaseCost  Coût planifié total de la phase (BAC_phase).
 * @returns {number|null} PV de la phase, ou null si asOfWeek est null.
 */
export function plannedValueToDate(startWeek, endWeek, asOfWeek, phaseCost) {
  if (asOfWeek == null) return null;
  if (endWeek <= startWeek) return asOfWeek >= endWeek ? phaseCost : 0;
  const frac = Math.max(0, Math.min(1, (asOfWeek - startWeek) / (endWeek - startWeek)));
  return phaseCost * frac;
}

/**
 * Construit une baseline figée (PMB) : snapshot du plan de référence que le PV
 * consommera ensuite. Pur ; `capturedAt` est fourni par l'appelant (pas de Date
 * dans la lib → testable).
 *
 * @param {object} project   Projet (phases, settings).
 * @param {object} rates     Carte de taux.
 * @param {string} capturedAt Date de gel 'YYYY-MM-DD'.
 * @returns {{capturedAt:string, startDate:(string|null), phases:Object<string,{startWeek:number,endWeek:number,bac:number}>}}
 */
export function buildBaseline(project, rates, capturedAt) {
  const { phaseSchedule } = calculateProjectDurationWithDependencies(project);
  const schedById = Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));
  const phases = {};
  for (const phase of project.phases || []) {
    const sched = schedById[phase.id] || { startWeek: 0, endWeek: phase.durationWeeks };
    phases[phase.id] = {
      startWeek: sched.startWeek,
      endWeek: sched.endWeek,
      bac: calculatePhaseTotalCost(phase, rates),
    };
  }
  return {
    capturedAt,
    startDate: project.settings?.startDate || null,
    phases,
  };
}

/**
 * Statut sémantique d'un indice de performance (SPI/CPI) pour le code couleur.
 * Sens inverse de la capacité : un indice >= 1 est bon.
 * @param {number|null} value
 * @returns {'success'|'warning'|'error'|'neutral'} neutral = N/A.
 */
export function indexStatus(value) {
  if (value == null) return 'neutral';
  if (value >= 1) return 'success';
  if (value >= 0.9) return 'warning';
  return 'error';
}

/**
 * Calcule l'EVM complet d'un projet (niveau phase + agrégat projet).
 * @param {object} params
 * @param {object} params.project   Projet (phases, settings).
 * @param {object} params.rates     Carte de taux ({INTERNAL_RATE, CONSULTANT_RATES}).
 * @param {object} params.progress  Map phaseId → agrégats d'avancement (rollup serveur).
 * @param {object} params.actuals   Map phaseId → { hours, cost } (getActuals.by_phase).
 * @param {number|null} params.asOfWeek  Semaines depuis startDate (null si pas de startDate).
 * @returns {{bac, pv, ev, ac, spi, cpi, eac, etc, vac, byPhase}} métriques (null si N/A).
 */
export function computeEvm({ project, rates, progress = {}, actuals = {}, asOfWeek = null }) {
  const { phaseSchedule } = calculateProjectDurationWithDependencies(project);
  const schedById = Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));

  const baseline = project.baseline || null;
  const byPhase = (project.phases || []).map((phase) => {
    const liveBac = calculatePhaseTotalCost(phase, rates);
    const liveSched = schedById[phase.id] || { startWeek: 0, endWeek: phase.durationWeeks };
    // Baseline-aware : PV/BAC mesurés contre le plan figé quand il existe ;
    // sinon plan vivant (comportement chantier D inchangé).
    const bl = baseline && baseline.phases ? baseline.phases[phase.id] : null;
    const bac = bl ? bl.bac : liveBac;
    const startWeek = bl ? bl.startWeek : liveSched.startWeek;
    const endWeek = bl ? bl.endWeek : liveSched.endWeek;
    const pv = plannedValueToDate(startWeek, endWeek, asOfWeek, bac);
    const pct = phaseProgressPct(progress[phase.id]);
    const ev = pct * bac;
    const ac = (actuals[phase.id] && actuals[phase.id].cost) || 0;
    const cpi = ac > 0 ? ev / ac : null;
    const spi = pv != null && pv > 0 ? ev / pv : null;
    return { phaseId: phase.id, name: phase.name, bac, pv, ev, ac, pct, cpi, spi };
  });

  const bac = sum(byPhase.map((p) => p.bac));
  const ev = sum(byPhase.map((p) => p.ev));
  const ac = sum(byPhase.map((p) => p.ac));
  const pv = asOfWeek == null ? null : sum(byPhase.map((p) => p.pv || 0));
  const spi = pv != null && pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? ev / ac : null;
  const eac = cpi != null && cpi > 0 ? bac / cpi : null;
  const etc = eac != null ? eac - ac : null;
  const vac = eac != null ? bac - eac : null;

  return {
    bac,
    pv,
    ev,
    ac,
    spi,
    cpi,
    eac,
    etc,
    vac,
    byPhase,
    hasBaseline: !!baseline,
    baselineCapturedAt: baseline ? baseline.capturedAt : null,
  };
}
