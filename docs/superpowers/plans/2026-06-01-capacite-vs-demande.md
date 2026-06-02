# Capacité vs Demande (heatmap de charge) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un sous-onglet « Charge » : une heatmap ressources × 12 mois affichant la capacité restante (`capacité − demande`) par cellule, codée couleur, en lecture seule.

**Architecture:** Front-only — un nouveau composant `CapacityLoadGrid` calcule le restant côté client à partir des endpoints existants (`/capacity/gantt` → ressources+assignations, `/capacity/availability` → overrides) via les helpers `getMonthlyCapacity` et `calculateUtilization`. La logique de couleur est centralisée dans un nouveau helper pur testable `capacityStatus`, réutilisé aussi par `UtilizationSummary` (DRY).

**Tech Stack:** React 18 + Vite + Tailwind/tokens Prism (frontend), Vitest (tests). Spec source : `docs/superpowers/specs/2026-06-01-capacite-vs-demande-design.md`.

**Convention :** chaque tâche se termine par un commit. Tout le plan vit sur la branche `feature/capacity-load-heatmap` et part en **une seule PR**.

---

## File Structure

| Fichier                                      | Rôle                        | Action                                                             |
| -------------------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| `src/lib/capacityCalculations.js`            | Helpers de calcul purs      | Modifier : ajouter `capacityStatus`                                |
| `src/__tests__/capacityCalculations.test.js` | Tests frontend              | Modifier : tests `capacityStatus`                                  |
| `src/components/UtilizationSummary.jsx`      | Ligne d'agrégat du Gantt    | Modifier : utiliser `capacityStatus` (DRY, comportement identique) |
| `src/lib/i18n.jsx`                           | Traductions FR/EN           | Modifier : clés de l'onglet Charge                                 |
| `src/components/CapacityLoadGrid.jsx`        | Heatmap capacité vs demande | Créer                                                              |
| `src/components/CapacityView.jsx`            | Conteneur à onglets         | Modifier : onglet « Charge »                                       |

---

## Task 1 : Helper `capacityStatus` + tests

**Files:**

- Modify: `src/lib/capacityCalculations.js`
- Test: `src/__tests__/capacityCalculations.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `src/__tests__/capacityCalculations.test.js`, ajouter `capacityStatus` à l'import existant depuis `'../lib/capacityCalculations'` (la ligne importe déjà `weekToMonth, getMonthRange, calculateUtilization, calculateTransitionCostImpact, getMonthlyCapacity` — ajouter `capacityStatus`). Puis APPENDER à la fin du fichier :

```javascript
describe('capacityStatus', () => {
  it('returns success well under capacity', () => {
    expect(capacityStatus(40, 100)).toBe('success');
    expect(capacityStatus(0, 100)).toBe('success');
  });

  it('returns warning in the 80-99% band (inclusive of 80)', () => {
    expect(capacityStatus(80, 100)).toBe('warning');
    expect(capacityStatus(99, 100)).toBe('warning');
  });

  it('returns error at or above 100% utilization', () => {
    expect(capacityStatus(100, 100)).toBe('error');
    expect(capacityStatus(120, 100)).toBe('error');
  });

  it('respects reduced capacity (part-time / vacation months)', () => {
    expect(capacityStatus(60, 50)).toBe('error'); // 120% util
    expect(capacityStatus(40, 50)).toBe('warning'); // 80% util
    expect(capacityStatus(30, 50)).toBe('success'); // 60% util
  });

  it('handles zero capacity', () => {
    expect(capacityStatus(10, 0)).toBe('error');
    expect(capacityStatus(0, 0)).toBe('success');
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/__tests__/capacityCalculations.test.js`
Expected: FAIL — `capacityStatus is not a function` / not exported.

- [ ] **Step 3 : Implémenter le helper**

Dans `src/lib/capacityCalculations.js`, après `getMonthlyCapacity` (ajouté au chantier A), ajouter :

```javascript
/**
 * Statut sémantique d'occupation d'une capacité, pour le code couleur.
 * Seuils alignés sur ceux historiques de UtilizationSummary (exprimés en
 * utilisation = demande / capacité).
 *
 * @param {number} demand    Somme des allocations (%).
 * @param {number} capacity  Capacité disponible (%).
 * @returns {'success'|'warning'|'error'}
 *   error   = surchargé (utilisation ≥ 100 %, ou demande > 0 quand capacité = 0)
 *   warning = proche de la limite (80–99 %)
 *   success = marge (< 80 %, ou aucune demande)
 */
export function capacityStatus(demand, capacity) {
  if (capacity <= 0) return demand > 0 ? 'error' : 'success';
  const util = (demand / capacity) * 100;
  if (util >= 100) return 'error';
  if (util >= 80) return 'warning';
  return 'success';
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/__tests__/capacityCalculations.test.js`
Expected: PASS (tous verts, aucune régression).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/capacityCalculations.js src/__tests__/capacityCalculations.test.js
git commit -m "feat(capacity): capacityStatus helper + tests"
```

---

## Task 2 : Refactor `UtilizationSummary` pour utiliser `capacityStatus` (DRY)

**Files:**

- Modify: `src/components/UtilizationSummary.jsx`

`UtilizationSummary` calcule aujourd'hui son token couleur en ligne :
`const token = pct >= 100 ? '--prism-error' : pct >= 80 ? '--prism-warning' : '--prism-success';`
On remplace par un appel au helper centralisé. Comportement visuel identique (mêmes seuils 80/100), hors différence d'arrondi sub-pourcent négligeable (le helper seuille sur l'utilisation brute, l'ancien code sur `pct` arrondi).

- [ ] **Step 1 : Étendre l'import**

Dans `src/components/UtilizationSummary.jsx`, ajouter `capacityStatus` à l'import depuis `'../lib/capacityCalculations'` (qui importe déjà `calculateUtilization, getMonthlyCapacity`) :

```javascript
import {
  calculateUtilization,
  getMonthlyCapacity,
  capacityStatus,
} from '../lib/capacityCalculations';
```

- [ ] **Step 2 : Remplacer le calcul du token**

Localiser la ligne (dans le `months.map(...)`) :

```javascript
const token = pct >= 100 ? '--prism-error' : pct >= 80 ? '--prism-warning' : '--prism-success';
```

et la remplacer par :

```javascript
const token = `--prism-${capacityStatus(totalAllocation, totalCapacity)}`;
```

(Les variables `totalAllocation` et `totalCapacity` existent déjà juste au-dessus dans le même bloc ; `pct` reste utilisé pour l'affichage du nombre — ne pas le supprimer.)

- [ ] **Step 3 : Vérifier le build + tests**

Run: `npm run build`
Expected: build OK.
Run: `npx vitest run`
Expected: PASS (la ligne d'agrégat se colore comme avant).

- [ ] **Step 4 : Commit**

```bash
git add src/components/UtilizationSummary.jsx
git commit -m "refactor(capacity): UtilizationSummary uses shared capacityStatus"
```

---

## Task 3 : Traductions FR/EN

**Files:**

- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1 : Ajouter les clés FR**

Dans le bloc FR de `src/lib/i18n.jsx`, à côté des clés `capacity.*` existantes (après `'capacity.baseCapacity': 'Capacité de base',` ajouté au chantier A), ajouter :

```javascript
'capacity.load': 'Charge',
'capacity.loadTitle': 'Capacité vs demande',
'capacity.loadHint': 'Capacité restante par ressource et par mois (capacité − demande). Rouge = surcharge.',
'capacity.remaining': 'Restant',
'capacity.demand': 'Demande',
'capacity.poolTotal': 'Pool',
```

- [ ] **Step 2 : Ajouter les clés EN**

Dans le bloc EN, au même endroit relatif (après `'capacity.baseCapacity': 'Base capacity',`), ajouter :

```javascript
'capacity.load': 'Load',
'capacity.loadTitle': 'Capacity vs demand',
'capacity.loadHint': 'Remaining capacity per resource per month (capacity − demand). Red = over-allocated.',
'capacity.remaining': 'Remaining',
'capacity.demand': 'Demand',
'capacity.poolTotal': 'Pool',
```

- [ ] **Step 3 : Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/i18n.jsx
git commit -m "feat(i18n): capacity Load tab labels (FR/EN)"
```

---

## Task 4 : Composant `CapacityLoadGrid`

**Files:**

- Create: `src/components/CapacityLoadGrid.jsx`

Le composant charge ressources/assignations (via `getGanttData`) et overrides (via `getAvailability`), puis rend une heatmap ressources × 12 mois ; chaque cellule = capacité restante signée, colorée via `capacityStatus`, plus une ligne « Pool » de total. Réutilise la clé i18n `capacity.title` (= « Capacité »/« Capacity », existante) pour le libellé « Capacité » du tooltip.

- [ ] **Step 1 : Créer le composant**

Créer `src/components/CapacityLoadGrid.jsx` avec EXACTEMENT ce contenu :

```jsx
/**
 * CapacityLoadGrid — heatmap capacité vs demande (chantier B).
 *
 * Grille ressources (lignes) × 12 mois (colonnes). Chaque cellule montre la
 * capacité RESTANTE du mois (capacité − demande), codée couleur via
 * capacityStatus (vert = marge, ambre = proche, rouge = surcharge). Une ligne
 * « Pool » agrège le restant de tout le pool. Lecture seule.
 *
 * Front-only : la demande vient des assignations cross-projets (/capacity/gantt),
 * la capacité de resources.max_capacity + overrides (/capacity/availability).
 */
import { useEffect, useState, useMemo } from 'react';
import { capacityApi } from '../lib/capacityApi';
import {
  getMonthRange,
  addMonths,
  calculateUtilization,
  getMonthlyCapacity,
  capacityStatus,
} from '../lib/capacityCalculations';
import { useLocale } from '../lib/i18n';

/** Mois courant au format YYYY-MM (fenêtre glissante de 12 mois, comme le Gantt). */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const CapacityLoadGrid = () => {
  const { t } = useLocale();
  const [resources, setResources] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [overrides, setOverrides] = useState([]);

  const startMonth = useMemo(() => currentMonth(), []);
  const endMonth = useMemo(() => addMonths(startMonth, 11), [startMonth]);
  const months = useMemo(() => getMonthRange(startMonth, endMonth), [startMonth, endMonth]);

  useEffect(() => {
    capacityApi
      .getGanttData(startMonth, endMonth)
      .then((d) => {
        setResources(Array.isArray(d?.resources) ? d.resources : []);
        setAssignments(Array.isArray(d?.assignments) ? d.assignments : []);
      })
      .catch(() => {});
    capacityApi
      .getAvailability()
      .then((d) => setOverrides(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [startMonth, endMonth]);

  /** Rend une cellule colorée à partir de la capacité et de la demande du mois. */
  const renderCell = (capacity, demand, ariaBase) => {
    const remaining = capacity - demand;
    const token = `--prism-${capacityStatus(demand, capacity)}`;
    const title = `${t('capacity.title')} ${capacity}% · ${t('capacity.demand')} ${demand}% · ${t('capacity.remaining')} ${remaining}%`;
    return (
      <div
        title={title}
        aria-label={`${ariaBase} — ${title}`}
        className="rounded-md text-xs font-semibold flex items-center justify-center min-h-[28px] font-mono tabular-nums"
        style={{
          backgroundColor: `color-mix(in srgb, var(${token}) 15%, transparent)`,
          color: `var(${token})`,
        }}
      >
        {remaining > 0 ? `+${remaining}` : remaining}
      </div>
    );
  };

  if (resources.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border border-border rounded-lg p-6 bg-card">
        {t('capacity.loadHint')}
      </div>
    );
  }

  const gridCols = `minmax(140px, 1.4fr) repeat(${months.length}, minmax(56px, 1fr))`;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {t('capacity.loadTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('capacity.loadHint')}</p>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <div style={{ display: 'grid', gridTemplateColumns: gridCols }} className="min-w-max">
          {/* En-tête */}
          <div className="sticky left-0 bg-card z-10 border-b border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            {t('capacity.remaining')}
          </div>
          {months.map((m) => (
            <div
              key={m}
              className="border-b border-border px-1 py-2 text-center text-xs font-medium text-muted-foreground font-mono tabular-nums"
            >
              {m.slice(2)}
            </div>
          ))}

          {/* Lignes ressources */}
          {resources.map((r) => {
            const base = r.max_capacity ?? 100;
            return (
              <div key={r.id} className="contents">
                <div className="sticky left-0 bg-card z-10 border-b border-r border-border px-3 py-2 text-sm truncate">
                  {r.name}
                </div>
                {months.map((m) => {
                  const capacity = getMonthlyCapacity(r.id, m, overrides, base);
                  const demand = calculateUtilization(assignments, r.id, m);
                  return (
                    <div key={m} className="border-b border-border p-0.5">
                      {renderCell(capacity, demand, `${r.name} ${m}`)}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Ligne Pool (total) */}
          <div className="contents">
            <div className="sticky left-0 bg-card z-10 border-r border-border px-3 py-2 text-sm font-semibold">
              {t('capacity.poolTotal')}
            </div>
            {months.map((m) => {
              const totalCap = resources.reduce(
                (s, r) => s + getMonthlyCapacity(r.id, m, overrides, r.max_capacity ?? 100),
                0
              );
              const totalDem = resources.reduce(
                (s, r) => s + calculateUtilization(assignments, r.id, m),
                0
              );
              return (
                <div key={m} className="p-0.5">
                  {renderCell(totalCap, totalDem, `${t('capacity.poolTotal')} ${m}`)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapacityLoadGrid;
```

- [ ] **Step 2 : Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3 : Commit**

```bash
git add src/components/CapacityLoadGrid.jsx
git commit -m "feat(capacity): CapacityLoadGrid capacity-vs-demand heatmap"
```

---

## Task 5 : Brancher l'onglet « Charge » dans `CapacityView`

**Files:**

- Modify: `src/components/CapacityView.jsx`

- [ ] **Step 1 : Importer le composant et l'icône**

En tête de `src/components/CapacityView.jsx` :

- Ajouter : `import CapacityLoadGrid from './CapacityLoadGrid';`
- Ajouter `Gauge` à l'import existant depuis `lucide-react` (la ligne qui importe déjà `Users, BarChart3, CalendarClock, ArrowLeftRight, Settings, …`).

- [ ] **Step 2 : Ajouter l'onglet dans le tableau `TABS`**

Insérer l'entrée « Charge » entre `availability` et `transitions` :

```javascript
const TABS = [
  { id: 'resources', icon: Users, label: t('capacity.resources') },
  { id: 'gantt', icon: BarChart3, label: t('capacity.gantt') },
  { id: 'availability', icon: CalendarClock, label: t('capacity.availability') },
  { id: 'load', icon: Gauge, label: t('capacity.load') },
  { id: 'transitions', icon: ArrowLeftRight, label: t('capacity.transitions') },
  { id: 'rates', icon: Settings, label: t('tab.rates') },
];
```

NOTE : préserver les entrées existantes telles quelles ; n'INSÉRER que `{ id: 'load', icon: Gauge, label: t('capacity.load') }` entre `availability` et `transitions`. Si les icônes/labels existants diffèrent, ne pas les réécrire.

- [ ] **Step 3 : Rendre le contenu de l'onglet**

Dans la section « Tab content », après le bloc `{activeTab === 'availability' && ( <AvailabilityGrid /> )}`, ajouter :

```javascript
{
  activeTab === 'load' && <CapacityLoadGrid />;
}
```

- [ ] **Step 4 : Vérifier le build + lint**

Run: `npm run build`
Expected: build OK.
Run: `npm run lint`
Expected: aucune nouvelle erreur sur `CapacityView.jsx`.

- [ ] **Step 5 : Vérification manuelle (dev)**

Run: `npm run dev` (+ `node server/index.js` si besoin).
Vérifier :

1. Onglet « Charge » visible entre Disponibilité et Transitions.
2. Grille ressources × 12 mois ; cellules colorées (vert/ambre/rouge) avec le restant signé.
3. Une ressource allouée au-delà de sa dispo (ex. 60 % un mois où sa dispo = 50 %, réglée dans l'onglet Disponibilité) apparaît **rouge** avec `-10`.
4. Une ressource sans assignation montre son restant = capacité pleine (vert).
5. La ligne « Pool » agrège le restant par mois. Le tooltip (survol) montre Capacité / Demande / Restant.

- [ ] **Step 6 : Commit**

```bash
git add src/components/CapacityView.jsx
git commit -m "feat(capacity): add Load (capacity vs demand) sub-tab"
```

---

## Finalisation

- [ ] **Suite + lint**

Run: `npm run lint && npx vitest run`
Expected: tout vert (ignorer le flake connu `executionSyncFromPlan` / autres tests serveur non-déterministes ; un re-run passe).

- [ ] **Pousser + PR**

```bash
git push -u origin feature/capacity-load-heatmap
gh pr create --base main --title "feat(capacity): capacity-vs-demand heatmap (chantier B)" --body "Voir docs/superpowers/specs/2026-06-01-capacite-vs-demande-design.md. Chantier B du diagnostic de parité MS Project."
```

---

## Self-Review (couverture spec → plan)

| Exigence spec                                                                        | Tâche                            |
| ------------------------------------------------------------------------------------ | -------------------------------- |
| §3 D8 / §7 helper `capacityStatus` + tests                                           | Task 1                           |
| §7 refactor `UtilizationSummary` (DRY)                                               | Task 2                           |
| §8 i18n FR/EN                                                                        | Task 3                           |
| §5 flux de données (getGanttData + getAvailability, calcul restant)                  | Task 4                           |
| §6 composant heatmap (cellule signée, couleur, tooltip, aria, ligne Pool, état vide) | Task 4                           |
| §3 D5 toutes ressources / D6 fenêtre 12 mois / D7 ligne Pool                         | Task 4                           |
| §9 sous-onglet « Charge » entre Disponibilité et Transitions                         | Task 5                           |
| §10 tests `capacityStatus` ; UI via build+manuel                                     | Task 1, Task 5                   |
| §11 rétro-compat (purement additif, refactor sans régression)                        | Task 2 (no-op visuel), Tasks 4-5 |

Hors périmètre confirmé (§4/§12) : décomposition par projet, drill-down, groupement/filtre/tri, édition depuis la vue.
