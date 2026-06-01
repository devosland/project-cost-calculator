# Parité « gestion de la capacité » — Prism vs Microsoft Project

> Diagnostic produit le 2026-06-01 — code analysé : commit `97bb18a` (= contenu de `origin/main` à `01c17bc`).
> Objectif : déterminer où Prism reproduit les comportements de capacité de MS Project, et où le moteur s'arrête.

## TL;DR

Prism est aujourd'hui un **outil d'estimation de coûts + vue d'ensemble de capacité**, pas un **planificateur à moteur d'ordonnancement**. Il stocke un graphe de dépendances mais ne calcule pas de dates depuis un moteur, n'a pas de calendrier de ressources, pas de nivellement, et pas de valeur acquise.

Inversement, Prism fait **deux choses que MS Project ne fait pas nativement** : la planification de transition consultant→permanent, et une orientation coût/budget de bout en bout. Viser « 100 % de MS Project » n'est donc pas le bon cadrage — il faut viser les comportements de capacité qui comptent pour le workflow, en gardant les différenciateurs.

---

## Légende statut

- ✅ **Présent** — comportement équivalent à MS Project existe
- ⚠️ **Partiel** — existe mais simplifié / incomplet
- ❌ **Absent** — pas implémenté

---

## 1. Définition de la ressource & disponibilité

| Comportement MS Project                                                              | Statut | Constat (code)                                                                                                                                                             |
| ------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacité = **Max Units** time-phasée (ex. 100 % jan–mar, 50 % avr, congé en juillet) | ❌     | `resources.max_capacity` est un **entier unique** constant (`server/db.js`). Aucune variation dans le temps.                                                               |
| **Calendrier de ressource** (jours/heures ouvrés, fériés, exceptions)                | ❌     | Aucun calendrier. Conversion globale `4.33 semaines/mois` en dur (`costCalculations.js`).                                                                                  |
| **Calendrier projet** (semaine de travail, fériés org)                               | ❌     | Absent.                                                                                                                                                                    |
| Types de ressource : **Travail / Matériel / Coût**                                   | ⚠️     | Seulement ressources « personne ». Coûts non-main-d'œuvre = lignes one-shot dans `project.nonLabourCosts`, non assignées dans le temps.                                    |
| **Tables de taux multiples** + taux qui changent dans le temps                       | ⚠️     | Carte de taux entreprise (rôle × niveau) ✅, mais un seul taux effectif, pas de tables A/B/C ni de changement de taux daté. Bon point : taux _snapshotté_ au log du temps. |
| **Pool partagé multi-projets**                                                       | ✅     | Pool central cross-projets — _meilleur_ que le partage de pool MS Project standard.                                                                                        |

## 2. Affectations & charge (units / work)

| Comportement MS Project                                  | Statut | Constat (code)                                                                                                                                           |
| -------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Affectation en **unités %**                              | ✅     | `resource_assignments.allocation` 0–100, bornée par mois (`start_month`/`end_month`).                                                                    |
| Unités alternatives (**FTE, heures**)                    | ❌     | % uniquement côté capacité. (heures existent côté exécution via `task.estimate_hours`, non reliées à la capacité).                                       |
| Formule **Travail = Durée × Unités**                     | ⚠️     | Présente côté coût (`costCalculations.js`: `rate × HOURS_PER_WEEK × allocation/100 × durationWeeks`), mais pas comme moteur d'ordonnancement réversible. |
| **Contours de charge** (plat, front/back-loaded, cloche) | ❌     | Charge uniforme sur la période d'affectation.                                                                                                            |
| **Travail time-phasé** (réparti jour par jour)           | ⚠️     | Bucket **mensuel** seulement, pas de granularité jour.                                                                                                   |

## 3. Surcharge & nivellement

| Comportement MS Project                                                                    | Statut | Constat (code)                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Détection de surcharge**                                                                 | ✅     | `ResourceConflicts.jsx` : somme des allocations par rôle+niveau par semaine, seuil `> quantité × 100 %`, regroupe les semaines consécutives. `UtilizationSummary` vert/ambre/rouge. |
| Granularité de détection                                                                   | ⚠️     | Par **rôle+niveau / semaine** (MS Project = par **ressource nommée / jour**).                                                                                                       |
| **Nivellement automatique** (leveling delay, fractionnement, ordre, niveler dans la marge) | ❌     | Aucun.                                                                                                                                                                              |
| **Team Planner** (glisser-déposer manuel pour résoudre)                                    | ❌     | Détection seulement, aucune résolution.                                                                                                                                             |

## 4. Moteur d'ordonnancement (scheduling)

| Comportement MS Project                                      | Statut | Constat (code)                                                                                                                                                                                                   |
| ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dates calculées par un **moteur** depuis durée + dépendances | ⚠️     | `calculateProjectDurationWithDependencies()` fait un ordonnancement DAG **basique** (détection de cycle, `startWeek = max(endWeek des deps)`), sinon disposition séquentielle. Pas de recalcul piloté ressource. |
| Dépendances **FS / SS / FF / SF** + **lag/lead**             | ❌     | Seulement **FS implicite**, pas de retard/avance. `phase.dependencies = string[]` d'IDs.                                                                                                                         |
| Ordonnancement **au niveau tâche**                           | ❌     | Les tâches (`tasks`) ont `estimate_hours` mais **aucune date** (`start_date`/`end_date`). Planning implicite via la phase parente.                                                                               |
| **Chemin critique / marge (slack, float)**                   | ❌     | Aucun CPM, aucune marge.                                                                                                                                                                                         |
| **Contraintes** (ASAP, ALAP, SNET/FNLT, MSO/MFO)             | ❌     | Aucune.                                                                                                                                                                                                          |
| **Jalons**                                                   | ✅     | Milestones avec `weekOffset`, export iCal.                                                                                                                                                                       |

## 5. Baseline, réels & valeur acquise (EVM)

| Comportement MS Project                        | Statut | Constat (code)                                                                                                                        |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Réels** (heures/coût loggés)                 | ✅     | `time_entries` (heures, taux snapshotté), rollup `getActuals()` → `BudgetTracker`, ProjectSummary, export Excel. Bon différenciateur. |
| **Baseline** (snapshot du planifié pour écart) | ❌     | Aucune baseline du travail/planning. Snapshots de version existent mais ne servent pas de référence EVM.                              |
| **% achevé** par tâche + rollup                | ❌     | Statuts catégoriels (Kanban), pas de % d'avancement.                                                                                  |
| **Travail restant / ETC**                      | ❌     | Absent.                                                                                                                               |
| **EVM** (BCWS/BCWP/ACWP, **SPI/CPI**, EAC)     | ❌     | Seulement écart simple Budget − Réel.                                                                                                 |

## 6. Vues analytiques capacité vs demande

| Comportement MS Project                        | Statut | Constat (code)                                                                                                      |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| **Resource Usage / Resource Graph** time-phasé | ⚠️     | Gantt mensuel cross-projets (`CapacityGantt`) ✅, mais montre la **demande**, pas la **capacité restante**.         |
| **Disponibilité restante** par période         | ❌     | Pas de « capacité − demande = restant » exploitable (dépend du §1 time-phasé).                                      |
| **What-if / scénarios**                        | ✅     | Aperçu hachuré des transitions, planificateur multi-transitions avec comparaison de coût — _au-delà_ de MS Project. |

---

## Différenciateurs Prism (à NE PAS perdre en cherchant la parité)

1. **Transitions consultant→permanent** (quick + scénario, sync auto des affectations) — inexistant dans MS Project.
2. **Orientation coût/budget** native (carte de taux entreprise, proratisation, multi-devises, taux snapshotté).
3. **Pool cross-projets** simple, sans serveur PWA/Project Server.
4. **Exécution intégrée** (Kanban/Backlog/Timesheet) avec réels qui remontent partout.

---

## Roadmap de parité proposée (par dépendance technique)

Les chantiers sont ordonnés : chacun débloque le suivant.

### Chantier A — Disponibilité time-phasée + calendriers _(fondation)_

Sans ça, le `%` d'allocation n'a pas de dénominateur réaliste. Permet : congés, temps partiel daté, ramp-up.

- `max_capacity` constant → table de disponibilité par ressource × période (mois).
- Calendrier minimal : fériés / jours non-ouvrés au niveau projet (puis ressource).
- Impacte : `resources`, `capacityCalculations`, `CapacityGantt`, détection de surcharge.

### Chantier B — Vue Capacité vs Demande (capacité restante)

Le cœur « gestion de la capacité ». Dépend de A.

- Par ressource × mois : `disponible − assigné = restant`, codé couleur.
- Surcharge **par ressource nommée** (pas seulement rôle+niveau).

### Chantier C — Nivellement & Team Planner

- Détection → **résolution** : suggérer un retard (leveling delay) ou un re-lissage.
- Team Planner : glisser-déposer une affectation d'une ressource/période à une autre.
- Dépend d'un minimum d'ordonnancement daté (au moins au niveau phase).

### Chantier D — Baseline + Valeur acquise

- Snapshot « baseline » du planifié (travail + coût par ressource/période).
- % achevé par tâche → rollup ; SPI/CPI/EAC dans `BudgetTracker`.
- Réutilise les `time_entries` déjà en place.

### Chantier E (optionnel) — Moteur d'ordonnancement complet

- Dépendances FS/SS/FF/SF + lag, contraintes, CPM/marge, dates au niveau tâche.
- Le plus lourd ; à n'entreprendre que si le besoin réel le justifie (vs rester « capacity-first »).

---

## Question ouverte à trancher avec Daniel

« Reproduire **tous** les comportements de MS Project » couvre un moteur d'ordonnancement complet (chantier E), qui est plusieurs semaines de travail et éloigne Prism de son ADN capacity/coût. Recommandation : prioriser A→B→D (vrai ROI capacité) avant d'envisager C/E. À valider.
