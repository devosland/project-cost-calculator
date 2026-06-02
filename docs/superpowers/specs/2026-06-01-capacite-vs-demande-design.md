# Design — Capacité vs Demande (heatmap de charge) — chantier B

> Date : 2026-06-01
> Branche : `feature/capacity-load-heatmap`
> Contexte amont : `docs/specs/2026-06-01-msproject-capacity-parity.md` (diagnostic) et le chantier A `docs/superpowers/specs/2026-06-01-capacite-time-phasee-design.md` (disponibilité time-phasée, déjà livré PR #96).
> Statut : design validé par Daniel — prêt pour le plan d'implémentation.

## 1. Problème

Le chantier A a rendu la **capacité** variable par mois (`resource_availability`), et la surcharge est détectée au niveau agrégat (`UtilizationSummary`, ligne unique du Gantt). Mais il manque la vue cœur de la gestion de capacité : **par ressource nommée × mois, combien reste-t-il de capacité, et qui est en surcharge ?** Aujourd'hui le Gantt montre la _demande_ (barres d'allocation) mais jamais la _capacité restante_, et la surcharge par personne n'est visible nulle part (l'ancien `ResourceConflicts` agrège par rôle+niveau, scope projet).

## 2. Objectif

Une **heatmap « Charge »** : grille ressources (lignes) × 12 mois (colonnes) où chaque cellule montre la **capacité restante** du mois (`capacité − demande`), codée couleur (marge / proche / surcharge). Lecture seule — surface d'analyse.

Exemple cible :

```
Onglet Charge          Jan  Fév  Mar  Avr
Marie (cap. 100)       +40  +40  -10  +40     (Mar rouge : demande 60 > capacité 50)
Jean  (cap. 80)        +20  +20  +20  +20
Pool (total restant)   +60  +60  +10  +60
(+ = restant %, - = surcharge %)
```

## 3. Décisions de cadrage (issues du brainstorming)

| #   | Décision                | Choix retenu                                                                                                                                                  |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Surface                 | **Nouveau sous-onglet « Charge »** dans `CapacityView` (heatmap dédiée), pas dans le Gantt.                                                                   |
| D2  | Détail de cellule       | **Heatmap simple** : restant % + couleur + **tooltip basique** (`title` : Capacité / Demande / Restant). Lecture seule.                                       |
| D3  | Périmètre de la demande | **Cross-projets** : `demande(r, mois) = Σ allocations` de toutes les assignations de la ressource ce mois (cohérent avec le pool et le Gantt).                |
| D4  | Calcul                  | **Front-only** : `restant = getMonthlyCapacity(r, mois) − calculateUtilization(assignments, r.id, mois)`. Aucun nouvel endpoint ni table.                     |
| D5  | Ressources affichées    | **Toutes** les ressources du pool (même sans assignation → restant = capacité pleine, utile pour repérer la marge).                                           |
| D6  | Fenêtre temporelle      | **12 mois glissants** depuis le mois courant (comme `AvailabilityGrid` et le Gantt).                                                                          |
| D7  | Total                   | **Ligne « Pool »** en bas : `Σcapacité − Σdemande` par mois.                                                                                                  |
| D8  | Couleurs                | Helper pur partagé `capacityStatus(demand, capacity)` ; seuils repris de `UtilizationSummary` (utilisation ≥ 100 % → error, ≥ 80 % → warning, sinon success). |

## 4. Non-objectifs (frontière de portée)

Explicitement **hors de ce chantier** (suivis ultérieurs) :

- **Décomposition par projet** dans le tooltip (quels projets consomment la capacité).
- **Drill-down cliquable** (panneau d'assignations, navigation vers le projet).
- **Groupement / filtre** par type (permanent/consultant) ou par projet.
- **Tri** par surcharge (MVP : tri par nom).
- Toute **édition** depuis cette vue (la dispo s'édite dans l'onglet Disponibilité).

## 5. Flux de données

Le composant est autonome (même pattern que `AvailabilityGrid`) :

1. `startMonth = mois courant` ; `months = getMonthRange(startMonth, addMonths(startMonth, 11))`.
2. `capacityApi.getGanttData(startMonth, endMonth)` → `{ resources, assignments }` (assignations cross-projets actives dans la fenêtre).
3. `capacityApi.getAvailability()` → overrides de disponibilité.
4. Pour chaque ressource `r` et mois `m` :
   - `capacité = getMonthlyCapacity(r.id, m, overrides, r.max_capacity ?? 100)`
   - `demande = calculateUtilization(assignments, r.id, m)`
   - `restant = capacité − demande`
   - `statut = capacityStatus(demande, capacité)` (couleur)

Aucun appel réseau supplémentaire ; tout est dérivé des deux fetchs ci-dessus.

## 6. Composant — `src/components/CapacityLoadGrid.jsx`

- Auto-charge `resources`/`assignments` (via `getGanttData`) et `overrides` (via `getAvailability`) au montage.
- Réutilise `addMonths` et `getMonthRange` (partagés depuis `capacityCalculations.js` après chantier A). `currentMonth` reste un **petit helper local** au composant (fonction du temps via `new Date()`, hors du module de calcul pur), identique à celui de `AvailabilityGrid`.
- Rend une grille CSS (même squelette que `AvailabilityGrid`) : colonne ressource sticky + 12 colonnes mois + ligne « Pool ».
- **Cellule** : affiche `restant` signé (`+40` / `0` / `-10`) en `font-mono tabular-nums` ; fond/texte via tokens Prism `color-mix(... var(--prism-success|warning|error) ...)` selon `statut` ; `title="Capacité X% · Demande Y% · Restant Z%"` ; `aria-label` par cellule.
- **Ligne « Pool »** : `totalRestant(m) = Σ capacité(r,m) − Σ demande(r,m)`, même code couleur via `capacityStatus(Σdemande, Σcapacité)`.
- **État vide** : si pool vide, message d'invite (clé `capacity.loadHint`).
- Style : tokens Prism existants (`bg-card`, `border-border`, `font-mono tabular-nums`), cohérent avec `AvailabilityGrid` et `UtilizationSummary`.

## 7. Helper de couleur (DRY + testable) — `capacityCalculations.js`

Nouveau pur, partagé entre la heatmap et `UtilizationSummary` :

```js
/**
 * Statut sémantique d'occupation d'une capacité pour le code couleur.
 * @param {number} demand    Somme des allocations (%).
 * @param {number} capacity  Capacité disponible (%).
 * @returns {'success'|'warning'|'error'}
 *   error   = surchargé (utilisation ≥ 100 %, ou demande > 0 quand capacity = 0)
 *   warning = proche de la limite (80–99 %)
 *   success = marge (< 80 %, ou aucune demande)
 */
export function capacityStatus(demand, capacity) { … }
```

Règle (équivalente aux seuils actuels de `UtilizationSummary`, exprimés en utilisation `demand/capacity`) :

- `capacity <= 0` : `demand > 0 → 'error'`, sinon `'success'`.
- sinon `util = demand / capacity * 100` : `≥ 100 → 'error'`, `≥ 80 → 'warning'`, sinon `'success'`.

**Refactor** : `UtilizationSummary` cesse de calculer ses seuils en ligne et appelle `capacityStatus(totalAllocation, totalCapacity)` → une seule source de vérité pour le code couleur de capacité, comportement inchangé.

## 8. i18n (FR/EN)

`capacity.load` (« Charge » / « Load »), `capacity.loadTitle`, `capacity.loadHint`, `capacity.remaining` (« Restant » / « Remaining »), `capacity.demand` (« Demande » / « Demand »), `capacity.poolTotal` (« Pool » / « Pool »).

## 9. Câblage — `src/components/CapacityView.jsx`

Onglet « Charge » inséré **entre Disponibilité et Transitions** (ordre : Ressources → Gantt → Disponibilité → Charge → Transitions → Taux). Icône lucide (ex. `Gauge` ou `Activity`). Rendu conditionnel `{activeTab === 'load' && <CapacityLoadGrid />}`. Route `#/capacity/load` automatique (le `navigate('capacity/' + id)` existant gère).

## 10. Tests

- `src/__tests__/capacityCalculations.test.js` : `capacityStatus` — 3 bandes (`success` <80, `warning` 80–99, `error` ≥100), bornes (exactement 80, exactement 100), et bords `capacity=0` (`demand>0 → error`, `demand=0 → success`).
- UI (`CapacityLoadGrid`, refactor `UtilizationSummary`) : pas de harness React → vérification via `npm run build` + vérification manuelle.

## 11. Rétro-compatibilité & migration

Purement additif : nouveau composant + nouvel onglet + un helper pur. Aucune migration, aucun schéma, aucun endpoint. Le refactor de `UtilizationSummary` préserve le comportement (mêmes seuils, désormais centralisés).

## 12. Suivis (hors périmètre)

1. Décomposition par projet (tooltip) puis drill-down cliquable.
2. Groupement/filtre par type (permanent/consultant), tri par surcharge.
3. Extension éventuelle : export de la heatmap (CSV/Excel) comme les autres vues.

## 13. Critères de succès

- L'onglet « Charge » affiche une grille ressources × 12 mois avec, par cellule, la capacité restante signée et la bonne couleur.
- Une ressource allouée à 60 % un mois où sa dispo (chantier A) est 50 % apparaît en **rouge** avec restant `-10`.
- Une ressource sans assignation montre son restant = capacité pleine (vert).
- La ligne « Pool » agrège correctement le restant par mois.
- Le tooltip donne Capacité / Demande / Restant.
- `UtilizationSummary` reste visuellement identique (refactor sans régression).
- Tests verts (`capacityStatus`), build OK, lint sans nouvelle erreur.
