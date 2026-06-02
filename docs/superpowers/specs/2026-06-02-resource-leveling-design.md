# Design — Nivellement de ressources (suggestions) (SP4)

> Date : 2026-06-02 · Branche `feature/resource-leveling` · Moteur d'ordonnancement niveau phase. SP1/SP2/SP3 livrés. **Mode autonome** (décisions déléguées).

## 1. Objectif

Détecter les **sur-allocations** entre phases qui se chevauchent et partagent un même **rôle+niveau** (> 100 % combiné), et **suggérer** de décaler la phase qui a de la **marge** (SP2) — décalage appliqué via une contrainte **SNET** (SP3). Pas de résolution automatique globale ni de Team Planner drag-drop (→ **SP4b**).

## 2. Calcul — pur `suggestLeveling(project)` (`src/lib/leveling.js`)

- Schedule + marge via `calculateCriticalPath(project)` → `byPhase[id] = {earlyStart, earlyEnd, totalFloat, ...}`.
- Demande d'une phase par `role|level` = Σ `(allocation × quantity)` de ses `teamMembers`.
- Pour chaque paire de phases (A,B) qui **se chevauchent** (`overlap = min(Aend,Bend) − max(Astart,Bstart) > 0`) et partagent un `role|level` dont la **somme des allocations > 100** : choisir la phase **avec marge** (`float > 0` ; A prioritaire sinon B) ; `delay = min(float, overlap)` ; si `delay > 0`, proposer `{ phaseId, phaseName, role, level, delayWeeks: delay, newStart: start + delay }`. Dédupe par phase (garde le plus grand `delay`).
- Pur, sans effet de bord ; aucun rôle/niveau partagé ou aucune marge → aucune suggestion.

## 3. UI

Panneau **« Nivellement »** sous `TimelineView` (onglet Ligne de temps de `ProjectView`) : liste des suggestions (« Décaler _Phase_ de N sem. — rôle/niveau sur-alloué ») + bouton **Appliquer** → `update(phase, constraint:{type:'SNET', week:newStart})` (réutilise SP3 ; la phase étant à marge, la fin du projet ne bouge pas). État vide : « Aucune sur-allocation à niveler ».

## 4. i18n

`leveling.title` (« Nivellement »), `leveling.empty`, `leveling.suggestion` (gabarit), `leveling.apply` (« Appliquer »), réutilise `budget.weeksAbbr`.

## 5. Tests (TDD)

`suggestLeveling` (pur) : 2 phases parallèles même rôle/niveau > 100 %, l'une à marge → suggestion `delay = min(float, overlap)` + `newStart` ; pas de chevauchement → vide ; chevauchement mais ≤ 100 % → vide ; sur-alloc mais aucune phase à marge (toutes critiques) → vide ; dédup. UI : build + manuel.

## 6. Rétro-compat & portée

Additif : 1 lib pure + 1 panneau UI + i18n. N'écrit que via la contrainte SNET de SP3 (mécanisme existant). **Hors périmètre** : nivellement cross-projets (pool capacité), résolution auto globale, Team Planner drag-drop (SP4b), prise en compte des `resource_assignments` serveur (SP4 raisonne sur les `teamMembers` du projet).
