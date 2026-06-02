/**
 * Liens de dépendance pour l'overlay Gantt (SP2b) — pur, sans effet de bord.
 *
 * Produit la liste des arcs prédécesseur→successeur à dessiner dans la
 * TimelineView, avec un drapeau `critical` (les deux extrémités sont sur le
 * chemin critique, SP2). Tolère les dépendances en forme chaîne ou objet via
 * normalizeDependency, et ignore les dépendances pendantes (cible inconnue).
 */
import { calculateCriticalPath } from './criticalPath';
import { normalizeDependency } from './costCalculations';

/**
 * @param {object} project
 * @returns {Array<{ fromId: string, toId: string, type: string, critical: boolean }>}
 */
export function getDependencyLinks(project) {
  const phases = project.phases || [];
  const { byPhase } = calculateCriticalPath(project);
  const ids = new Set(phases.map((p) => p.id));
  const links = [];
  for (const phase of phases) {
    for (const dep of phase.dependencies || []) {
      const { id: fromId, type } = normalizeDependency(dep);
      if (!ids.has(fromId)) continue; // dépendance pendante → ignorée
      const fromCritical = byPhase[fromId]?.critical;
      const toCritical = byPhase[phase.id]?.critical;
      links.push({
        fromId,
        toId: phase.id,
        type,
        critical: Boolean(fromCritical && toCritical),
      });
    }
  }
  return links;
}
