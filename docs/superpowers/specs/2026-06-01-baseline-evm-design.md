# Design — Valeur acquise (EVM) v1 — onglet « Pilotage » — chantier D

> Date : 2026-06-01
> Branche : `feature/evm-pilotage`
> Contexte amont : `docs/specs/2026-06-01-msproject-capacity-parity.md` (diagnostic). Chantiers A (PR #96) et B (PR #98) livrés.
> Statut : design validé par Daniel — prêt pour le plan d'implémentation.

## 1. Problème

Le suivi actuel s'arrête à un écart simple **Budget − Réel** (`BudgetTracker`). Il manque la **valeur acquise** (EVM) : suis-je en avance/retard (SPI) et sur/sous-coût (CPI) par rapport à ce qui _aurait dû_ être réalisé et dépensé à ce jour ? C'est le différenciateur « pilotage » par rapport à du simple budget tracking, et l'un des écarts MS Project identifiés (§D du diagnostic).

## 2. Objectif

Un onglet projet **« Pilotage »** affichant les métriques EVM — **EV / PV / AC**, **SPI / CPI**, **EAC / VAC** — au niveau projet, plus un détail **par phase**. Calcul **sans baseline figée** (PV dérivé du plan vivant) et **sans nouveau champ de tâche** (avancement dérivé du statut Kanban).

## 3. Décisions de cadrage (issues du brainstorming)

| #   | Décision                 | Choix retenu                                                                                                                   |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| D1  | % d'avancement (pour EV) | **Dérivé du statut**, règle **0/50/100** (`project_statuses.category` : done=100, inprogress=50, todo=0). Aucun nouveau champ. |
| D2  | Baseline                 | **PV depuis le plan vivant** (pas de baseline figée, pas de stockage). La baseline immuable = suivi ultérieur.                 |
| D3  | BAC                      | **Coût planifié total** (Σ coûts de phase = forecast existant), pas `project.budget` (souvent nul).                            |
| D4  | Niveau de calcul         | **Phase = compte de contrôle**, agrégé au projet. Seul niveau où les 3 termes se rejoignent.                                   |
| D5  | Architecture             | **Hybride** : serveur fournit progrès (statuts) + réels ; client calcule coût/PV/EVM (réutilise `costCalculations`).           |
| D6  | Surface                  | **Nouvel onglet projet « Pilotage »** (cartes + tableau par phase).                                                            |

## 4. Non-objectifs (frontière de portée)

- **Baseline figée** (détection de dérive vs plan d'origine) — suivi.
- **Courbes temporelles** PV/EV/AC (graphes d'évolution) — suivi.
- **% manuel par tâche** (champ `percent_complete`) — D1 l'exclut.
- **Formules EAC alternatives** (EAC = AC + (BAC−EV), pondérées SPI×CPI…) — on garde `EAC = BAC/CPI`.
- **Export** de la vue Pilotage.

## 5. Modèle EVM (niveau phase → projet)

Termes, calculés _as-of_ **aujourd'hui** (toutes les durées en semaines depuis `settings.startDate` ; `asOfWeek = (aujourd'hui − startDate)` en semaines) :

- `BAC_phase` = `calculatePhaseTotalCost(phase, rates)` ; `BAC = Σ BAC_phase`.
- `PV_phase` = `BAC_phase × clamp((asOf − début_phase) / (fin_phase − début_phase), 0, 1)` — **accrual linéaire** sur la durée de la phase. `début/fin_phase` depuis `calculateProjectDurationWithDependencies(project)` (semaines) + `settings.startDate`. `PV = Σ PV_phase`.
- `EV_phase` = `pct_phase × BAC_phase` (avec `pct_phase` du rollup serveur, 0..1) ; `EV = Σ EV_phase`.
- `AC_phase` = `getProjectActuals().by_phase[phaseId].cost` (existant) ; `AC = Σ AC_phase`.
- `SPI = EV / PV` ; `CPI = EV / AC` ; `EAC = BAC / CPI` ; `ETC = EAC − AC` ; `VAC = BAC − EAC`.

**Dégradations (pas de NaN/Infinity affiché) :**

- `settings.startDate` absent ⇒ planning indatable ⇒ `PV` et `SPI` = **N/A** (EV/AC/CPI restent valides).
- `PV = 0` ⇒ `SPI` = N/A. `AC = 0` ⇒ `CPI` et `EAC` = N/A.
- Phase sans tâches/estimations ⇒ `pct_phase = 0` (EV_phase = 0) ; signalé visuellement (pas d'avancement mesurable).

## 6. Backend — rollup de progrès

Dans `server/execution/rollups.js`, nouveau `getProjectProgress(projectId)`, **jumeau** de `getProjectActuals` :

- Retour : `{ by_phase: { [phaseId]: { pct, est_hours } } }` où `pct` ∈ [0,1] = avancement pondéré.
- Calcul : pour chaque tâche, `factor = {todo:0, inprogress:0.5, done:1}[status.category]`, poids = `task.estimate_hours` (les tâches sans estimation comptent poids 0 ; si une phase n'a que des tâches sans estimation, `pct` se calcule en **compte** de tâches en repli). `pct_phase = Σ(factor × poids) / Σ(poids)`.
- Même répartition `epic_phases` que `getProjectActuals` (epic lié à N phases ⇒ split égal des tâches de l'epic sur ces phases).
- Route : `GET /api/projects/:id/progress` (même middleware/auth que `/actuals`). Client : `executionApi.getProgress(projectId)`.

> Le serveur ne calcule **pas** de coût (il n'a pas la config de taux frontend) — il ne renvoie que l'avancement brut. Le coût/EV s'assemble côté client.

## 7. Frontend

**`src/lib/evmCalculations.js`** (nouveau, pur, testable) :

- `statusFactor(category)` → `0 | 0.5 | 1`.
- `plannedValueToDate(phaseStartWeek, phaseEndWeek, asOfWeek, phaseCost)` → PV de la phase (clamp linéaire).
- `computeEvm({ phases, schedule, progress, actuals, asOfWeek, hasStartDate })` → `{ bac, pv, ev, ac, spi, cpi, eac, etc, vac, byPhase: [...] }` avec `null` pour les métriques N/A. Réutilise `calculatePhaseTotalCost` / `calculateProjectDurationWithDependencies` de `costCalculations`.

**`src/lib/executionApi.js`** : `getProgress(projectId)`.

**`src/components/PilotageView.jsx`** (nouveau) :

- Charge `getProgress` + `getActuals`, calcule l'EVM (evmCalculations), rend :
  - **Cartes** : EV / PV / AC ; SPI / CPI (codées couleur — vert ≥ 1, ambre 0.9–1, rouge < 0.9, via un helper) ; EAC / VAC / ETC. Métriques N/A affichées « — ».
  - **Tableau par phase** : Phase · Planifié(BAC) · PV · EV · AC · CPI · SPI, + ligne Total.
  - **État vide** : si le projet n'a pas de tâches (module exécution non utilisé) → message d'invite (l'EVM repose sur les statuts de tâches).
- Tokens Prism, `font-mono tabular-nums` pour les chiffres.

**`src/components/ProjectView.jsx`** : ajouter l'onglet « Pilotage » (suivre le pattern d'onglets existant). Clés i18n FR/EN (`project.pilotage`, libellés EVM : `evm.ev/pv/ac/spi/cpi/eac/etc/vac/bac`, etc.).

## 8. Tests

- `src/__tests__/evmCalculations.test.js` (TDD) : `statusFactor`, `plannedValueToDate` (avant début → 0, après fin → coût plein, milieu → proportionnel), `computeEvm` (SPI/CPI/EAC/ETC/VAC sur un cas chiffré ; N/A si `hasStartDate=false`, si AC=0, si PV=0).
- `server/__tests__/` (DB, style capacity) : `getProjectProgress` — pondération par `estimate_hours`, mapping des catégories de statut, split `epic_phases`, phase sans tâches → pct 0.
- UI (`PilotageView`, onglet) : build + vérification manuelle.

## 9. Rétro-compatibilité

Purement additif : 1 rollup + 1 route serveur, 1 lib de calcul, 1 vue, 1 onglet. Aucune migration, aucun champ ajouté, `BudgetTracker` inchangé. Un projet sans module exécution affiche l'état vide du Pilotage (pas d'erreur).

## 10. Critères de succès

- L'onglet « Pilotage » montre EV/PV/AC, SPI/CPI, EAC/VAC pour un projet ayant des tâches et une `startDate`.
- Marquer des tâches « Done » augmente EV (donc SPI/CPI) ; les chiffres concordent avec un calcul à la main sur un cas simple.
- Sans `startDate`, PV/SPI s'affichent « — » sans casser le reste.
- Le tableau par phase agrège correctement (Total = somme des phases).
- Tests verts (`evmCalculations` + `getProjectProgress`), build OK, lint sans nouvelle erreur.
