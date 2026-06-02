# Contraintes de date de phase (SP3) — Implementation Plan

> Pour exécution subagent-driven. Spec : `docs/superpowers/specs/2026-06-02-phase-constraints-design.md`. Branche `feature/phase-constraints`.

**Goal:** Contraintes de phase SNET/FNLT/MSO/MFO (offset semaines) appliquées dans la passe avant du scheduler + détection de conflit + UI.

**Architecture:** Helper pur `applyConstraint` ; scheduler `calculateProjectDurationWithDependencies` modifié (additif) pour appliquer la contrainte et retourner un champ additif `conflicts`. UI dans `PhaseEditor` + marqueur dans `TimelineView`.

---

## Task 1 : `applyConstraint` + intégration scheduler + `conflicts` (TDD)

**Files:** Modify `src/lib/costCalculations.js` ; Test `src/__tests__/constraints.test.js` (créer).

### Step 1 — Tests (créer `src/__tests__/constraints.test.js`) :

```javascript
import { describe, it, expect } from 'vitest';
import { applyConstraint, calculateProjectDurationWithDependencies } from '../lib/costCalculations';

describe('applyConstraint', () => {
  it('passthrough without a constraint (= SP1 behaviour)', () => {
    expect(applyConstraint(3, 4, undefined)).toEqual({ start: 3, end: 7, conflict: null });
  });
  it('SNET raises the start to the floor', () => {
    expect(applyConstraint(2, 4, { type: 'SNET', week: 5 })).toEqual({
      start: 5,
      end: 9,
      conflict: null,
    });
  });
  it('SNET below the dependency start is a no-op', () => {
    expect(applyConstraint(6, 4, { type: 'SNET', week: 2 })).toEqual({
      start: 6,
      end: 10,
      conflict: null,
    });
  });
  it('MSO forces the start and flags a conflict if deps wanted later', () => {
    expect(applyConstraint(8, 3, { type: 'MSO', week: 5 })).toEqual({
      start: 5,
      end: 8,
      conflict: 'MSO',
    });
    expect(applyConstraint(2, 3, { type: 'MSO', week: 5 })).toEqual({
      start: 5,
      end: 8,
      conflict: null,
    });
  });
  it('MFO forces the finish (start = week - duration) and flags a conflict', () => {
    expect(applyConstraint(2, 3, { type: 'MFO', week: 10 })).toEqual({
      start: 7,
      end: 10,
      conflict: null,
    });
    expect(applyConstraint(9, 3, { type: 'MFO', week: 10 })).toEqual({
      start: 7,
      end: 10,
      conflict: 'MFO',
    });
  });
  it('FNLT flags a conflict only when the finish exceeds the deadline', () => {
    expect(applyConstraint(2, 3, { type: 'FNLT', week: 10 })).toEqual({
      start: 2,
      end: 5,
      conflict: null,
    });
    expect(applyConstraint(9, 3, { type: 'FNLT', week: 10 })).toEqual({
      start: 9,
      end: 12,
      conflict: 'FNLT',
    });
  });
  it('clamps the start to 0', () => {
    expect(applyConstraint(2, 3, { type: 'MFO', week: 1 }).start).toBe(0);
  });
});

describe('scheduler honours constraints', () => {
  it('SNET on a phase propagates to its dependents', () => {
    const { phaseSchedule, conflicts } = calculateProjectDurationWithDependencies({
      phases: [
        { id: 'a', durationWeeks: 2, constraint: { type: 'SNET', week: 4 } },
        { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      ],
    });
    const m = Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));
    expect(m.a).toEqual({ phaseId: 'a', startWeek: 4, endWeek: 6 }); // SNET pushed a to week 4
    expect(m.b).toEqual({ phaseId: 'b', startWeek: 6, endWeek: 9 }); // b follows
    expect(conflicts).toEqual({});
  });
  it('records a conflict in the additive conflicts map', () => {
    const { conflicts } = calculateProjectDurationWithDependencies({
      phases: [
        { id: 'a', durationWeeks: 4 },
        {
          id: 'b',
          durationWeeks: 2,
          dependencies: [{ id: 'a', type: 'FS', lag: 0 }],
          constraint: { type: 'MSO', week: 1 },
        },
      ],
    });
    // b dep start = 4, MSO week 1 < 4 → conflict
    expect(conflicts.b).toBe('MSO');
  });
  it('no constraint anywhere → unchanged shape (conflicts empty)', () => {
    const { phaseSchedule, conflicts } = calculateProjectDurationWithDependencies({
      phases: [
        { id: 'a', durationWeeks: 2 },
        { id: 'b', durationWeeks: 3 },
      ],
    });
    expect(conflicts).toEqual({});
    expect(phaseSchedule).toEqual([
      { phaseId: 'a', startWeek: 0, endWeek: 2 },
      { phaseId: 'b', startWeek: 2, endWeek: 5 },
    ]);
  });
});
```

### Step 2 — Run, expect FAIL: `npx vitest run src/__tests__/constraints.test.js`

### Step 3 — Add `applyConstraint` (in `src/lib/costCalculations.js`, before `calculateProjectDurationWithDependencies`):

```javascript
/**
 * Applique une contrainte de date de phase au start piloté par les dépendances.
 * @param {number} depStart  Start (semaines) imposé par les dépendances.
 * @param {number} duration  Durée de la phase (semaines).
 * @param {{type:'SNET'|'FNLT'|'MSO'|'MFO', week:number}|undefined} constraint
 * @returns {{ start:number, end:number, conflict:('SNET'|'FNLT'|'MSO'|'MFO'|null) }}
 */
export function applyConstraint(depStart, duration, constraint) {
  let start = Math.max(0, depStart);
  let conflict = null;
  if (constraint && Number.isFinite(constraint.week)) {
    const w = constraint.week;
    if (constraint.type === 'SNET') {
      start = Math.max(start, w);
    } else if (constraint.type === 'MSO') {
      if (start > w) conflict = 'MSO';
      start = w;
    } else if (constraint.type === 'MFO') {
      const cs = w - duration;
      if (start > cs) conflict = 'MFO';
      start = cs;
    }
    start = Math.max(0, start);
  }
  const end = start + duration;
  if (
    constraint &&
    constraint.type === 'FNLT' &&
    Number.isFinite(constraint.week) &&
    end > constraint.week
  ) {
    conflict = 'FNLT';
  }
  return { start, end, conflict };
}
```

### Step 4 — Integrate in `calculateProjectDurationWithDependencies`. Make THREE edits:

(a) Replace the `sequential` helper body with a constraint-aware version:

```javascript
const sequential = () => {
  let offset = 0;
  const conflicts = {};
  const phaseSchedule = phases.map((p) => {
    const { start, end, conflict } = applyConstraint(offset, p.durationWeeks, p.constraint);
    if (conflict) conflicts[p.id] = conflict;
    offset = end;
    return { phaseId: p.id, startWeek: start, endWeek: end };
  });
  return { totalWeeks: offset, phaseSchedule, conflicts };
};
```

(b) In the memoized `getSchedule`, replace the tail (the part that did `startWeek = Math.max(0, startWeek)` and built the entry) so it applies the constraint and records conflicts. Declare `const conflicts = {};` just above `getSchedule`. The dependency loop stays identical but accumulate into `depStart`; then:

```javascript
const { start, end, conflict } = applyConstraint(depStart, duration, phase.constraint);
if (conflict) conflicts[id] = conflict;
const entry = { startWeek: start, endWeek: end };
scheduleMap.set(id, entry);
return entry;
```

(Rename the loop accumulator variable to `depStart` — it was `startWeek`. `duration` is `phase.durationWeeks`.)

(c) The final return (DAG path) becomes:

```javascript
return { totalWeeks, phaseSchedule, conflicts };
```

> The two `sequential()` return paths (no-deps, cycle) already carry their own `conflicts`. Existing consumers destructure `{ totalWeeks, phaseSchedule }` and ignore `conflicts` → no regression. The existing `src/__tests__/scheduler.test.js` (no constraints) must still pass.

### Step 5 — Run: `npx vitest run src/__tests__/constraints.test.js src/__tests__/scheduler.test.js` → PASS. Then `npx vitest run src/` → PASS.

### Step 6 — Commit:

```bash
git add src/lib/costCalculations.js src/__tests__/constraints.test.js
git commit -m "feat(scheduler): phase date constraints (SNET/FNLT/MSO/MFO) + conflict flag"
```

---

## Task 2 : UI + i18n

**Files:** Modify `src/lib/i18n.jsx`, `src/components/PhaseEditor.jsx`, `src/components/TimelineView.jsx`.

### Step 1 — i18n. After `'phase.dependencies'` in BOTH FR and EN blocks, add:

FR:

```javascript
'constraint.label': 'Contrainte de date',
'constraint.none': 'Aucune',
'constraint.snet': 'Début au plus tôt (SNET)',
'constraint.fnlt': 'Fin au plus tard (FNLT)',
'constraint.mso': 'Doit commencer (MSO)',
'constraint.mfo': 'Doit finir (MFO)',
'constraint.week': 'Semaine',
'constraint.conflict': 'Conflit de contrainte',
```

EN:

```javascript
'constraint.label': 'Date constraint',
'constraint.none': 'None',
'constraint.snet': 'Start no earlier than (SNET)',
'constraint.fnlt': 'Finish no later than (FNLT)',
'constraint.mso': 'Must start on (MSO)',
'constraint.mfo': 'Must finish on (MFO)',
'constraint.week': 'Week',
'constraint.conflict': 'Constraint conflict',
```

### Step 2 — PhaseEditor : sous le bloc des dépendances (après le conteneur `{allPhases.length > 1 && (...)}`), ajouter un bloc contrainte :

```jsx
<div className="border-t border-border pt-4 mt-4">
  <h4 className="font-semibold mb-2">{t('constraint.label')}</h4>
  <div className="flex items-center gap-2">
    <select
      value={phase.constraint?.type || ''}
      onChange={(e) => {
        const type = e.target.value;
        if (!type) update({ constraint: null });
        else update({ constraint: { type, week: phase.constraint?.week ?? 0 } });
      }}
      className="text-sm border border-border rounded-md px-2 py-1 bg-background"
    >
      <option value="">{t('constraint.none')}</option>
      <option value="SNET">{t('constraint.snet')}</option>
      <option value="FNLT">{t('constraint.fnlt')}</option>
      <option value="MSO">{t('constraint.mso')}</option>
      <option value="MFO">{t('constraint.mfo')}</option>
    </select>
    {phase.constraint?.type && (
      <label className="flex items-center gap-1 text-sm">
        {t('constraint.week')}
        <input
          type="number"
          min={0}
          step={1}
          value={phase.constraint.week}
          onChange={(e) =>
            update({
              constraint: {
                ...phase.constraint,
                week: Math.max(0, parseInt(e.target.value, 10) || 0),
              },
            })
          }
          className="w-16 text-sm text-center border border-border rounded-md px-1 py-1 bg-background font-mono tabular-nums"
        />
      </label>
    )}
  </div>
</div>
```

(`update` et `t` sont déjà disponibles. Lire le composant pour placer ce bloc juste après le bloc dépendances.)

### Step 3 — TimelineView : exposer les conflits + marqueur. Là où `calculateProjectDurationWithDependencies(project)` est destructuré, ajouter `conflicts` :

```javascript
const { totalWeeks, phaseSchedule, conflicts } = calculateProjectDurationWithDependencies(project);
```

Puis dans le rendu de la ligne de phase, à côté du nom de phase (la `<div className="w-20 sm:w-36 ...">{phase.name}</div>`), ajouter un marqueur quand `conflicts?.[phase.id]` existe :

```jsx
{
  conflicts?.[phase.id] && (
    <span
      title={`${t('constraint.conflict')} (${conflicts[phase.id]})`}
      className="text-[var(--prism-error)] ml-1"
    >
      ⚠
    </span>
  );
}
```

(Insérer à l'intérieur de la cellule du nom de phase, après `{phase.name}`. Lire le fichier pour le placement exact.)

### Step 4 — Build + lint : `npm run build` puis `npm run lint` → OK / aucune nouvelle erreur.

### Step 5 — Commit:

```bash
git add src/lib/i18n.jsx src/components/PhaseEditor.jsx src/components/TimelineView.jsx
git commit -m "feat(scheduler): constraint editor in PhaseEditor + conflict marker in TimelineView"
```

---

## Finalisation

- `npm run lint && npx vitest run` → vert (ignorer flake serveur connu).
- Push + PR (base main).
