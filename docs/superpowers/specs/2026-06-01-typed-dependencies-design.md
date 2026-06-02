# Design — Dépendances de phase typées + lag (SP1 du moteur d'ordonnancement)

> Date : 2026-06-01
> Branche : `feature/typed-phase-dependencies`
> Contexte amont : `docs/specs/2026-06-01-msproject-capacity-parity.md` (diagnostic). Chantiers A/B/D livrés (PR #96/#98/#99).
> Programme : « moteur d'ordonnancement **au niveau phase** » (C + E), découpé en 4 sous-projets. **SP1 = fondation** : dépendances typées + lag. (SP2 chemin critique, SP3 contraintes, SP4 nivellement suivront.)
> Statut : design validé par Daniel — prêt pour le plan d'implémentation.

## 1. Problème

L'ordonnanceur de phases (`calculateProjectDurationWithDependencies`) ne supporte qu'un seul type de lien : **Finish-to-Start (FS) sans décalage** (`start = max(end des prédécesseurs)`). MS Project offre 4 types — **FS, SS, FF, SF** — et un **décalage (lag/lead)** par lien. C'est l'écart de base du moteur d'ordonnancement, et la fondation dont dépendent le chemin critique (SP2), les contraintes (SP3) et le nivellement (SP4).

## 2. Objectif

Permettre, par dépendance de phase, un **type** (FS/SS/FF/SF) et un **décalage en semaines** (entier, négatif = avance). L'ordonnanceur en tient compte ; tout ce qui consomme le planning (Gantt, PV/EVM, conflits de ressources, export iCal) en bénéficie automatiquement.

## 3. Décisions de cadrage (issues du brainstorming)

| #   | Décision                | Choix retenu                                                                                                                          |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Granularité du moteur   | **Niveau phase** (étend l'existant ; les tâches restent du Kanban).                                                                   |
| D2  | Modèle de dépendance    | Entrée = **objet `{ id, type, lag }`** ; **normalisation à la lecture** (string ancienne → `{id, type:'FS', lag:0}`). Zéro migration. |
| D3  | Types supportés         | **FS, SS, FF, SF**. Défaut `FS`.                                                                                                      |
| D4  | Lag                     | **Semaines, entier** (cohérent avec `durationWeeks`). Négatif = avance (lead). Défaut `0`.                                            |
| D5  | Clamp                   | `start` final **borné à ≥ 0** (le projet commence à la semaine 0).                                                                    |
| D6  | Flèches de lien (Gantt) | **Hors SP1** (overlay SVG groupé avec SP2). Les barres se repositionnent déjà via `phaseSchedule`.                                    |
| D7  | API publique            | `dependsOn: string[]` **inchangé** (→ FS/0). Extension typée = suivi.                                                                 |

## 4. Non-objectifs (frontière de portée)

- **Flèches de dépendance** dessinées dans le Gantt (SP2).
- **Chemin critique / marges** (SP2), **contraintes de date** (SP3), **nivellement** (SP4).
- **API publique typée** (le schéma `dependsOn` reste FS/0).
- **Dépendances au niveau tâche** (le modèle reste phase ; tâches = Kanban).

## 5. Modèle de données

Une entrée de `phase.dependencies` passe de `string` (id) à `{ id: string, type: 'FS'|'SS'|'FF'|'SF', lag: number }`.

Helper pur **`normalizeDependency(dep)`** (dans `costCalculations.js`, exporté) :

- `typeof dep === 'string'` → `{ id: dep, type: 'FS', lag: 0 }`.
- objet → `{ id: dep.id, type: VALID_TYPES.includes(dep.type) ? dep.type : 'FS', lag: Number.isFinite(dep.lag) ? dep.lag : 0 }`.

Rétro-compat : **normalisation à la lecture** partout où l'ordonnanceur et l'UI lisent les dépendances. Les données existantes (toutes des strings = FS/0) restent valides sans migration. Le factory de phase (`projectStore.js`) est **inchangé** (`dependencies` non initialisé / `[]`).

## 6. Ordonnanceur (`calculateProjectDurationWithDependencies`, réécriture)

Mémoïse le planning **`{ startWeek, endWeek }` par phase** (et non plus seulement `endWeek`, car SS/FF/SF ont besoin du `start` du prédécesseur).

Pour une phase et chacune de ses dépendances normalisées `dep` (prédécesseur `p` de planning `{ps, pe}`), le `start` candidat selon le type :

| Type | Contrainte                 | `start` candidat   |
| ---- | -------------------------- | ------------------ |
| FS   | succ.start ≥ p.end + lag   | `pe + lag`         |
| SS   | succ.start ≥ p.start + lag | `ps + lag`         |
| FF   | succ.end ≥ p.end + lag     | `pe + lag − durée` |
| SF   | succ.end ≥ p.start + lag   | `ps + lag − durée` |

`startWeek = max(0, max des candidats)` (0 si aucune dépendance) ; `endWeek = startWeek + durée`.

**Conservé :** détection de cycle (DFS sur les `id` normalisés) → repli séquentiel ; repli séquentiel quand aucune dépendance. **Forme de retour inchangée** : `{ totalWeeks, phaseSchedule: [{phaseId, startWeek, endWeek}] }`. `totalWeeks = max(endWeek)`.

> Conséquence : les 4 consommateurs (`evmCalculations` PV, `TimelineView` barres, `ResourceConflicts`, `projectStore.exportCalendar`) lisent la même forme et reflètent le nouveau planning **sans modification**.

## 7. UI d'édition (`PhaseEditor`)

La liste de cases à cocher des dépendances est enrichie : pour une phase **cochée**, afficher à côté un `<select>` de **type** (FS/SS/FF/SF) et un **input numérique** de lag (semaines, entier, négatif autorisé). Décocher retire l'entrée. La saisie écrit des objets : `update({ dependencies: [{ id, type, lag }, …] })`. À l'affichage, normaliser les entrées existantes (une string cochée s'affiche FS / lag 0).

## 8. i18n (FR/EN)

Libellés des 4 types (`dep.type.fs/ss/ff/sf` — p.ex. FR « Fin→Début », « Début→Début », « Fin→Fin », « Début→Fin ») et `dep.lag` (« Décalage (sem.) » / « Lag (wks) »). Les codes courts FS/SS/FF/SF peuvent rester tels quels dans le `<select>` avec le libellé long en regard.

## 9. Tests (TDD — cœur du SP1)

`src/__tests__/scheduler.test.js` (ou extension d'un fichier cost-calc existant) sur l'ordonnanceur **pur** :

- `normalizeDependency` : string → FS/0 ; objet partiel → défauts ; type invalide → FS.
- FS avec lag 0 (= comportement actuel, non-régression), FS lag +2, FS lag −1.
- SS, FF, SF (cas chiffrés simples à 2 phases).
- Clamp : un lead qui pousserait `start < 0` est borné à 0.
- Plusieurs dépendances de types mixtes sur une phase → max des contraintes.
- Cycle → repli séquentiel (inchangé) ; aucune dépendance → séquentiel (inchangé).
- Compat : un mélange de deps `string` et objet sur la même phase.

UI (`PhaseEditor`) : build + vérification manuelle (pas de harness React).

## 10. Rétro-compatibilité

Purement additif/normalisé : aucune migration, aucune table, le factory de phase inchangé, l'API publique inchangée. Les projets existants (deps string) sont normalisés à la lecture → FS/0 = comportement identique à aujourd'hui. La forme de `phaseSchedule` est conservée → les 4 consommateurs ne changent pas.

## 11. Critères de succès

- Définir, sur une dépendance de phase, le type et un lag, et voir les barres du Gantt (et PV/conflits/iCal) se repositionner en conséquence.
- FS/lag 0 reproduit exactement le planning actuel (non-régression).
- SS/FF/SF positionnent correctement sur des cas chiffrés vérifiables à la main.
- Un lead excessif borne le `start` à la semaine 0 (jamais négatif).
- Un projet existant (deps string) s'ouvre et se planifie comme avant.
- Tests verts (ordonnanceur + `normalizeDependency`), build OK, lint sans nouvelle erreur.
