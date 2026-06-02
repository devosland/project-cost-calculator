/**
 * Avancement agrégé d'un ensemble de tâches pour la vue Carnet (roadmap) — pur.
 *
 * Même convention 0/50/100 que l'EVM serveur (done=1, inprogress=0.5, todo=0),
 * mais pondérée par le **nombre** de tâches (et non les heures estimées) : c'est
 * un indicateur visuel de progression Epic/Story, pas un calcul de coût.
 */

/** Poids d'avancement d'une catégorie de statut. */
function weightOf(category) {
  if (category === 'done') return 1;
  if (category === 'inprogress') return 0.5;
  return 0;
}

/**
 * @param {Array<{status:string}>} tasks
 * @param {Object<string,string>} categoryByStatus - nom de statut → catégorie ('todo'|'inprogress'|'done').
 * @returns {{ done:number, earned:number, total:number, pct:number }}
 *   `done` = nb de tâches terminées ; `earned` = somme pondérée ; `pct` ∈ [0,1].
 */
export function rollupProgress(tasks, categoryByStatus = {}) {
  const list = tasks || [];
  const total = list.length;
  let earned = 0;
  let done = 0;
  for (const tk of list) {
    const category = categoryByStatus[tk.status];
    earned += weightOf(category);
    if (category === 'done') done += 1;
  }
  return { done, earned, total, pct: total > 0 ? earned / total : 0 };
}
