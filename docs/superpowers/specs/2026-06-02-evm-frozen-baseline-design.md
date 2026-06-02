# Design — Baseline figée pour l'EVM (chantier D+)

> Date : 2026-06-02 · Branche `feature/evm-frozen-baseline` · Raffinement du chantier D (EVM, PR #99). **Mode autonome** (décisions déléguées ; feature choisie par Daniel).

## 1. Problème

Aujourd'hui le **PV** (valeur planifiée) est dérivé du **plan vivant** (`evmCalculations` lit le schedule + coût courants). Le plan dérivant avec la réalité, **SPI ≈ 1 par construction** : l'écart de planning n'est jamais visible. L'EVM n'a de sens que mesuré contre un **plan de référence figé** (PMB — _Performance Measurement Baseline_).

## 2. Objectif

Permettre de **figer une baseline** (snapshot du plan de référence) et calculer PV/BAC/EV **contre cette baseline**. Sans baseline → comportement actuel inchangé (plan vivant).

## 3. Modèle

Champ **additif** sur le projet (zéro migration, normalize-on-read) :

```
project.baseline = {
  capturedAt: 'YYYY-MM-DD',          // date de gel (fournie par l'UI)
  startDate:  'YYYY-MM' | null,      // snapshot de settings.startDate au gel
  phases: { [phaseId]: { startWeek, endWeek, bac } }  // ce que le PV consomme
}
```

On ne snapshot **que** ce que le PV consomme (fenêtre temporelle + coût planifié par phase), pas une copie des phases — cohérent avec « single source of truth ».

## 4. Calcul (`evmCalculations.js`, pur)

### 4a. `buildBaseline(project, rates, capturedAt)` (nouveau, pur)

Construit le snapshot : pour chaque phase, `{ startWeek, endWeek }` depuis `calculateProjectDurationWithDependencies` et `bac = calculatePhaseTotalCost(phase, rates)` ; plus `capturedAt` et `startDate` (snapshot de `settings.startDate`). `capturedAt` est **passé en paramètre** (pas de `Date` dans la lib → testable).

### 4b. `computeEvm` baseline-aware (additif)

Lit `baseline = project.baseline || null`. Par phase : si `baseline.phases[id]` existe → `bac`, `startWeek`, `endWeek` viennent de la **baseline** ; sinon → plan vivant (actuel). PV = `plannedValueToDate(startWeek, endWeek, asOfWeek, bac)`, EV = `pct × bac`. Agrégats inchangés. Retour enrichi (additif) : `hasBaseline`, `baselineCapturedAt`. **Sans baseline → résultat identique à aujourd'hui** (non-régression).

Phases ajoutées **après** le gel (absentes de la baseline) retombent sur le plan vivant (documenté).

## 5. UI

- `PilotageView` reçoit `onUpdateProject` (depuis `ProjectView`, = `updateProject`).
- **Bouton « Figer la baseline »** : `onUpdateProject({ baseline: buildBaseline(project, rates, today) })` (`today` = `new Date().toISOString().slice(0,10)`). Si une baseline existe déjà → « Re-figer » avec `window.confirm` (le re-gel écrase la référence).
- **Bandeau de statut** : « Baseline figée le {date} — PV mesuré contre la baseline » ou « Aucune baseline — PV vs plan vivant ».
- `asOfWeek` : calculé depuis `baseline.startDate` quand une baseline existe (sinon `settings.startDate`), pour mesurer le PV depuis le début baseliné.

## 6. i18n

`evm.baseline.freeze` (« Figer la baseline »), `evm.baseline.refreeze` (« Re-figer »), `evm.baseline.capturedOn` (« Baseline figée le {date} »), `evm.baseline.none` (« Aucune baseline — PV vs plan vivant »), `evm.baseline.confirm` (« Re-figer remplacera la baseline de référence actuelle. Continuer ? »).

## 7. Tests (TDD)

- `buildBaseline` : snapshot par phase (startWeek/endWeek/bac) + `capturedAt` + `startDate`.
- `computeEvm` avec baseline : PV/BAC/EV **contre la baseline** même si le plan vivant a changé (astuce : phase à équipe vide → coût vivant 0 mais `baseline.bac=1000` → PV/EV non nuls) ; `hasBaseline=true`.
- `computeEvm` sans baseline : **non-régression** (résultat identique, `hasBaseline=false`). UI : build + lint + manuel.

## 8. Rétro-compat & portée

Additif et gardé par présence de `project.baseline` → projets existants strictement inchangés. **Hors périmètre** : baselines multiples/versionnées (une seule), courbes temporelles PV/EV/AC dans le temps, re-baseline partielle par phase, baseline de planning calendaire (offsets semaines uniquement). Voir [[project_msproject_parity]] (raffinement de D).
