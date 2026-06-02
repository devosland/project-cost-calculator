# Nivellement de ressources (suggestions) (SP4) — Plan

> Subagent-driven. Spec : `docs/superpowers/specs/2026-06-02-resource-leveling-design.md`. Branche `feature/resource-leveling`.

**Goal:** `suggestLeveling(project)` pur (croise chevauchements de phases même rôle/niveau >100 % avec la marge SP2 → propose un décalage SNET) + panneau UI.

---

## Task 1 : `suggestLeveling` + tests (TDD)

**Files:** Create `src/lib/leveling.js` ; Create `src/__tests__/leveling.test.js`.

### Step 1 — `src/__tests__/leveling.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
import { suggestLeveling } from '../lib/leveling';

const dev = (alloc) => [{ role: 'Dev', level: 'Senior', quantity: 1, allocation: alloc }];

describe('suggestLeveling', () => {
  it('suggests delaying the floated phase to resolve an overlap over 100%', () => {
    const s = suggestLeveling({
      phases: [
        { id: 'x', name: 'X', durationWeeks: 2, teamMembers: dev(60) },
        {
          id: 'w',
          name: 'W',
          durationWeeks: 4,
          dependencies: [{ id: 'x', type: 'FS', lag: 0 }],
          teamMembers: [],
        },
        { id: 'y', name: 'Y', durationWeeks: 2, teamMembers: dev(60) },
      ],
    });
    expect(s).toHaveLength(1);
    expect(s[0].phaseId).toBe('y');
    expect(s[0].delayWeeks).toBe(2); // min(float 4, overlap 2)
    expect(s[0].newStart).toBe(2);
    expect(s[0].role).toBe('Dev');
    expect(s[0].level).toBe('Senior');
  });

  it('no suggestion when phases do not overlap', () => {
    const s = suggestLeveling({
      phases: [
        { id: 'a', name: 'A', durationWeeks: 2, teamMembers: dev(60) },
        {
          id: 'b',
          name: 'B',
          durationWeeks: 2,
          dependencies: [{ id: 'a', type: 'FS', lag: 0 }],
          teamMembers: dev(60),
        },
      ],
    });
    expect(s).toEqual([]);
  });

  it('no suggestion when combined allocation is within 100%', () => {
    const s = suggestLeveling({
      phases: [
        { id: 'x', name: 'X', durationWeeks: 2, teamMembers: dev(50) },
        {
          id: 'w',
          name: 'W',
          durationWeeks: 4,
          dependencies: [{ id: 'x', type: 'FS', lag: 0 }],
          teamMembers: [],
        },
        { id: 'y', name: 'Y', durationWeeks: 2, teamMembers: dev(50) },
      ],
    });
    expect(s).toEqual([]);
  });

  it('no suggestion when both overlapping phases are critical', () => {
    const s = suggestLeveling({
      phases: [
        { id: 'x', name: 'X', durationWeeks: 2, teamMembers: dev(60) },
        { id: 'y', name: 'Y', durationWeeks: 2, teamMembers: dev(60) },
        {
          id: 'z',
          name: 'Z',
          durationWeeks: 2,
          dependencies: [
            { id: 'x', type: 'FS', lag: 0 },
            { id: 'y', type: 'FS', lag: 0 },
          ],
          teamMembers: [],
        },
      ],
    });
    expect(s).toEqual([]);
  });
});
```

### Step 2 — Run, expect FAIL: `npx vitest run src/__tests__/leveling.test.js`

### Step 3 — `src/lib/leveling.js` :

```javascript
/**
 * Suggestions de nivellement de ressources (SP4) — pur, sans effet de bord.
 *
 * Croise les phases qui se chevauchent et partagent un rôle+niveau dont la
 * somme des allocations dépasse 100 %, et propose de décaler la phase ayant de
 * la marge (CPM, SP2) — appliqué via une contrainte SNET (SP3). Raisonne sur les
 * teamMembers du projet (pas le pool capacité cross-projets).
 */
import { calculateCriticalPath } from './criticalPath';

/** Demande par `role|level` d'une phase = Σ (allocation × quantity). */
function phaseDemand(phase) {
  const map = {};
  for (const m of phase.teamMembers || []) {
    const key = `${m.role}|${m.level}`;
    map[key] = (map[key] || 0) + (m.allocation || 0) * (m.quantity || 1);
  }
  return map;
}

/**
 * @param {object} project
 * @returns {Array<{ phaseId, phaseName, role, level, delayWeeks, newStart }>}
 */
export function suggestLeveling(project) {
  const phases = project.phases || [];
  const { byPhase } = calculateCriticalPath(project);
  const info = phases.map((p) => {
    const cp = byPhase[p.id] || { earlyStart: 0, earlyEnd: p.durationWeeks, totalFloat: 0 };
    return {
      id: p.id,
      name: p.name,
      start: cp.earlyStart,
      end: cp.earlyEnd,
      float: cp.totalFloat,
      demand: phaseDemand(p),
    };
  });

  const byId = {};
  for (let i = 0; i < info.length; i++) {
    for (let j = i + 1; j < info.length; j++) {
      const A = info[i];
      const B = info[j];
      const overlap = Math.min(A.end, B.end) - Math.max(A.start, B.start);
      if (overlap <= 0) continue;
      for (const key of Object.keys(A.demand)) {
        if (!(key in B.demand)) continue;
        if (A.demand[key] + B.demand[key] <= 100) continue;
        const floated = A.float > 0 ? A : B.float > 0 ? B : null;
        if (!floated) continue;
        const delay = Math.min(floated.float, overlap);
        if (delay <= 0) continue;
        const [role, level] = key.split('|');
        const candidate = {
          phaseId: floated.id,
          phaseName: floated.name,
          role,
          level,
          delayWeeks: delay,
          newStart: floated.start + delay,
        };
        const cur = byId[floated.id];
        if (!cur || delay > cur.delayWeeks) byId[floated.id] = candidate;
      }
    }
  }
  return Object.values(byId);
}
```

### Step 4 — Run PASS: `npx vitest run src/__tests__/leveling.test.js` ; puis `npx vitest run src/` PASS.

### Step 5 — Commit: `git add src/lib/leveling.js src/__tests__/leveling.test.js && git commit -m "feat(scheduler): resource leveling suggestions (float-based)"`

---

## Task 2 : Panneau UI + i18n + câblage

**Files:** Modify `src/lib/i18n.jsx` ; Create `src/components/LevelingSuggestions.jsx` ; Modify `src/components/ProjectView.jsx`.

### Step 1 — i18n. Après `'timeline.phase'` dans les blocs FR et EN :

FR:

```javascript
'leveling.title': 'Nivellement',
'leveling.empty': 'Aucune sur-allocation à niveler.',
'leveling.suggestion': 'Décaler {phase} de {weeks} sem. — {role} sur-alloué',
'leveling.apply': 'Appliquer',
```

EN:

```javascript
'leveling.title': 'Leveling',
'leveling.empty': 'No over-allocation to level.',
'leveling.suggestion': 'Delay {phase} by {weeks} wks — {role} over-allocated',
'leveling.apply': 'Apply',
```

### Step 2 — `src/components/LevelingSuggestions.jsx` :

```jsx
/**
 * LevelingSuggestions — panneau de suggestions de nivellement (SP4).
 * Lecture du pur `suggestLeveling`; « Appliquer » pose une contrainte SNET via onApplyConstraint.
 */
import { suggestLeveling } from '../lib/leveling';
import { useLocale } from '../lib/i18n';

const LevelingSuggestions = ({ project, onApplyConstraint }) => {
  const { t } = useLocale();
  const suggestions = suggestLeveling(project);
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-2">
      <h3 className="font-semibold">{t('leveling.title')}</h3>
      {suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('leveling.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <li key={s.phaseId} className="flex items-center justify-between gap-3 text-sm">
              <span>
                {t('leveling.suggestion', {
                  phase: s.phaseName,
                  weeks: s.delayWeeks,
                  role: `${s.role} ${s.level}`,
                })}
              </span>
              <button
                type="button"
                className="text-xs border border-border rounded-md px-2 py-1 hover:bg-muted whitespace-nowrap"
                onClick={() => onApplyConstraint(s.phaseId, { type: 'SNET', week: s.newStart })}
              >
                {t('leveling.apply')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LevelingSuggestions;
```

### Step 3 — Câbler dans `ProjectView.jsx`. Importer `import LevelingSuggestions from './LevelingSuggestions';`. Dans le rendu de l'onglet `timeline` (le bloc `{activeTab === 'timeline' && ( ... <TimelineView ... /> ... )}`), ajouter SOUS le `<TimelineView .../>` :

```jsx
<LevelingSuggestions
  project={project}
  onApplyConstraint={(phaseId, constraint) =>
    updateProject({
      phases: project.phases.map((p) => (p.id === phaseId ? { ...p, constraint } : p)),
    })
  }
/>
```

(Lire `ProjectView.jsx` pour le placement exact dans l'onglet timeline ; `updateProject` est déjà disponible — utilisé dans l'onglet budget.)

### Step 4 — `npm run build` + `npm run lint` → OK / pas de nouvelle erreur.

### Step 5 — Commit: `git add src/lib/i18n.jsx src/components/LevelingSuggestions.jsx src/components/ProjectView.jsx && git commit -m "feat(scheduler): leveling suggestions panel in Timeline tab"`

---

## Finalisation : `npm run lint && npx vitest run` (ignorer flake serveur) ; push + PR base main.
