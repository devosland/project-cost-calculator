# Baseline figée pour l'EVM — Plan

> Subagent-driven. Spec : `docs/superpowers/specs/2026-06-02-evm-frozen-baseline-design.md`. Branche `feature/evm-frozen-baseline`.

**Goal:** Figer un plan de référence (`project.baseline`) et calculer PV/BAC/EV contre lui (au lieu du plan vivant), pour rendre SPI/CPI signifiants. Helper pur `buildBaseline` + `computeEvm` baseline-aware + UI de gel dans `PilotageView`.

**Architecture:** `project.baseline = { capturedAt, startDate, phases: { [id]: { startWeek, endWeek, bac } } }` (additif, zéro migration). `computeEvm` lit `project.baseline` s'il existe ; sinon comportement actuel (non-régression).

---

## Task 1 : `buildBaseline` + `computeEvm` baseline-aware (TDD)

**Files:** Create `src/__tests__/evmBaseline.test.js` ; Modify `src/lib/evmCalculations.js`.

### Step 1 — `src/__tests__/evmBaseline.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
import { computeEvm, buildBaseline } from '../lib/evmCalculations';

const rates = { INTERNAL_RATE: 100, CONSULTANT_RATES: {} };

describe('buildBaseline', () => {
  it('snapshots per-phase schedule + cost + capturedAt + startDate', () => {
    const project = {
      settings: { startDate: '2026-01' },
      phases: [{ id: 'p1', name: 'P1', durationWeeks: 4, teamMembers: [] }],
    };
    const bl = buildBaseline(project, rates, '2026-06-02');
    expect(bl.capturedAt).toBe('2026-06-02');
    expect(bl.startDate).toBe('2026-01');
    expect(bl.phases.p1.startWeek).toBe(0);
    expect(bl.phases.p1.endWeek).toBe(4);
    expect(bl.phases.p1).toHaveProperty('bac');
  });
});

describe('computeEvm with a frozen baseline', () => {
  // Phase à équipe vide → coût vivant 0 ; la baseline fige bac=1000.
  const project = {
    settings: { startDate: '2026-01' },
    baseline: {
      capturedAt: '2026-06-02',
      startDate: '2026-01',
      phases: { p1: { startWeek: 0, endWeek: 4, bac: 1000 } },
    },
    phases: [{ id: 'p1', name: 'P1', durationWeeks: 4, teamMembers: [] }],
  };

  it('measures PV/BAC/EV against the baseline, not the live plan', () => {
    const evm = computeEvm({
      project,
      rates,
      progress: { p1: { earned: 1, est: 2 } }, // pct 0.5
      actuals: { p1: { cost: 400 } },
      asOfWeek: 2, // mi-parcours
    });
    expect(evm.bac).toBe(1000); // budget baseline, pas le coût vivant (0)
    expect(evm.pv).toBe(500); // 1000 * 2/4
    expect(evm.ev).toBe(500); // 0.5 * 1000
    expect(evm.spi).toBe(1); // 500/500
    expect(evm.cpi).toBeCloseTo(1.25); // 500/400
    expect(evm.hasBaseline).toBe(true);
    expect(evm.baselineCapturedAt).toBe('2026-06-02');
  });

  it('falls back to the live plan when there is no baseline (regression)', () => {
    const live = { settings: { startDate: '2026-01' }, phases: project.phases };
    const evm = computeEvm({
      project: live,
      rates,
      progress: { p1: { earned: 1, est: 2 } },
      actuals: {},
      asOfWeek: 2,
    });
    expect(evm.bac).toBe(0); // coût vivant (équipe vide)
    expect(evm.hasBaseline).toBe(false);
    expect(evm.baselineCapturedAt).toBe(null);
  });
});
```

### Step 2 — Run, expect FAIL: `npx vitest run src/__tests__/evmBaseline.test.js`

### Step 3 — `src/lib/evmCalculations.js`. (a) Ajouter le helper `buildBaseline` après `plannedValueToDate` (avant `indexStatus`) :

```javascript
/**
 * Construit une baseline figée (PMB) : snapshot du plan de référence que le PV
 * consommera ensuite. Pur ; `capturedAt` est fourni par l'appelant (pas de Date
 * dans la lib → testable).
 *
 * @param {object} project   Projet (phases, settings).
 * @param {object} rates     Carte de taux.
 * @param {string} capturedAt Date de gel 'YYYY-MM-DD'.
 * @returns {{capturedAt:string, startDate:(string|null), phases:Object<string,{startWeek:number,endWeek:number,bac:number}>}}
 */
export function buildBaseline(project, rates, capturedAt) {
  const { phaseSchedule } = calculateProjectDurationWithDependencies(project);
  const schedById = Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));
  const phases = {};
  for (const phase of project.phases || []) {
    const sched = schedById[phase.id] || { startWeek: 0, endWeek: phase.durationWeeks };
    phases[phase.id] = {
      startWeek: sched.startWeek,
      endWeek: sched.endWeek,
      bac: calculatePhaseTotalCost(phase, rates),
    };
  }
  return {
    capturedAt,
    startDate: project.settings?.startDate || null,
    phases,
  };
}
```

(b) Rendre `computeEvm` baseline-aware. **Remplacer** la boucle `byPhase` et la ligne `return` finale :

```javascript
const byPhase = (project.phases || []).map((phase) => {
  const bac = calculatePhaseTotalCost(phase, rates);
  const sched = schedById[phase.id] || { startWeek: 0, endWeek: phase.durationWeeks };
  const pv = plannedValueToDate(sched.startWeek, sched.endWeek, asOfWeek, bac);
  const pct = phaseProgressPct(progress[phase.id]);
  const ev = pct * bac;
  const ac = (actuals[phase.id] && actuals[phase.id].cost) || 0;
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv != null && pv > 0 ? ev / pv : null;
  return { phaseId: phase.id, name: phase.name, bac, pv, ev, ac, pct, cpi, spi };
});
```

par :

```javascript
const baseline = project.baseline || null;
const byPhase = (project.phases || []).map((phase) => {
  const liveBac = calculatePhaseTotalCost(phase, rates);
  const liveSched = schedById[phase.id] || { startWeek: 0, endWeek: phase.durationWeeks };
  // Baseline-aware : PV/BAC mesurés contre le plan figé quand il existe ;
  // sinon plan vivant (comportement chantier D inchangé).
  const bl = baseline && baseline.phases ? baseline.phases[phase.id] : null;
  const bac = bl ? bl.bac : liveBac;
  const startWeek = bl ? bl.startWeek : liveSched.startWeek;
  const endWeek = bl ? bl.endWeek : liveSched.endWeek;
  const pv = plannedValueToDate(startWeek, endWeek, asOfWeek, bac);
  const pct = phaseProgressPct(progress[phase.id]);
  const ev = pct * bac;
  const ac = (actuals[phase.id] && actuals[phase.id].cost) || 0;
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv != null && pv > 0 ? ev / pv : null;
  return { phaseId: phase.id, name: phase.name, bac, pv, ev, ac, pct, cpi, spi };
});
```

Et **remplacer** la ligne finale :

```javascript
return { bac, pv, ev, ac, spi, cpi, eac, etc, vac, byPhase };
```

par :

```javascript
return {
  bac,
  pv,
  ev,
  ac,
  spi,
  cpi,
  eac,
  etc,
  vac,
  byPhase,
  hasBaseline: !!baseline,
  baselineCapturedAt: baseline ? baseline.capturedAt : null,
};
```

(Mettre aussi à jour le commentaire d'en-tête du fichier : « Aucune baseline figée. » → « Baseline figée optionnelle (`project.baseline`) : si présente, PV/BAC mesurés contre elle ; sinon plan vivant. »)

### Step 4 — Run PASS: `npx vitest run src/__tests__/evmBaseline.test.js` ; puis `npx vitest run src/` PASS (non-régression EVM).

### Step 5 — Commit: `git add src/lib/evmCalculations.js src/__tests__/evmBaseline.test.js && git commit -m "feat(evm): frozen baseline — PV/BAC measured against captured plan"`

---

## Task 2 : UI — bouton de gel + bandeau + câblage (i18n)

**Files:** Modify `src/lib/i18n.jsx` ; Modify `src/components/PilotageView.jsx` ; Modify `src/components/ProjectView.jsx`.

### Step 1 — i18n. Repérer les clés `evm.*` (ex. `evm.title`) dans les blocs FR et EN, et ajouter :

FR :

```javascript
'evm.baseline.freeze': 'Figer la baseline',
'evm.baseline.refreeze': 'Re-figer',
'evm.baseline.capturedOn': 'Baseline figée le {date} — PV mesuré contre la baseline',
'evm.baseline.none': 'Aucune baseline — PV vs plan vivant',
'evm.baseline.confirm': 'Re-figer remplacera la baseline de référence actuelle. Continuer ?',
```

EN :

```javascript
'evm.baseline.freeze': 'Freeze baseline',
'evm.baseline.refreeze': 'Re-freeze',
'evm.baseline.capturedOn': 'Baseline frozen on {date} — PV measured against baseline',
'evm.baseline.none': 'No baseline — PV vs live plan',
'evm.baseline.confirm': 'Re-freezing will replace the current reference baseline. Continue?',
```

### Step 2 — `src/components/PilotageView.jsx`.

(a) Importer `buildBaseline` : remplacer la ligne d'import EVM par :

```javascript
import { computeEvm, indexStatus, buildBaseline } from '../lib/evmCalculations';
```

(b) Signature : `const PilotageView = ({ project, rates, onUpdateProject }) => {`

(c) `asOfWeek` mesuré depuis la baseline si présente — remplacer la ligne `asOfWeek` :

```javascript
const asOfWeek = useMemo(
  () => asOfWeekFrom(project.baseline?.startDate || project.settings?.startDate),
  [project.baseline?.startDate, project.settings?.startDate]
);
```

(d) Handler de gel — ajouter avant le `return` principal (après la définition de `Card`) :

```javascript
const freezeBaseline = () => {
  if (project.baseline && !window.confirm(t('evm.baseline.confirm'))) return;
  const today = new Date().toISOString().slice(0, 10);
  onUpdateProject?.({ baseline: buildBaseline(project, rates, today) });
};
```

(e) Bandeau + bouton — insérer juste après le `<h2>` titre (avant la grille de cartes) :

```jsx
<div className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
  <span className="text-sm text-muted-foreground">
    {project.baseline
      ? t('evm.baseline.capturedOn', { date: project.baseline.capturedAt })
      : t('evm.baseline.none')}
  </span>
  <button
    type="button"
    onClick={freezeBaseline}
    className="text-xs border border-border rounded-md px-3 py-1.5 hover:bg-muted whitespace-nowrap"
  >
    {project.baseline ? t('evm.baseline.refreeze') : t('evm.baseline.freeze')}
  </button>
</div>
```

(Note : le `return` anticipé `if (!hasProgress)` se produit avant ce bandeau ; c'est acceptable — on peut figer une baseline une fois l'exécution démarrée. Ne PAS déplacer ce garde-fou.)

### Step 3 — `src/components/ProjectView.jsx` : passer le callback. Remplacer (ligne ~652) :

```jsx
{
  activeTab === 'pilotage' && <PilotageView project={project} rates={rates} />;
}
```

par :

```jsx
{
  activeTab === 'pilotage' && (
    <PilotageView project={project} rates={rates} onUpdateProject={updateProject} />
  );
}
```

### Step 4 — `npm run build` + `npm run lint` + `npx vitest run src/` → OK / pas de nouvelle erreur.

### Step 5 — Commit: `git add src/lib/i18n.jsx src/components/PilotageView.jsx src/components/ProjectView.jsx && git commit -m "feat(evm): freeze-baseline control + status banner in Pilotage"`

---

## Finalisation : `npm run lint && npx vitest run` (ignorer flake serveur) ; push + PR base main (corps FR + note flake + case « vérif manuelle » : figer la baseline, modifier une phase, vérifier que PV/SPI reflètent la baseline figée et non le plan modifié).
