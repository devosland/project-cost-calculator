# Design — Ordonnancement ALAP (SP3b)

> Date : 2026-06-02 · Branche `feature/alap-scheduling` · Moteur d'ordonnancement niveau phase. SP1/SP2/SP2b/SP3/SP4 livrés. **Mode autonome** (décisions déléguées). Complète le modèle de contraintes de SP3 (le « ALAP reporté » devient SP3b).

## 1. Objectif

Permettre qu'une phase soit ordonnancée **ALAP** (_As Late As Possible_) : démarrer **au plus tard** sans rallonger le projet, c.-à-d. à son **late start** (CPM, SP2). Consomme la marge de la phase (juste-à-temps). ASAP reste le défaut.

## 2. Modèle

ALAP est un **type de contrainte** (mode d'ordonnancement), mutuellement exclusif des contraintes de date SP3 : `constraint: { type: 'ALAP' }` (pas de `week`). Absence de contrainte = ASAP (inchangé).

## 3. Pourquoi c'est sûr (et cohérent)

- Par définition CPM, placer une phase à son **late start** ne rallonge **jamais** le projet (la marge est bornée par `totalWeeks`). `totalWeeks` est donc invariant.
- Nourrir le planning ALAP dans `calculateCriticalPath` est **auto-cohérent** : une phase ALAP a `earlyStart == lateStart` ⇒ `totalFloat = 0` ⇒ affichée **critique** (rouge, sans label de marge). C'est la sémantique MS Project (ALAP sans marge = critique). Aucune désynchronisation barres/flèches/marges (les flèches SP2b mesurent le DOM, suivent les barres).

## 4. Calcul

### 4a. Extraction (single source of truth)

La passe arrière (late ends) est aujourd'hui **dupliquée** dans `criticalPath.js`. L'extraire en helper pur exporté `computeLateEnds(phases, totalWeeks)` dans `costCalculations.js` (renvoie `Map<id, lateEnd>` ; reconstruit `phaseMap`/`depsOf`/`successors` en interne ; `lateEnd` plafonné à `totalWeeks` ; inversion FS/SS/FF/SF + lag identique à l'actuel). `criticalPath.js` l'importe et **supprime sa copie** (comportement préservé → ses tests restent verts).

### 4b. Passe ALAP dans le scheduler

Dans `calculateProjectDurationWithDependencies`, **branche DAG uniquement** (après la passe avant ASAP qui donne `totalWeeks`) : si **au moins une** phase a `constraint.type === 'ALAP'`, faire une **2ᵉ passe avant mémoïsée** où, pour une phase ALAP, `start = max(start piloté par dépendances, lateStart)` avec `lateStart = computeLateEnds(...).get(id) − durée`. Les phases ASAP gardent leur logique (`applyConstraint`). Recalcule `phaseSchedule` + `totalWeeks` (invariant). `applyConstraint` est **inchangé** : avec `{type:'ALAP'}` (pas de `week`), il retourne `start = max(0, depStart)`, `conflict = null` ; le plancher ALAP est appliqué ensuite. Branches **séquentielle** (pas de dépendances) et **cycle** inchangées (ALAP sans marge y est sans effet).

## 5. UI

`PhaseEditor` : ajouter **ALAP** au `<select>` de type de contrainte ; quand `ALAP` est choisi, écrire `constraint = { type: 'ALAP' }` (pas d'input semaine). `TimelineView` : aucun marqueur de conflit (ALAP n'en produit pas) ; la phase apparaît à sa position tardive (et rouge via le chemin critique) — suffisant en v1.

## 6. i18n

`constraint.alap` (« ALAP (au plus tard) » / « ALAP (as late as possible) »).

## 7. Tests (TDD)

- `computeLateEnds` (pur) : chaîne FS → late ends corrects ; phase à marge → `lateEnd < totalWeeks` ; phase critique → `lateEnd == earlyEnd` ; (équivalence avec les valeurs déjà testées via `calculateCriticalPath`).
- Scheduler ALAP : phase à marge + ALAP → `startWeek == lateStart` (déplacée juste-à-temps) ; ALAP **ne change pas** `totalWeeks` ; phase critique + ALAP → inchangée (lateStart == earlyStart) ; **non-régression** : projet sans ALAP → planning identique.
- `criticalPath` après refactor : tests existants verts (comportement préservé). UI : build + lint + manuel.

## 8. Rétro-compat & portée

Additif et **gardé par présence** (la branche ALAP ne s'active que si une phase est ALAP → projets existants strictement inchangés). Forme `phaseSchedule` inchangée → consommateurs (coûts, EVM, nivellement) intacts, ALAP-aware automatiquement. **Hors périmètre** : ALAP en l'absence de dépendances (séquentiel = déjà sans marge), icône de contrainte dédiée dans le Gantt, scheduling depuis une date de fin de projet imposée.
