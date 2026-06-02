# Ordonnancement ALAP (SP3b) — Plan

> Subagent-driven. Spec : `docs/superpowers/specs/2026-06-02-alap-scheduling-design.md`. Branche `feature/alap-scheduling`.

**Goal:** Une phase `constraint:{type:'ALAP'}` démarre à son **late start** (passe arrière CPM), consommant sa marge sans rallonger le projet. Extraction de la passe arrière en helper pur partagé `computeLateEnds` (anti-duplication), passe ALAP dans le scheduler, option UI.

**Architecture:** `computeLateEnds(phases, totalWeeks)` pur dans `costCalculations.js` ← partagé par `criticalPath.js` (refactor, dédup) et la passe ALAP du scheduler. La passe ALAP est une 2ᵉ passe avant gardée par présence (`some(p => p.constraint?.type==='ALAP')`), branche DAG uniquement.

---

## Task 1 : Extraire `computeLateEnds` + refactor `criticalPath` (dédup)

**Files:** Modify `src/lib/costCalculations.js` ; Create `src/__tests__/computeLateEnds.test.js` ; Modify `src/lib/criticalPath.js`.

### Step 1 — `src/__tests__/computeLateEnds.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
import { computeLateEnds } from '../lib/costCalculations';

describe('computeLateEnds', () => {
  it('FS chain: predecessor late end bounded by successor late start', () => {
    // A(2) -> B(2). totalWeeks 4. B lateEnd 4 (no succ), A lateEnd 2.
    const phases = [
      { id: 'a', durationWeeks: 2 },
      { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
    ];
    const le = computeLateEnds(phases, 4);
    expect(le.get('b')).toBe(4);
    expect(le.get('a')).toBe(2);
  });

  it('a phase with float has late end earlier than totalWeeks', () => {
    // A(1) and Long(4) both -> End(1). totalWeeks 5.
    const phases = [
      { id: 'a', durationWeeks: 1 },
      { id: 'long', durationWeeks: 4 },
      {
        id: 'end',
        durationWeeks: 1,
        dependencies: [
          { id: 'a', type: 'FS', lag: 0 },
          { id: 'long', type: 'FS', lag: 0 },
        ],
      },
    ];
    const le = computeLateEnds(phases, 5);
    expect(le.get('end')).toBe(5);
    expect(le.get('long')).toBe(4); // critique : lateEnd == earlyEnd
    expect(le.get('a')).toBe(4); // marge : lateEnd 4 > earlyEnd 1
  });
});
```

### Step 2 — Run, expect FAIL: `npx vitest run src/__tests__/computeLateEnds.test.js`

### Step 3 — Dans `src/lib/costCalculations.js`, ajouter la fonction **juste après `applyConstraint`** (après sa `}` de fin, avant `calculateProjectDurationWithDependencies`) :

```javascript
/**
 * Passe arrière CPM : fin au plus tard (late end) de chaque phase, plafonnée à
 * totalWeeks. Pur, sans effet de bord. **Source unique** de la passe arrière,
 * partagée par le chemin critique (SP2) et l'ordonnancement ALAP (SP3b).
 * Suppose un graphe acyclique (appelé hors cycle par les deux consommateurs).
 *
 * @param {Array<{id:string,durationWeeks:number,dependencies?:Array}>} phases
 * @param {number} totalWeeks - Fin du projet (passe avant).
 * @returns {Map<string, number>} id → lateEnd (semaine de fin au plus tard).
 */
export function computeLateEnds(phases, totalWeeks) {
  const phaseMap = new Map(phases.map((p) => [p.id, p]));
  const depsOf = (phase) =>
    (phase.dependencies || []).map(normalizeDependency).filter((d) => phaseMap.has(d.id));
  const successors = new Map(phases.map((p) => [p.id, []]));
  for (const succ of phases) {
    for (const dep of depsOf(succ)) {
      successors.get(dep.id).push({ succId: succ.id, type: dep.type, lag: dep.lag });
    }
  }
  const lateEndMap = new Map();
  const getLateEnd = (id) => {
    if (lateEndMap.has(id)) return lateEndMap.get(id);
    const phase = phaseMap.get(id);
    const d = phase.durationWeeks;
    let lateEnd = totalWeeks;
    for (const s of successors.get(id)) {
      const succPhase = phaseMap.get(s.succId);
      const sLateEnd = getLateEnd(s.succId);
      const sLateStart = sLateEnd - succPhase.durationWeeks;
      let bound;
      switch (s.type) {
        case 'FF':
          bound = sLateEnd - s.lag;
          break;
        case 'SS':
          bound = sLateStart - s.lag + d;
          break;
        case 'SF':
          bound = sLateEnd - s.lag + d;
          break;
        case 'FS':
        default:
          bound = sLateStart - s.lag;
          break;
      }
      lateEnd = Math.min(lateEnd, bound);
    }
    lateEndMap.set(id, lateEnd);
    return lateEnd;
  };
  for (const p of phases) getLateEnd(p.id);
  return lateEndMap;
}
```

### Step 4 — Run PASS: `npx vitest run src/__tests__/computeLateEnds.test.js`.

### Step 5 — Refactor `src/lib/criticalPath.js` pour utiliser `computeLateEnds` (dédup, comportement préservé) :

(a) Import — remplacer la ligne 12 :

```javascript
import {
  calculateProjectDurationWithDependencies,
  normalizeDependency,
  computeLateEnds,
} from './costCalculations';
```

(b) Supprimer le bloc qui construit `successors` + `lateEndMap` + la fonction `getLateEnd` (actuellement entre `if (hasCycle) return allCritical();` et `const byPhase = {};` — soit le `const successors = new Map(...)` jusqu'à la fin de `function getLateEnd(id) {...}` incluse). Le remplacer par :

```javascript
const lateEndMap = computeLateEnds(phases, totalWeeks);
```

(c) Dans la boucle `for (const p of phases)` qui construit `byPhase`, remplacer `const lateEnd = getLateEnd(p.id);` par :

```javascript
const lateEnd = lateEndMap.get(p.id);
```

(Lire `criticalPath.js` pour appliquer ces 3 retraits/remplacements ; `normalizeDependency`, `phaseMap`, `depsOf`, la détection de cycle et `allCritical` restent **inchangés**.)

### Step 6 — Run PASS: `npx vitest run src/` (tous les tests, dont `criticalPath` et `dependencyLinks`, restent verts — comportement préservé).

### Step 7 — Commit: `git add src/lib/costCalculations.js src/lib/criticalPath.js src/__tests__/computeLateEnds.test.js && git commit -m "refactor(scheduler): extract shared computeLateEnds (backward pass)"`

---

## Task 2 : Passe ALAP dans le scheduler (TDD)

**Files:** Create `src/__tests__/alapScheduling.test.js` ; Modify `src/lib/costCalculations.js`.

### Step 1 — `src/__tests__/alapScheduling.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
import { calculateProjectDurationWithDependencies } from '../lib/costCalculations';

describe('ALAP scheduling', () => {
  // A(1) et Long(4) → End(1). A a de la marge (0..3) ; Long est critique.
  const base = () => [
    { id: 'a', name: 'A', durationWeeks: 1 },
    { id: 'long', name: 'Long', durationWeeks: 4 },
    {
      id: 'end',
      name: 'End',
      durationWeeks: 1,
      dependencies: [
        { id: 'a', type: 'FS', lag: 0 },
        { id: 'long', type: 'FS', lag: 0 },
      ],
    },
  ];

  it('pins an ALAP phase with float to its late start (just-in-time)', () => {
    const phases = base();
    phases[0].constraint = { type: 'ALAP' };
    const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies({ phases });
    const a = phaseSchedule.find((s) => s.phaseId === 'a');
    expect(a.startWeek).toBe(3); // late start (End a besoin de A en semaine 4)
    expect(a.endWeek).toBe(4);
    expect(totalWeeks).toBe(5); // inchangé
  });

  it('leaves a critical ALAP phase and totalWeeks unchanged', () => {
    const phases = base();
    phases[1].constraint = { type: 'ALAP' }; // Long est critique (marge 0)
    const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies({ phases });
    const long = phaseSchedule.find((s) => s.phaseId === 'long');
    expect(long.startWeek).toBe(0);
    expect(totalWeeks).toBe(5);
  });

  it('is a no-op for projects without any ALAP phase (regression)', () => {
    const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies({
      phases: base(),
    });
    const a = phaseSchedule.find((s) => s.phaseId === 'a');
    expect(a.startWeek).toBe(0); // ASAP par défaut
    expect(totalWeeks).toBe(5);
  });
});
```

### Step 2 — Run, expect FAIL (3ᵉ test passe déjà ; les 2 premiers échouent) : `npx vitest run src/__tests__/alapScheduling.test.js`

### Step 3 — Dans `src/lib/costCalculations.js`, fonction `calculateProjectDurationWithDependencies`, **remplacer** le bloc final (la construction de `phaseSchedule`, `totalWeeks`, et le `return`) :

```javascript
const phaseSchedule = phases.map((p) => {
  const { startWeek, endWeek } = getSchedule(p.id);
  return { phaseId: p.id, startWeek, endWeek };
});
const totalWeeks = phaseSchedule.length > 0 ? Math.max(...phaseSchedule.map((s) => s.endWeek)) : 0;
return { totalWeeks, phaseSchedule, conflicts };
```

par :

```javascript
// Passe avant ASAP (mémoïsée via getSchedule).
let phaseSchedule = phases.map((p) => {
  const { startWeek, endWeek } = getSchedule(p.id);
  return { phaseId: p.id, startWeek, endWeek };
});
let totalWeeks = phaseSchedule.length > 0 ? Math.max(...phaseSchedule.map((s) => s.endWeek)) : 0;

// SP3b — Passe ALAP : épingle chaque phase ALAP à son late start (consomme sa
// marge, juste-à-temps) sans rallonger le projet. Gardée par présence ; ne
// s'exécute que dans la branche DAG (cycle/séquentiel n'ont pas de marge).
const hasAlap = phases.some((p) => p.constraint?.type === 'ALAP');
if (hasAlap) {
  const lateEnds = computeLateEnds(phases, totalWeeks);
  const alapMap = new Map();
  const getAlapSchedule = (id) => {
    if (alapMap.has(id)) return alapMap.get(id);
    const phase = phaseMap.get(id);
    if (!phase) return { startWeek: 0, endWeek: 0 };
    const duration = phase.durationWeeks;
    let depStart = 0;
    for (const dep of depsOf(phase)) {
      const { startWeek: ps, endWeek: pe } = getAlapSchedule(dep.id);
      let candidate;
      switch (dep.type) {
        case 'SS':
          candidate = ps + dep.lag;
          break;
        case 'FF':
          candidate = pe + dep.lag - duration;
          break;
        case 'SF':
          candidate = ps + dep.lag - duration;
          break;
        case 'FS':
        default:
          candidate = pe + dep.lag;
          break;
      }
      depStart = Math.max(depStart, candidate);
    }
    let { start, end, conflict } = applyConstraint(depStart, duration, phase.constraint);
    if (phase.constraint?.type === 'ALAP') {
      // Plancher ALAP : démarrer au plus tard (late start), borné ≥ 0.
      const lateStart = (lateEnds.get(id) ?? totalWeeks) - duration;
      if (lateStart > start) {
        start = Math.max(0, lateStart);
        end = start + duration;
      }
    }
    if (conflict) conflicts[id] = conflict;
    const entry = { startWeek: start, endWeek: end };
    alapMap.set(id, entry);
    return entry;
  };
  phaseSchedule = phases.map((p) => {
    const { startWeek, endWeek } = getAlapSchedule(p.id);
    return { phaseId: p.id, startWeek, endWeek };
  });
  totalWeeks = phaseSchedule.length > 0 ? Math.max(...phaseSchedule.map((s) => s.endWeek)) : 0;
}

return { totalWeeks, phaseSchedule, conflicts };
```

(`computeLateEnds`, `applyConstraint`, `phaseMap`, `depsOf`, `conflicts` sont déjà dans la portée de la fonction.)

### Step 4 — Run PASS: `npx vitest run src/__tests__/alapScheduling.test.js` ; puis `npx vitest run src/` PASS (non-régression).

### Step 5 — Commit: `git add src/lib/costCalculations.js src/__tests__/alapScheduling.test.js && git commit -m "feat(scheduler): ALAP scheduling (pin phase to late start)"`

---

## Task 3 : UI — option ALAP + i18n

**Files:** Modify `src/lib/i18n.jsx` ; Modify `src/components/PhaseEditor.jsx`.

### Step 1 — i18n. Repérer les clés `constraint.*` existantes (`constraint.snet`, etc.) dans les blocs FR et EN, et ajouter à côté :

FR : `'constraint.alap': 'ALAP (au plus tard)',`
EN : `'constraint.alap': 'ALAP (as late as possible)',`

### Step 2 — `src/components/PhaseEditor.jsx`. LIRE le fichier et repérer l'éditeur de contrainte (SP3) : le `<select>` de type de contrainte (options None/SNET/FNLT/MSO/MFO) et l'input « semaine ». Modifier ainsi :

(a) Ajouter une option ALAP au `<select>` de type, par ex. après l'option MFO :

```jsx
<option value="ALAP">{t('constraint.alap')}</option>
```

(b) Le handler de changement de type doit écrire `constraint = { type: 'ALAP' }` (SANS `week`) quand ALAP est choisi, et l'input « semaine » ne doit PAS être rendu pour ALAP (ALAP n'a pas de semaine). Adapter la condition d'affichage de l'input semaine pour qu'il s'affiche pour SNET/FNLT/MSO/MFO mais **pas** pour ALAP ni pour « Aucune ». Le passage d'un type à l'autre et le retour à « Aucune » (efface `constraint`) doivent continuer de fonctionner.

(Suivre le style existant de l'éditeur SP3 ; ne modifier que l'éditeur de contrainte, pas le reste de `PhaseEditor`.)

### Step 3 — `npm run build` + `npm run lint` + `npx vitest run src/` → OK / pas de nouvelle erreur.

### Step 4 — Commit: `git add src/lib/i18n.jsx src/components/PhaseEditor.jsx && git commit -m "feat(scheduler): ALAP option in phase constraint editor"`

---

## Finalisation : `npm run lint && npx vitest run` (ignorer flake serveur) ; push + PR base main (corps FR + note flake + case « vérif visuelle manuelle » : phase ALAP avec marge → barre déplacée à droite (juste-à-temps), rouge via chemin critique).
