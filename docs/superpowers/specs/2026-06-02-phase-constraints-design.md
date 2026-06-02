# Design — Contraintes de date de phase (SP3)

> Date : 2026-06-02 · Branche : `feature/phase-constraints` · Programme moteur d'ordonnancement niveau phase (SP3/4). SP1+SP2 livrés.
> **Mode autonome** (Daniel endormi, décisions déléguées) — décisions documentées ici.

## 1. Objectif

Donner à une phase une **contrainte de date** facultative — **SNET** (Start No Earlier Than), **FNLT** (Finish No Later Than), **MSO** (Must Start On), **MFO** (Must Finish On) — appliquée dans la passe avant du scheduler, avec détection de **conflit**. (ASAP = défaut sans contrainte. **ALAP reporté → SP3b** car il nécessite les late-dates / un mode d'ordonnancement différent.)

## 2. Modèle

Phase facultative `constraint: { type: 'SNET'|'FNLT'|'MSO'|'MFO', week: number }` (`week` = offset entier ≥ 0 depuis le début du projet ; cohérent avec le scheduler en semaines). Absente = ASAP. Le factory de phase reste inchangé.

## 3. Calcul — helper pur + scheduler

**Helper pur** `applyConstraint(depStart, duration, constraint)` → `{ start, end, conflict }` (dans `costCalculations.js`, exporté) :

- `start = max(0, depStart)` (start piloté par les dépendances).
- Si contrainte : `SNET` → `start = max(start, week)` ; `MSO` → conflit si `start > week`, puis `start = week` ; `MFO` → `cs = week − duration` ; conflit si `start > cs`, puis `start = cs` ; puis `start = max(0, start)`.
- `end = start + duration`. `FNLT` → conflit si `end > week`.
- Sans contrainte (ou type inconnu) → `{ start: max(0,depStart), end, conflict: null }` (= comportement SP1 inchangé).

**Intégration scheduler** (`calculateProjectDurationWithDependencies`) : remplacer le `start = max(0, …)` final de `getSchedule` (chemin dépendances) ET du `sequential()` par un appel à `applyConstraint(depStart, duration, phase.constraint)`, en utilisant `start`/`end` retournés et en **enregistrant `conflict` par phase**. Retour **additif** : `{ totalWeeks, phaseSchedule, conflicts: { [phaseId]: 'SNET'|'FNLT'|'MSO'|'MFO' } }` (les consommateurs existants destructurent `{totalWeeks, phaseSchedule}` → ignorent `conflicts` ; SP2 lit `phaseSchedule` → contraintes reflétées dans les early dates ; **non-régression**). Détection de cycle/séquentiel conservée. SNET/MSO/MFO **propagent** aux phases aval (via leur `end`).

## 4. UI

- `PhaseEditor` : sous les dépendances, un `<select>` de type de contrainte (Aucune/SNET/FNLT/MSO/MFO) + un input `week` quand un type est choisi. Écrit/efface `phase.constraint`.
- `TimelineView` : marqueur ⚠ (titre = type de conflit) sur les phases listées dans `conflicts`.

## 5. i18n

`constraint.label` (« Contrainte »), `constraint.none` (« Aucune »), `constraint.snet/fnlt/mso/mfo` (libellés), `constraint.week` (« Semaine »), `constraint.conflict` (« Conflit de contrainte »).

## 6. Tests (TDD)

`applyConstraint` (pur) : sans contrainte = passthrough ; SNET relève le start ; MSO fixe + conflit ; MFO fixe end + conflit ; FNLT deadline conflit ; clamp ≥0. Scheduler : SNET propage à l'aval ; `conflicts` rempli ; non-régression (fixtures sans contrainte inchangées). UI : build + manuel.

## 7. Rétro-compat & portée

Additif : helper + champ `conflicts` additif + UI + i18n. Sans contrainte = comportement SP1/SP2 identique ; `phaseSchedule` même forme → 4 consommateurs + SP2 intacts. **Hors périmètre** : ALAP (SP3b), contraintes en dates calendaires (offset semaines seulement), résolution auto de conflit.
