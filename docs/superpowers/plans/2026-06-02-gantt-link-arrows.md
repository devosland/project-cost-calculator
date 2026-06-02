# Flèches de lien Gantt (SP2b) — Plan

> Subagent-driven. Spec : `docs/superpowers/specs/2026-06-02-gantt-link-arrows-design.md`. Branche `feature/gantt-link-arrows`.

**Goal:** Overlay SVG (basé sur la mesure du DOM) reliant les barres de `TimelineView` du prédécesseur au successeur, coloré selon le chemin critique. Helper pur `getDependencyLinks(project)` + composant `DependencyArrows` + intégration `TimelineView`.

---

## Task 1 : `getDependencyLinks` + tests (TDD)

**Files:** Create `src/lib/dependencyLinks.js` ; Create `src/__tests__/dependencyLinks.test.js`.

### Step 1 — `src/__tests__/dependencyLinks.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
import { getDependencyLinks } from '../lib/dependencyLinks';

describe('getDependencyLinks', () => {
  it('builds one link per dependency (fromId=pred, toId=succ, type)', () => {
    const links = getDependencyLinks({
      phases: [
        { id: 'a', name: 'A', durationWeeks: 2 },
        { id: 'b', name: 'B', durationWeeks: 2, dependencies: [{ id: 'a', type: 'FS', lag: 0 }] },
      ],
    });
    expect(links).toHaveLength(1);
    expect(links[0].fromId).toBe('a');
    expect(links[0].toId).toBe('b');
    expect(links[0].type).toBe('FS');
  });

  it('normalizes string-form dependencies to type FS', () => {
    const links = getDependencyLinks({
      phases: [
        { id: 'a', name: 'A', durationWeeks: 2 },
        { id: 'b', name: 'B', durationWeeks: 2, dependencies: ['a'] },
      ],
    });
    expect(links).toHaveLength(1);
    expect(links[0].type).toBe('FS');
  });

  it('marks a link critical only when both endpoints are critical', () => {
    const links = getDependencyLinks({
      phases: [
        { id: 'long', name: 'Long', durationWeeks: 4 },
        { id: 'short', name: 'Short', durationWeeks: 1 },
        {
          id: 'end',
          name: 'End',
          durationWeeks: 1,
          dependencies: [
            { id: 'long', type: 'FS', lag: 0 },
            { id: 'short', type: 'FS', lag: 0 },
          ],
        },
      ],
    });
    const longLink = links.find((l) => l.fromId === 'long');
    const shortLink = links.find((l) => l.fromId === 'short');
    expect(longLink.critical).toBe(true); // long + end sont sur le chemin critique
    expect(shortLink.critical).toBe(false); // short a de la marge
  });

  it('returns [] when there are no dependencies', () => {
    const links = getDependencyLinks({
      phases: [
        { id: 'a', name: 'A', durationWeeks: 2 },
        { id: 'b', name: 'B', durationWeeks: 2 },
      ],
    });
    expect(links).toEqual([]);
  });
});
```

### Step 2 — Run, expect FAIL: `npx vitest run src/__tests__/dependencyLinks.test.js`

### Step 3 — `src/lib/dependencyLinks.js` :

```javascript
/**
 * Liens de dépendance pour l'overlay Gantt (SP2b) — pur, sans effet de bord.
 *
 * Produit la liste des arcs prédécesseur→successeur à dessiner dans la
 * TimelineView, avec un drapeau `critical` (les deux extrémités sont sur le
 * chemin critique, SP2). Tolère les dépendances en forme chaîne ou objet via
 * normalizeDependency, et ignore les dépendances pendantes (cible inconnue).
 */
import { calculateCriticalPath } from './criticalPath';
import { normalizeDependency } from './costCalculations';

/**
 * @param {object} project
 * @returns {Array<{ fromId: string, toId: string, type: string, critical: boolean }>}
 */
export function getDependencyLinks(project) {
  const phases = project.phases || [];
  const { byPhase } = calculateCriticalPath(project);
  const ids = new Set(phases.map((p) => p.id));
  const links = [];
  for (const phase of phases) {
    for (const dep of phase.dependencies || []) {
      const { id: fromId, type } = normalizeDependency(dep);
      if (!ids.has(fromId)) continue; // dépendance pendante → ignorée
      const fromCritical = byPhase[fromId]?.critical;
      const toCritical = byPhase[phase.id]?.critical;
      links.push({
        fromId,
        toId: phase.id,
        type,
        critical: Boolean(fromCritical && toCritical),
      });
    }
  }
  return links;
}
```

(Confirmer les exports : `npx rg "export function calculateCriticalPath" src/lib/criticalPath.js` et `npx rg "export function normalizeDependency|export const normalizeDependency" src/lib/costCalculations.js`. `normalizeDependency(dep)` renvoie `{ id, type, lag }`.)

### Step 4 — Run PASS: `npx vitest run src/__tests__/dependencyLinks.test.js` ; puis `npx vitest run src/` PASS.

### Step 5 — Commit: `git add src/lib/dependencyLinks.js src/__tests__/dependencyLinks.test.js && git commit -m "feat(timeline): dependency link model for Gantt arrows"`

---

## Task 2 : Composant `DependencyArrows` + intégration `TimelineView`

**Files:** Create `src/components/DependencyArrows.jsx` ; Modify `src/components/TimelineView.jsx`.

### Step 1 — `src/components/DependencyArrows.jsx` :

```jsx
/**
 * DependencyArrows — overlay SVG des dépendances entre barres de la TimelineView (SP2b).
 *
 * Approche par mesure du DOM (robuste à la mise en page responsive) : lit la
 * position rendue de chaque barre via getBoundingClientRect (relative au
 * conteneur) et trace une courbe de Bézier du bord droit du prédécesseur vers
 * le bord gauche du successeur, avec une tête de flèche. Recalcule au montage
 * et au redimensionnement du conteneur. Purement visuel ; pointer-events-none ;
 * ne casse pas si une mesure manque (ex. jsdom → rects à 0).
 *
 * @param {object} props
 * @param {Array<{fromId,toId,type,critical}>} props.links - liens à tracer (getDependencyLinks).
 * @param {{current: Map<string, Element>}} props.barRefs   - refs des barres indexées par phase.id.
 * @param {{current: Element|null}} props.containerRef       - conteneur positionné (origine des coordonnées).
 */
import { useLayoutEffect, useState, useCallback } from 'react';

const DependencyArrows = ({ links, barRefs, containerRef }) => {
  const [paths, setPaths] = useState([]);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const c = container.getBoundingClientRect();
    const next = [];
    for (const link of links) {
      const fromEl = barRefs.current.get(link.fromId);
      const toEl = barRefs.current.get(link.toId);
      if (!fromEl || !toEl) continue;
      const f = fromEl.getBoundingClientRect();
      const tg = toEl.getBoundingClientRect();
      const x1 = f.right - c.left;
      const y1 = f.top - c.top + f.height / 2;
      const x2 = tg.left - c.left;
      const y2 = tg.top - c.top + tg.height / 2;
      // Poignées de Bézier proportionnelles à l'écart horizontal, bornées.
      const dx = Math.max(20, Math.abs(x2 - x1) / 2);
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      next.push({ key: `${link.fromId}->${link.toId}`, d, critical: link.critical });
    }
    setPaths(next);
  }, [links, barRefs, containerRef]);

  useLayoutEffect(() => {
    recompute();
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    return () => ro.disconnect();
  }, [recompute]);

  if (paths.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none text-muted-foreground"
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="dep-arrow-crit"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="var(--prism-error)" />
        </marker>
        <marker
          id="dep-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="3"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L6,3 L0,6 Z" fill="currentColor" />
        </marker>
      </defs>
      {paths.map((p) => (
        <path
          key={p.key}
          d={p.d}
          fill="none"
          stroke={p.critical ? 'var(--prism-error)' : 'currentColor'}
          strokeWidth="1.5"
          strokeOpacity="0.7"
          markerEnd={`url(#${p.critical ? 'dep-arrow-crit' : 'dep-arrow'})`}
        />
      ))}
    </svg>
  );
};

export default DependencyArrows;
```

### Step 2 — `src/components/TimelineView.jsx`. Modifications :

(a) Ligne d'import React — remplacer `import React from 'react';` par :

```jsx
import React, { useRef, useMemo } from 'react';
```

(b) Après l'import de `useLocale` (ligne ~21), ajouter :

```jsx
import DependencyArrows from './DependencyArrows';
import { getDependencyLinks } from '../lib/dependencyLinks';
```

(c) Dans le corps du composant, juste après `const { byPhase: criticalByPhase } = calculateCriticalPath(project);` (ligne ~45), ajouter (AVANT le `if (totalWeeks === 0)`) :

```jsx
const barRefs = useRef(new Map());
const containerRef = useRef(null);
// useMemo: liens stables entre rendus → évite une boucle useLayoutEffect/setState.
const links = useMemo(() => getDependencyLinks(project), [project]);
```

(d) Envelopper la liste des barres de phase. Le bloc `{phasesWithOffsets.map((phase) => { ... })}` (≈ lignes 116-175) est un enfant direct de `<div className="space-y-3">`. L'envelopper ainsi :

```jsx
<div ref={containerRef} className="relative space-y-3">
  <DependencyArrows links={links} barRefs={barRefs} containerRef={containerRef} />
  {phasesWithOffsets.map((phase) => {
    /* ... corps inchangé ... */
  })}
</div>
```

(e) Sur la barre colorée de chaque phase (le `div` avec `className={...absolute top-0 h-full rounded-lg...}` et `style={{ left, width }}`, ≈ lignes 138-145), ajouter un `ref` callback enregistrant l'élément :

```jsx
                    <div
                      ref={(el) => {
                        const m = barRefs.current;
                        if (el) m.set(phase.id, el);
                        else m.delete(phase.id);
                      }}
                      className={`absolute top-0 h-full rounded-lg ${phase.crit?.critical ? 'bg-red-600' : COLORS[phase.colorIndex]} opacity-90 flex items-center justify-center shadow-sm`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
```

(Lire `TimelineView.jsx` pour appliquer ces 5 modifications au bon endroit ; ne PAS toucher au tableau de coûts ni aux jalons.)

### Step 3 — `npm run build` + `npm run lint` + `npx vitest run src/` → OK / pas de nouvelle erreur. (Le composant rend `null` en jsdom : rects à 0 → aucun path ; non-régression des 8 fichiers de tests.)

### Step 4 — Commit: `git add src/components/DependencyArrows.jsx src/components/TimelineView.jsx && git commit -m "feat(timeline): SVG dependency arrows overlay (measurement-based)"`

---

## Finalisation : `npm run lint && npx vitest run` (ignorer flake serveur) ; push + PR base main (note flake + case « vérif visuelle manuelle »).
