# Chemin critique + marges (SP2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calculer le chemin critique et la marge totale par phase (CPM niveau phase), et surligner les phases critiques (rouge) + afficher la marge dans la Ligne de temps.

**Architecture:** Nouvelle fonction pure `calculateCriticalPath(project)` qui réutilise l'ordonnanceur SP1 (passe avant) puis fait la passe arrière (late dates plafonnées à `totalWeeks`) → marge totale + flag critique. Le scheduler reste inchangé. Viz dans `TimelineView`.

**Tech Stack:** React 18 + Vite + tokens Prism, Vitest. Spec : `docs/superpowers/specs/2026-06-02-critical-path-design.md`.

**Convention :** un commit par tâche. Branche `feature/critical-path`, une seule PR.

---

## File Structure

| Fichier                              | Rôle                               | Action                                             |
| ------------------------------------ | ---------------------------------- | -------------------------------------------------- |
| `src/lib/criticalPath.js`            | CPM pur (chemin critique + marges) | Créer                                              |
| `src/__tests__/criticalPath.test.js` | Tests CPM                          | Créer                                              |
| `src/lib/i18n.jsx`                   | Traductions FR/EN                  | Modifier : libellés CPM                            |
| `src/components/TimelineView.jsx`    | Ligne de temps                     | Modifier : surbrillance critique + marge + légende |

---

## Task 1 : `calculateCriticalPath` + tests (TDD)

**Files:**

- Create: `src/lib/criticalPath.js`
- Test: `src/__tests__/criticalPath.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/__tests__/criticalPath.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
import { calculateCriticalPath } from '../lib/criticalPath';

function proj(phases) {
  return { phases };
}

describe('calculateCriticalPath', () => {
  it('FS chain → all critical, zero float', () => {
    const { byPhase } = calculateCriticalPath(
      proj([
        { id: 'a', durationWeeks: 2 },
        { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
        { id: 'c', durationWeeks: 4, dependencies: [{ id: 'b', type: 'FS', lag: 0 }] },
      ])
    );
    for (const id of ['a', 'b', 'c']) {
      expect(byPhase[id].critical).toBe(true);
      expect(byPhase[id].totalFloat).toBe(0);
    }
  });

  it('parallel branches: shorter branch has float, longer is critical', () => {
    const { totalWeeks, byPhase } = calculateCriticalPath(
      proj([
        { id: 'a', durationWeeks: 2 },
        { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
        { id: 'c', durationWeeks: 5, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
        {
          id: 'd',
          durationWeeks: 2,
          dependencies: [
            { id: 'b', type: 'FS', lag: 0 },
            { id: 'c', type: 'FS', lag: 0 },
          ],
        },
      ])
    );
    expect(totalWeeks).toBe(9);
    expect(byPhase.a.critical).toBe(true);
    expect(byPhase.c.critical).toBe(true);
    expect(byPhase.d.critical).toBe(true);
    expect(byPhase.b.critical).toBe(false);
    expect(byPhase.b.totalFloat).toBe(2); // 5 - 3
  });

  it('early dates match the scheduler', () => {
    const { byPhase } = calculateCriticalPath(
      proj([
        { id: 'a', durationWeeks: 2 },
        { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      ])
    );
    expect(byPhase.a.earlyStart).toBe(0);
    expect(byPhase.a.earlyEnd).toBe(2);
    expect(byPhase.b.earlyStart).toBe(2);
    expect(byPhase.b.earlyEnd).toBe(5);
  });

  it('SS predecessor that defines the makespan stays critical (lateEnd capped at totalWeeks)', () => {
    const { totalWeeks, byPhase } = calculateCriticalPath(
      proj([
        { id: 'a', durationWeeks: 4 },
        { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'SS', lag: 0 }] },
      ])
    );
    expect(totalWeeks).toBe(4);
    expect(byPhase.a.critical).toBe(true); // would be float 2 without the totalWeeks cap
    expect(byPhase.a.totalFloat).toBe(0);
    expect(byPhase.b.critical).toBe(false);
    expect(byPhase.b.totalFloat).toBe(2);
  });

  it('FF dependency: successor pinned to predecessor finish', () => {
    const { totalWeeks, byPhase } = calculateCriticalPath(
      proj([
        { id: 'a', durationWeeks: 6 },
        { id: 'b', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FF', lag: 0 }] },
      ])
    );
    expect(totalWeeks).toBe(6);
    expect(byPhase.b.earlyStart).toBe(4); // ends with a at week 6
    expect(byPhase.a.critical).toBe(true);
    expect(byPhase.b.critical).toBe(true);
  });

  it('lag on a non-critical branch reduces its float', () => {
    const { byPhase } = calculateCriticalPath(
      proj([
        { id: 'a', durationWeeks: 2 },
        { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 1 }] },
        { id: 'c', durationWeeks: 5, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
        {
          id: 'd',
          durationWeeks: 2,
          dependencies: [
            { id: 'b', type: 'FS', lag: 0 },
            { id: 'c', type: 'FS', lag: 0 },
          ],
        },
      ])
    );
    // b FS+1 on a → b:{3,6}; succ d.lateStart 7 → b.lateEnd 7, lateStart 4, float 4-3 = 1
    expect(byPhase.b.totalFloat).toBe(1);
  });

  it('cycle → all critical, zero float', () => {
    const { byPhase } = calculateCriticalPath(
      proj([
        { id: 'a', durationWeeks: 2, dependencies: [{ id: 'b', type: 'FS', lag: 0 }] },
        { id: 'b', durationWeeks: 3, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      ])
    );
    expect(byPhase.a.critical).toBe(true);
    expect(byPhase.b.critical).toBe(true);
    expect(byPhase.a.totalFloat).toBe(0);
  });

  it('no dependencies → all critical, zero float', () => {
    const { byPhase } = calculateCriticalPath(
      proj([
        { id: 'a', durationWeeks: 2 },
        { id: 'b', durationWeeks: 3 },
      ])
    );
    expect(byPhase.a.critical).toBe(true);
    expect(byPhase.b.critical).toBe(true);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/__tests__/criticalPath.test.js`
Expected: FAIL — module `../lib/criticalPath` introuvable.

- [ ] **Step 3 : Implémenter `calculateCriticalPath`**

Créer `src/lib/criticalPath.js` :

```javascript
/**
 * Chemin critique + marges (CPM au niveau phase) — pur, sans effet de bord (SP2).
 *
 * Réutilise l'ordonnanceur SP1 pour la passe avant (early start/finish), puis
 * fait une passe arrière (late start/finish) en inversant les contraintes
 * FS/SS/FF/SF + lag. `lateEnd` est plafonné à `totalWeeks` (aucune phase ne
 * finit après la fin du projet). Marge totale = late − early ; critique = marge ≤ 0.
 *
 * Dégradation : sur un cycle (l'ordonnanceur retombe en séquentiel) ou en
 * l'absence de dépendances, toutes les phases sont marquées critiques (marge 0).
 */
import { calculateProjectDurationWithDependencies, normalizeDependency } from './costCalculations';

/**
 * @param {object} project
 * @returns {{ totalWeeks: number, byPhase: Object<string,{earlyStart,earlyEnd,lateStart,lateEnd,totalFloat,critical}> }}
 */
export function calculateCriticalPath(project) {
  const phases = project.phases || [];
  const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies(project);
  const early = Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));
  const phaseMap = new Map(phases.map((p) => [p.id, p]));

  // Dépendances normalisées (prédécesseurs), filtrées aux phases existantes.
  const depsOf = (phase) =>
    (phase.dependencies || []).map(normalizeDependency).filter((d) => phaseMap.has(d.id));

  // Repli "tout critique" (chaîne séquentielle : cycle ou aucune dépendance).
  const allCritical = () => {
    const byPhase = {};
    for (const p of phases) {
      const e = early[p.id] || { startWeek: 0, endWeek: p.durationWeeks };
      byPhase[p.id] = {
        earlyStart: e.startWeek,
        earlyEnd: e.endWeek,
        lateStart: e.startWeek,
        lateEnd: e.endWeek,
        totalFloat: 0,
        critical: true,
      };
    }
    return { totalWeeks, byPhase };
  };

  const hasDependencies = phases.some((p) => depsOf(p).length > 0);
  if (!hasDependencies) return allCritical();

  // Détection de cycle locale (DFS trois couleurs sur ids normalisés).
  const visited = new Set();
  const visiting = new Set();
  let hasCycle = false;
  function detect(id) {
    if (visiting.has(id)) {
      hasCycle = true;
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const phase = phaseMap.get(id);
    if (phase) for (const dep of depsOf(phase)) detect(dep.id);
    visiting.delete(id);
    visited.add(id);
  }
  for (const p of phases) {
    detect(p.id);
    if (hasCycle) break;
  }
  if (hasCycle) return allCritical();

  // Adjacence inverse : successeurs par phase.
  const successors = new Map(phases.map((p) => [p.id, []]));
  for (const succ of phases) {
    for (const dep of depsOf(succ)) {
      successors.get(dep.id).push({ succId: succ.id, type: dep.type, lag: dep.lag });
    }
  }

  // Passe arrière mémoïsée. lateEnd plafonné à totalWeeks.
  const lateEndMap = new Map();
  function getLateEnd(id) {
    if (lateEndMap.has(id)) return lateEndMap.get(id);
    const phase = phaseMap.get(id);
    const d = phase.durationWeeks;
    let lateEnd = totalWeeks; // plafond projet
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
  }

  const byPhase = {};
  for (const p of phases) {
    const e = early[p.id];
    const lateEnd = getLateEnd(p.id);
    const lateStart = lateEnd - p.durationWeeks;
    const totalFloat = lateStart - e.startWeek;
    byPhase[p.id] = {
      earlyStart: e.startWeek,
      earlyEnd: e.endWeek,
      lateStart,
      lateEnd,
      totalFloat,
      critical: totalFloat <= 0,
    };
  }
  return { totalWeeks, byPhase };
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/__tests__/criticalPath.test.js`
Expected: PASS.
Run aussi : `npx vitest run src/` → PASS (non-régression).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/criticalPath.js src/__tests__/criticalPath.test.js
git commit -m "feat(scheduler): critical path + total float (CPM, phase level)"
```

---

## Task 2 : Traductions FR/EN

**Files:**

- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1 : Ajouter les clés FR**

Dans le bloc FR de `src/lib/i18n.jsx`, à côté des clés `timeline.*` existantes (chercher `'timeline.phase'` et ajouter juste après), ajouter :

```javascript
'cpm.criticalPath': 'Chemin critique',
'cpm.critical': 'Critique',
'cpm.float': 'Marge',
```

- [ ] **Step 2 : Ajouter les clés EN**

Dans le bloc EN, au même endroit relatif (après `'timeline.phase'`), ajouter :

```javascript
'cpm.criticalPath': 'Critical path',
'cpm.critical': 'Critical',
'cpm.float': 'Float',
```

> L'unité de semaine réutilise la clé existante `budget.weeksAbbr` (déjà utilisée dans `TimelineView`) — ne pas ajouter de clé d'unité.

- [ ] **Step 3 : Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/i18n.jsx
git commit -m "feat(i18n): critical path + float labels (FR/EN)"
```

---

## Task 3 : Surbrillance critique + marge dans `TimelineView`

**Files:**

- Modify: `src/components/TimelineView.jsx`

- [ ] **Step 1 : Importer le calcul CPM**

Dans `src/components/TimelineView.jsx`, ajouter l'import (après l'import depuis `'../lib/costCalculations'`) :

```javascript
import { calculateCriticalPath } from '../lib/criticalPath';
```

- [ ] **Step 2 : Calculer la map critique et l'attacher aux phases**

Juste après la ligne existante :

```javascript
const { totalWeeks, phaseSchedule } = calculateProjectDurationWithDependencies(project);
```

ajouter :

```javascript
const { byPhase: criticalByPhase } = calculateCriticalPath(project);
```

Puis dans le `project.phases.map((phase, index) => { ... })` qui construit `phasesWithOffsets`, ajouter `crit` à l'objet retourné. Remplacer :

```javascript
return { ...phase, offset, colorIndex: index % COLORS.length };
```

par :

```javascript
return { ...phase, offset, colorIndex: index % COLORS.length, crit: criticalByPhase[phase.id] };
```

- [ ] **Step 3 : Colorer les barres critiques + afficher la marge**

Dans le rendu `phasesWithOffsets.map((phase) => { ... })`, remplacer la barre `<div>` (celle avec `className={... ${COLORS[phase.colorIndex]} ...}` et `style={{ left, width }}`) ET ajouter le label de marge juste après. Remplacer ce bloc :

```jsx
<div
  className={`absolute top-0 h-full rounded-lg ${COLORS[phase.colorIndex]} opacity-90 flex items-center justify-center shadow-sm`}
  style={{ left: `${left}%`, width: `${width}%` }}
>
  <span className="text-white text-xs font-semibold truncate px-2">
    {phase.durationWeeks} {t('budget.weeksAbbr')}
  </span>
</div>
```

par :

```jsx
<div
  className={`absolute top-0 h-full rounded-lg ${phase.crit?.critical ? 'bg-red-600' : COLORS[phase.colorIndex]} opacity-90 flex items-center justify-center shadow-sm`}
  style={{ left: `${left}%`, width: `${width}%` }}
>
  <span className="text-white text-xs font-semibold truncate px-2">
    {phase.durationWeeks} {t('budget.weeksAbbr')}
  </span>
</div>;
{
  phase.crit && !phase.crit.critical && phase.crit.totalFloat > 0 && (
    <div
      className="absolute top-0 h-full flex items-center text-[10px] font-medium text-muted-foreground whitespace-nowrap"
      style={{ left: `${left + width}%`, paddingLeft: '4px' }}
    >
      +{phase.crit.totalFloat} {t('budget.weeksAbbr')}
    </div>
  );
}
```

- [ ] **Step 4 : Ajouter une légende**

Juste AVANT le bloc `{phasesWithOffsets.map((phase) => { ... })}` (le conteneur des lignes de phases), ajouter une légende :

```jsx
<div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
  <span className="flex items-center gap-1">
    <span className="inline-block w-3 h-3 rounded-sm bg-red-600" />
    {t('cpm.criticalPath')}
  </span>
  <span>
    +N {t('budget.weeksAbbr')} = {t('cpm.float')}
  </span>
</div>
```

(Lire le code autour des lignes ~100-104 pour trouver le conteneur juste avant le `.map` des phases, et y insérer la légende ; ne pas casser la structure existante.)

- [ ] **Step 5 : Vérifier build + lint**

Run: `npm run build`
Expected: build OK.
Run: `npm run lint`
Expected: aucune nouvelle erreur sur `TimelineView.jsx`.

- [ ] **Step 6 : Vérification manuelle (dev)**

Run: `npm run dev`
Vérifier :

1. Sur un projet avec dépendances de phase, les phases du chemin critique apparaissent en **rouge** dans la Ligne de temps.
2. Une phase non-critique affiche « +N sem » de marge après sa barre.
3. Une chaîne FS pure → toutes rouges ; une branche parallèle plus courte → marge affichée.
4. Légende visible.
5. Un projet sans dépendances → pas de plantage (tout rouge / marge 0).

- [ ] **Step 7 : Commit**

```bash
git add src/components/TimelineView.jsx
git commit -m "feat(scheduler): highlight critical path + float in TimelineView"
```

---

## Finalisation

- [ ] **Suite + lint**

Run: `npm run lint && npx vitest run`
Expected: tout vert (ignorer le flake serveur connu ; un re-run passe — cf. mémoire).

- [ ] **Pousser + PR**

```bash
git push -u origin feature/critical-path
gh pr create --base main --title "feat(scheduler): critical path + float (SP2)" --body "Voir docs/superpowers/specs/2026-06-02-critical-path-design.md. SP2 du moteur d'ordonnancement (niveau phase)."
```

---

## Self-Review (couverture spec → plan)

| Exigence spec                                                                                    | Tâche                                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| §5 `calculateCriticalPath` (passe avant via scheduler, passe arrière plafonnée, marge, critique) | Task 1 (Step 3)                                  |
| §5 dégradations (cycle / no-deps → tout critique)                                                | Task 1 (Step 3 `allCritical`) + tests            |
| §6 viz : barres critiques rouges + marge + légende                                               | Task 3                                           |
| §7 i18n FR/EN                                                                                    | Task 2                                           |
| §8 tests (FS chain, branches parallèles, SS cap, FF, lag, cycle, no-deps, early==scheduler)      | Task 1 (Step 1)                                  |
| §9 rétro-compat (scheduler + phaseSchedule inchangés)                                            | Task 1 (lib séparée, aucun consommateur modifié) |

Hors périmètre confirmé (§4) : flèches SVG (SP2b), marge libre, contraintes (SP3), nivellement (SP4).
