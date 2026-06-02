# Dépendances de phase typées + lag (SP1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à chaque dépendance de phase un type (FS/SS/FF/SF) et un décalage (lag, en semaines, négatif = avance), et faire en sorte que l'ordonnanceur de phases en tienne compte.

**Architecture:** Réécriture de la fonction pure `calculateProjectDurationWithDependencies` (mémoïse `{startWeek, endWeek}` par phase, applique type+lag), avec un helper pur `normalizeDependency` pour la rétro-compat (string → `{id,'FS',0}`). UI d'édition type+lag dans `PhaseEditor`. La forme de retour `phaseSchedule` est inchangée → les 4 consommateurs (Gantt, PV/EVM, conflits, iCal) en bénéficient sans modification.

**Tech Stack:** React 18 + Vite + tokens Prism, Vitest. Spec : `docs/superpowers/specs/2026-06-01-typed-dependencies-design.md`.

**Convention :** un commit par tâche. Branche `feature/typed-phase-dependencies`, une seule PR.

---

## File Structure

| Fichier                           | Rôle                    | Action                                                                        |
| --------------------------------- | ----------------------- | ----------------------------------------------------------------------------- |
| `src/lib/costCalculations.js`     | Ordonnanceur + helper   | Modifier : `normalizeDependency`, `DEPENDENCY_TYPES`, réécriture du scheduler |
| `src/__tests__/scheduler.test.js` | Tests de l'ordonnanceur | Créer                                                                         |
| `src/lib/i18n.jsx`                | Traductions FR/EN       | Modifier : libellés types + lag                                               |
| `src/components/PhaseEditor.jsx`  | Édition de phase        | Modifier : type + lag par dépendance                                          |

---

## Task 1 : Ordonnanceur typé + lag + `normalizeDependency` (TDD)

**Files:**

- Modify: `src/lib/costCalculations.js`
- Test: `src/__tests__/scheduler.test.js` (créer)

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/__tests__/scheduler.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
import {
  normalizeDependency,
  calculateProjectDurationWithDependencies,
} from '../lib/costCalculations';

/** Build a minimal project from phase specs. */
function proj(phases) {
  return { phases };
}
/** Schedule lookup helper. */
function sched(project) {
  const { phaseSchedule } = calculateProjectDurationWithDependencies(project);
  return Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));
}

describe('normalizeDependency', () => {
  it('turns a string into an FS/0 object', () => {
    expect(normalizeDependency('p1')).toEqual({ id: 'p1', type: 'FS', lag: 0 });
  });
  it('fills defaults on a partial object', () => {
    expect(normalizeDependency({ id: 'p1' })).toEqual({ id: 'p1', type: 'FS', lag: 0 });
  });
  it('keeps a valid type and lag', () => {
    expect(normalizeDependency({ id: 'p1', type: 'SS', lag: 3 })).toEqual({
      id: 'p1',
      type: 'SS',
      lag: 3,
    });
  });
  it('falls back to FS on an invalid type and 0 on a non-finite lag', () => {
    expect(normalizeDependency({ id: 'p1', type: 'XX', lag: 'nope' })).toEqual({
      id: 'p1',
      type: 'FS',
      lag: 0,
    });
  });
});

describe('calculateProjectDurationWithDependencies — typed + lag', () => {
  it('no dependencies → sequential (unchanged)', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 4 },
        { id: 'b', durationWeeks: 6 },
      ])
    );
    expect(s.a).toEqual({ phaseId: 'a', startWeek: 0, endWeek: 4 });
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 4, endWeek: 10 });
  });

  it('FS lag 0 (string dep) reproduces current behaviour', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 4 },
        { id: 'b', durationWeeks: 6, dependencies: ['a'] },
      ])
    );
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 4, endWeek: 10 });
  });

  it('FS with positive lag delays the successor', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 4 },
        { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'FS', lag: 2 }] },
      ])
    );
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 6, endWeek: 12 });
  });

  it('FS with negative lag (lead) pulls the successor earlier', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 4 },
        { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'FS', lag: -1 }] },
      ])
    );
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 3, endWeek: 9 });
  });

  it('SS aligns starts (plus lag)', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }] },
        { id: 'x', durationWeeks: 5 },
        { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'SS', lag: 1 }] },
      ])
    );
    // x:{0,5}; a FS on x → {5,9}; b SS+1 on a → start = a.start(5)+1 = 6
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 6, endWeek: 12 });
  });

  it('FF aligns finishes (plus lag)', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 6 },
        { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FF', lag: 0 }] },
      ])
    );
    // b.end >= a.end(6) → b.start = 6 - 2 = 4
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 4, endWeek: 6 });
  });

  it('SF: successor finishes at predecessor start (plus lag)', () => {
    const s = sched(
      proj([
        { id: 'x', durationWeeks: 5 },
        { id: 'a', durationWeeks: 4, dependencies: [{ id: 'x', type: 'FS', lag: 0 }] },
        { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'SF', lag: 0 }] },
      ])
    );
    // x:{0,5}; a:{5,9}; b SF on a → b.end >= a.start(5) → b.start = 5 - 2 = 3
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 3, endWeek: 5 });
  });

  it('clamps start to 0 when a lead would go negative', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 4 },
        { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'SS', lag: -10 }] },
      ])
    );
    // a.start(0) + (-10) = -10 → clamp 0
    expect(s.b.startWeek).toBe(0);
  });

  it('takes the max across multiple mixed dependencies', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 4 },
        { id: 'b', durationWeeks: 3 },
        {
          id: 'c',
          durationWeeks: 2,
          dependencies: [
            { id: 'a', type: 'FS', lag: 0 },
            { id: 'b', type: 'SS', lag: 5 },
          ],
        },
      ])
    );
    // dependency mode: a and b have no deps → both start at week 0 (a:{0,4}, b:{0,3}).
    // c: max(FS a → a.end 4, SS b → b.start(0)+5 = 5) = 5
    expect(s.c).toEqual({ phaseId: 'c', startWeek: 5, endWeek: 7 });
  });

  it('handles a mix of string and object deps on the same phase', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 4 },
        { id: 'b', durationWeeks: 3 },
        { id: 'c', durationWeeks: 2, dependencies: ['a', { id: 'b', type: 'FS', lag: 0 }] },
      ])
    );
    // dependency mode: a:{0,4}, b:{0,3} (no deps → start 0). c: max(FS a → 4, FS b → 3) = 4
    expect(s.c).toEqual({ phaseId: 'c', startWeek: 4, endWeek: 6 });
  });

  it('falls back to sequential on a cycle', () => {
    const s = sched(
      proj([
        { id: 'a', durationWeeks: 4, dependencies: [{ id: 'b', type: 'FS', lag: 0 }] },
        { id: 'b', durationWeeks: 6, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      ])
    );
    // cycle → sequential: a:{0,4}, b:{4,10}
    expect(s.a).toEqual({ phaseId: 'a', startWeek: 0, endWeek: 4 });
    expect(s.b).toEqual({ phaseId: 'b', startWeek: 4, endWeek: 10 });
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/__tests__/scheduler.test.js`
Expected: FAIL — `normalizeDependency` non exporté / planning typé incorrect.

- [ ] **Step 3 : Ajouter `normalizeDependency` + `DEPENDENCY_TYPES`**

Dans `src/lib/costCalculations.js`, AVANT `calculateProjectDurationWithDependencies`, ajouter :

```javascript
/** Types de dépendance supportés (Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish). */
export const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'];

/**
 * Normalise une entrée de dépendance de phase en { id, type, lag }.
 * Rétro-compat : une dépendance stockée en string (ancien format) devient FS / lag 0.
 *
 * @param {string|{id:string,type?:string,lag?:number}} dep
 * @returns {{ id: string, type: 'FS'|'SS'|'FF'|'SF', lag: number }}
 */
export function normalizeDependency(dep) {
  if (typeof dep === 'string') return { id: dep, type: 'FS', lag: 0 };
  if (dep && typeof dep === 'object') {
    return {
      id: dep.id,
      type: DEPENDENCY_TYPES.includes(dep.type) ? dep.type : 'FS',
      lag: Number.isFinite(dep.lag) ? dep.lag : 0,
    };
  }
  return { id: undefined, type: 'FS', lag: 0 };
}
```

- [ ] **Step 4 : Réécrire `calculateProjectDurationWithDependencies`**

Remplacer ENTIÈREMENT la fonction `calculateProjectDurationWithDependencies` existante par :

```javascript
/**
 * Calcule le planning des phases en respectant le type de dépendance
 * (FS/SS/FF/SF) et le décalage (lag, en semaines ; négatif = avance).
 * Détecte les cycles (repli séquentiel) et retombe en séquentiel sans dépendance.
 *
 * @param {object} project
 * @returns {{ totalWeeks: number, phaseSchedule: Array<{phaseId:string,startWeek:number,endWeek:number}> }}
 */
export function calculateProjectDurationWithDependencies(project) {
  const phases = project.phases || [];
  if (phases.length === 0) return { totalWeeks: 0, phaseSchedule: [] };
  const phaseMap = new Map(phases.map((p) => [p.id, p]));

  // Dépendances normalisées d'une phase, filtrées aux prédécesseurs existants.
  const depsOf = (phase) =>
    (phase.dependencies || []).map(normalizeDependency).filter((d) => phaseMap.has(d.id));

  const sequential = () => {
    let offset = 0;
    const phaseSchedule = phases.map((p) => {
      const entry = { phaseId: p.id, startWeek: offset, endWeek: offset + p.durationWeeks };
      offset += p.durationWeeks;
      return entry;
    });
    return { totalWeeks: offset, phaseSchedule };
  };

  const hasDependencies = phases.some((p) => depsOf(p).length > 0);
  if (!hasDependencies) return sequential();

  // Détection de cycle (DFS trois couleurs) sur les ids normalisés.
  const visited = new Set();
  const visiting = new Set();
  let hasCycle = false;
  function detectCycle(id) {
    if (visiting.has(id)) {
      hasCycle = true;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const phase = phaseMap.get(id);
    if (phase) {
      for (const dep of depsOf(phase)) detectCycle(dep.id);
    }
    visiting.delete(id);
    visited.add(id);
  }
  for (const p of phases) {
    detectCycle(p.id);
    if (hasCycle) break;
  }
  if (hasCycle) return sequential();

  // Planning mémoïsé { startWeek, endWeek } respectant type + lag.
  const scheduleMap = new Map();
  function getSchedule(id) {
    if (scheduleMap.has(id)) return scheduleMap.get(id);
    const phase = phaseMap.get(id);
    if (!phase) return { startWeek: 0, endWeek: 0 };
    const duration = phase.durationWeeks;
    let startWeek = 0;
    for (const dep of depsOf(phase)) {
      const { startWeek: ps, endWeek: pe } = getSchedule(dep.id);
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
      startWeek = Math.max(startWeek, candidate);
    }
    startWeek = Math.max(0, startWeek);
    const entry = { startWeek, endWeek: startWeek + duration };
    scheduleMap.set(id, entry);
    return entry;
  }

  const phaseSchedule = phases.map((p) => {
    const { startWeek, endWeek } = getSchedule(p.id);
    return { phaseId: p.id, startWeek, endWeek };
  });
  const totalWeeks =
    phaseSchedule.length > 0 ? Math.max(...phaseSchedule.map((s) => s.endWeek)) : 0;
  return { totalWeeks, phaseSchedule };
}
```

> Note : la récursion `getSchedule` est sûre car la détection de cycle s'exécute avant (aucune récursion infinie possible).

- [ ] **Step 5 : Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/__tests__/scheduler.test.js`
Expected: PASS.
Run aussi la suite frontend (non-régression des consommateurs) : `npx vitest run src/`
Expected: PASS.

- [ ] **Step 6 : Commit**

```bash
git add src/lib/costCalculations.js src/__tests__/scheduler.test.js
git commit -m "feat(scheduler): typed phase dependencies (FS/SS/FF/SF) + lag"
```

---

## Task 2 : Traductions FR/EN (types + lag)

**Files:**

- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1 : Ajouter les clés FR**

Dans le bloc FR de `src/lib/i18n.jsx`, immédiatement APRÈS la ligne `'phase.dependencies': …` (le libellé existant de la section dépendances), ajouter :

```javascript
'dep.type.fs': 'Fin → Début (FS)',
'dep.type.ss': 'Début → Début (SS)',
'dep.type.ff': 'Fin → Fin (FF)',
'dep.type.sf': 'Début → Fin (SF)',
'dep.lag': 'Décalage (sem.)',
```

- [ ] **Step 2 : Ajouter les clés EN**

Dans le bloc EN, immédiatement APRÈS la ligne `'phase.dependencies': …`, ajouter :

```javascript
'dep.type.fs': 'Finish → Start (FS)',
'dep.type.ss': 'Start → Start (SS)',
'dep.type.ff': 'Finish → Finish (FF)',
'dep.type.sf': 'Start → Finish (SF)',
'dep.lag': 'Lag (wks)',
```

> Chercher `'phase.dependencies'` pour localiser les DEUX occurrences (FR puis EN). Ajouter les 5 clés après chacune. Préserver les accents (Fin → Début, Décalage).

- [ ] **Step 3 : Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/i18n.jsx
git commit -m "feat(i18n): dependency type + lag labels (FR/EN)"
```

---

## Task 3 : Édition type + lag dans `PhaseEditor`

**Files:**

- Modify: `src/components/PhaseEditor.jsx`

Le bloc actuel rend une case à cocher par autre phase et stocke `dependencies` en tableau d'ids string. On le remplace par : case à cocher + (si cochée) un `<select>` de type et un input lag, en stockant des objets `{id, type, lag}`. La normalisation gère les anciennes entrées string.

- [ ] **Step 1 : Importer `normalizeDependency`**

En tête de `src/components/PhaseEditor.jsx`, ajouter à l'import depuis `'../lib/costCalculations'` (s'il existe déjà un import de ce module, y ajouter le nom ; sinon créer la ligne) :

```javascript
import { normalizeDependency } from '../lib/costCalculations';
```

- [ ] **Step 2 : Remplacer le bloc des dépendances**

Localiser le bloc actuel (la liste `allPhases.filter(...).map((otherPhase) => { ... checkbox ... })` sous le titre `t('phase.dependencies')`) et remplacer le `.map(...)` par :

```jsx
{
  allPhases
    .filter((p) => p.id !== phase.id)
    .map((otherPhase) => {
      const deps = (phase.dependencies || []).map(normalizeDependency);
      const current = deps.find((d) => d.id === otherPhase.id);
      const isChecked = !!current;
      const writeDeps = (next) => update({ dependencies: next });
      const toggle = () => {
        if (isChecked) writeDeps(deps.filter((d) => d.id !== otherPhase.id));
        else writeDeps([...deps, { id: otherPhase.id, type: 'FS', lag: 0 }]);
      };
      const setField = (field, value) =>
        writeDeps(deps.map((d) => (d.id === otherPhase.id ? { ...d, [field]: value } : d)));
      return (
        <div
          key={otherPhase.id}
          className="flex items-center gap-2 text-sm py-1 px-2 rounded-md hover:bg-muted"
        >
          <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
            <input
              type="checkbox"
              checked={isChecked}
              onChange={toggle}
              className="rounded border-border"
            />
            <span className="truncate">{otherPhase.name}</span>
          </label>
          {isChecked && (
            <>
              <select
                value={current.type}
                onChange={(e) => setField('type', e.target.value)}
                aria-label={`${otherPhase.name} — ${t('phase.dependencies')}`}
                className="text-xs border border-border rounded-md px-1 py-1 bg-background"
              >
                <option value="FS">{t('dep.type.fs')}</option>
                <option value="SS">{t('dep.type.ss')}</option>
                <option value="FF">{t('dep.type.ff')}</option>
                <option value="SF">{t('dep.type.sf')}</option>
              </select>
              <input
                type="number"
                value={current.lag}
                onChange={(e) => setField('lag', parseInt(e.target.value, 10) || 0)}
                title={t('dep.lag')}
                aria-label={`${otherPhase.name} — ${t('dep.lag')}`}
                className="w-16 text-xs text-center border border-border rounded-md px-1 py-1 bg-background font-mono tabular-nums"
              />
            </>
          )}
        </div>
      );
    });
}
```

(Conserver le conteneur englobant `{allPhases.length > 1 && ( … <h4>…</h4> <div className="space-y-1"> … </div> … )}` ; on ne remplace QUE le `.map(...)` interne. La fonction `update` et `t` sont déjà disponibles dans le composant.)

- [ ] **Step 3 : Vérifier build + lint**

Run: `npm run build`
Expected: build OK.
Run: `npm run lint`
Expected: aucune nouvelle erreur sur `PhaseEditor.jsx`.

- [ ] **Step 4 : Vérification manuelle (dev)**

Run: `npm run dev`
Vérifier :

1. Dans l'éditeur de phase, cocher une dépendance affiche un `<select>` de type + un input lag.
2. Choisir SS / FF / SF et un lag (ex. 2, −1) repositionne les barres dans l'onglet « Ligne de temps » (et le PV du Pilotage / les conflits suivent).
3. Un projet existant (deps string) s'ouvre, les dépendances cochées s'affichent en FS / lag 0.
4. FS / lag 0 donne exactement le planning d'avant.

- [ ] **Step 5 : Commit**

```bash
git add src/components/PhaseEditor.jsx
git commit -m "feat(scheduler): edit dependency type + lag in PhaseEditor"
```

---

## Finalisation

- [ ] **Suite + lint**

Run: `npm run lint && npx vitest run`
Expected: tout vert (ignorer le flake serveur connu ; un re-run passe — cf. mémoire).

- [ ] **Pousser + PR**

```bash
git push -u origin feature/typed-phase-dependencies
gh pr create --base main --title "feat(scheduler): typed phase dependencies + lag (SP1)" --body "Voir docs/superpowers/specs/2026-06-01-typed-dependencies-design.md. SP1 du moteur d'ordonnancement (C+E), niveau phase."
```

---

## Self-Review (couverture spec → plan)

| Exigence spec                                                                         | Tâche                                |
| ------------------------------------------------------------------------------------- | ------------------------------------ |
| §5 modèle `{id,type,lag}` + `normalizeDependency` (string → FS/0)                     | Task 1 (Step 3)                      |
| §6 scheduler FS/SS/FF/SF + lag, clamp ≥0, cycle/séquentiel conservés, forme inchangée | Task 1 (Step 4)                      |
| §6 consommateurs inchangés (forme `phaseSchedule` identique)                          | Task 1 (vérif non-régression Step 5) |
| §7 UI type + lag par dépendance dans PhaseEditor                                      | Task 3                               |
| §8 i18n FR/EN                                                                         | Task 2                               |
| §9 tests (normalizeDependency + scheduler typé/lag/clamp/cycle/mix)                   | Task 1 (Step 1)                      |
| §10 rétro-compat (normalize-on-read, factory inchangé, API inchangée)                 | Task 1 + Task 3 (normalisation)      |

Hors périmètre confirmé (§4) : flèches de lien (SP2), chemin critique (SP2), contraintes (SP3), nivellement (SP4), API publique typée, dépendances tâche.
