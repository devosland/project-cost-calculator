# Disponibilité time-phasée des ressources — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre une disponibilité en pourcentage variable par mois et par ressource (congés, temps partiel, ramp-up), et faire en sorte que la détection de surcharge la respecte au lieu d'un seuil constant de 100.

**Architecture:** Nouvelle table normalisée `resource_availability` qui ne stocke que les overrides (≠ capacité de base `resources.max_capacity`). Deux endpoints (`GET`/`PUT /api/capacity/availability`), un helper pur `getMonthlyCapacity`, une grille d'édition (nouveau sous-onglet « Disponibilité »), et l'intégration dans `UtilizationSummary` (seul point existant qui compare charge vs capacité).

**Tech Stack:** Express + better-sqlite3 (backend), React 18 + Vite + Tailwind/tokens Prism (frontend), Vitest (tests). Spec source : `docs/superpowers/specs/2026-06-01-capacite-time-phasee-design.md`.

**Convention de commit :** chaque tâche se termine par un commit. Tout le plan vit sur la branche `feature/capacity-time-phased-availability` et part en **une seule PR**.

---

## File Structure

| Fichier                                      | Rôle                               | Action                                                              |
| -------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `server/db.js`                               | Schéma + helpers DB                | Modifier : table `resource_availability`, index, 3 helpers, exports |
| `server/__tests__/setup.js`                  | Schéma DB de test (copie)          | Modifier : ajouter la table (sinon tests cassés)                    |
| `server/__tests__/capacity.test.js`          | Tests backend                      | Modifier : tests schéma + contraintes + upsert                      |
| `server/capacity.js`                         | Routes API capacité                | Modifier : routes `GET`/`PUT /availability`                         |
| `src/lib/capacityCalculations.js`            | Helpers de calcul purs             | Modifier : `getMonthlyCapacity`                                     |
| `src/__tests__/capacityCalculations.test.js` | Tests frontend                     | Modifier : tests `getMonthlyCapacity` + surcharge                   |
| `src/lib/capacityApi.js`                     | Client API                         | Modifier : `getAvailability`, `saveAvailability`                    |
| `src/lib/i18n.jsx`                           | Traductions FR/EN                  | Modifier : libellés onglet + grille                                 |
| `src/components/AvailabilityGrid.jsx`        | Grille d'édition                   | Créer                                                               |
| `src/components/CapacityView.jsx`            | Conteneur à onglets                | Modifier : onglet « Disponibilité »                                 |
| `src/components/UtilizationSummary.jsx`      | Ligne d'agrégat surcharge          | Modifier : capacité time-phasée                                     |
| `src/components/CapacityGantt.jsx`           | Gantt (héberge UtilizationSummary) | Modifier : charger + passer `availability`                          |

---

## Task 1 : Table `resource_availability` + helpers DB

**Files:**

- Modify: `server/db.js` (bloc de création de tables ~ligne 153 ; index ~ligne 377 ; helpers ~ligne 962)
- Modify: `server/__tests__/setup.js` (`seedSchema`, après le bloc `resource_assignments`)
- Test: `server/__tests__/capacity.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Ajouter ce bloc à la fin de `server/__tests__/capacity.test.js` :

```javascript
describe('resource_availability table', () => {
  function makeResource(email, name = 'Marie') {
    const user = seedUser(db, { email });
    const r = db
      .prepare('INSERT INTO resources (user_id, name, role, level) VALUES (?, ?, ?, ?)')
      .run(user.id, name, 'Developer', 'Senior');
    return { userId: user.id, resourceId: Number(r.lastInsertRowid) };
  }

  it('stores a monthly availability override', () => {
    const { resourceId } = makeResource('avail1@test.com');
    db.prepare(
      'INSERT INTO resource_availability (resource_id, month, available_pct) VALUES (?, ?, ?)'
    ).run(resourceId, '2026-03', 50);
    const row = db
      .prepare('SELECT * FROM resource_availability WHERE resource_id = ? AND month = ?')
      .get(resourceId, '2026-03');
    expect(row.available_pct).toBe(50);
  });

  it('enforces UNIQUE(resource_id, month)', () => {
    const { resourceId } = makeResource('avail2@test.com');
    const stmt = db.prepare(
      'INSERT INTO resource_availability (resource_id, month, available_pct) VALUES (?, ?, ?)'
    );
    stmt.run(resourceId, '2026-04', 80);
    expect(() => stmt.run(resourceId, '2026-04', 60)).toThrow();
  });

  it('upserts via ON CONFLICT(resource_id, month)', () => {
    const { resourceId } = makeResource('avail3@test.com');
    const upsert = db.prepare(`
      INSERT INTO resource_availability (resource_id, month, available_pct, created_at, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(resource_id, month) DO UPDATE SET
        available_pct = excluded.available_pct,
        updated_at = CURRENT_TIMESTAMP
    `);
    upsert.run(resourceId, '2026-05', 50);
    upsert.run(resourceId, '2026-05', 70);
    const row = db
      .prepare('SELECT * FROM resource_availability WHERE resource_id = ? AND month = ?')
      .get(resourceId, '2026-05');
    expect(row.available_pct).toBe(70);
  });

  it('cascades delete when the resource is removed', () => {
    const { resourceId } = makeResource('avail4@test.com');
    db.prepare(
      'INSERT INTO resource_availability (resource_id, month, available_pct) VALUES (?, ?, ?)'
    ).run(resourceId, '2026-06', 0);
    db.prepare('DELETE FROM resources WHERE id = ?').run(resourceId);
    const row = db
      .prepare('SELECT * FROM resource_availability WHERE resource_id = ?')
      .get(resourceId);
    expect(row).toBeUndefined();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `cd server && npx vitest run __tests__/capacity.test.js`
Expected: FAIL — `SqliteError: no such table: resource_availability`

- [ ] **Step 3 : Ajouter la table au schéma de test**

Dans `server/__tests__/setup.js`, juste après le bloc `CREATE TABLE IF NOT EXISTS resource_assignments (...)`, insérer :

```javascript
db.exec(`
    CREATE TABLE IF NOT EXISTS resource_availability (
      id INTEGER PRIMARY KEY,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      available_pct INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(resource_id, month)
    )
  `);
```

> Note : la suppression en cascade dépend des foreign keys. `createTestDb` active déjà `PRAGMA foreign_keys = ON` (vérifier dans `setup.js` ; si absent, ajouter `db.pragma('foreign_keys = ON')` après l'ouverture). Le test « cascades delete » échouera sinon.

- [ ] **Step 4 : Ajouter la table au schéma de prod**

Dans `server/db.js`, juste après le bloc `CREATE TABLE IF NOT EXISTS resource_assignments (...)` (vers la ligne 153), ajouter :

```javascript
db.exec(`
  CREATE TABLE IF NOT EXISTS resource_availability (
    id INTEGER PRIMARY KEY,
    resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    available_pct INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource_id, month)
  )
`);
```

Et près des autres `CREATE INDEX` (vers la ligne 377), ajouter :

```javascript
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_availability_resource_month ON resource_availability(resource_id, month)`
);
```

- [ ] **Step 5 : Ajouter les helpers DB + exports**

Dans `server/db.js`, après `deleteAssignment` (~ligne 962), ajouter :

```javascript
/**
 * Returns all availability overrides for a user's resource pool.
 * Joined through resources so we only return rows the caller owns.
 * @param {number} userId
 * @returns {Array<{ id, resource_id, month, available_pct }>}
 */
function getAvailabilityByUser(userId) {
  return db
    .prepare(
      `SELECT av.id, av.resource_id, av.month, av.available_pct
       FROM resource_availability av
       JOIN resources r ON r.id = av.resource_id
       WHERE r.user_id = ?
       ORDER BY av.resource_id, av.month`
    )
    .all(userId);
}

/**
 * Insert or update a single monthly availability override.
 * @param {number} resourceId
 * @param {string} month         'YYYY-MM'
 * @param {number} availablePct  0..100 (absolute %)
 */
function upsertAvailability(resourceId, month, availablePct) {
  return db
    .prepare(
      `INSERT INTO resource_availability (resource_id, month, available_pct, created_at, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(resource_id, month) DO UPDATE SET
         available_pct = excluded.available_pct,
         updated_at = CURRENT_TIMESTAMP`
    )
    .run(resourceId, month, availablePct);
}

/**
 * Remove a monthly override (used when the value reverts to base capacity).
 * @param {number} resourceId
 * @param {string} month  'YYYY-MM'
 */
function deleteAvailability(resourceId, month) {
  return db
    .prepare('DELETE FROM resource_availability WHERE resource_id = ? AND month = ?')
    .run(resourceId, month);
}
```

Puis ajouter les trois noms à la liste `export { ... }` de `server/db.js` (à côté de `createAssignment`, `updateAssignment`, etc.) :

```javascript
  getAvailabilityByUser,
  upsertAvailability,
  deleteAvailability,
```

- [ ] **Step 6 : Lancer les tests pour vérifier le succès**

Run: `cd server && npx vitest run __tests__/capacity.test.js`
Expected: PASS (tous les `resource_availability` tests verts, aucun régression)

- [ ] **Step 7 : Commit**

```bash
git add server/db.js server/__tests__/setup.js server/__tests__/capacity.test.js
git commit -m "feat(capacity): resource_availability table + DB helpers"
```

---

## Task 2 : Routes API `GET`/`PUT /api/capacity/availability`

**Files:**

- Modify: `server/capacity.js` (imports en tête ; nouvelles routes après les routes `assignments`, ~ligne 400)

- [ ] **Step 1 : Étendre les imports depuis `./db.js`**

Dans `server/capacity.js`, ajouter à l'objet d'import depuis `./db.js` (qui contient déjà `getResourceById`, `createAssignment`, …) :

```javascript
  getAvailabilityByUser,
  upsertAvailability,
  deleteAvailability,
```

- [ ] **Step 2 : Ajouter la route GET**

Après le bloc des routes `assignments` (avant les routes `transitions`, ~ligne 400), insérer :

```javascript
// --- Availability (time-phased monthly capacity overrides) ---

/**
 * GET /api/capacity/availability
 * Returns every monthly availability override in the caller's resource pool.
 * A missing row means "use the resource's base max_capacity for that month".
 */
router.get('/availability', (req, res) => {
  try {
    res.json(getAvailabilityByUser(req.user.id));
  } catch (err) {
    console.error('List availability error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 3 : Ajouter la route PUT (upsert en lot, suppression si == base)**

Juste après la route GET :

```javascript
/**
 * PUT /api/capacity/availability
 * Bulk upsert of monthly overrides. Body: [{ resource_id, month, available_pct }].
 * If available_pct equals the resource's base max_capacity, the override row is
 * DELETED instead of stored — the table only ever holds non-redundant data.
 * Validation is manual (mirrors the rest of this file; no Zod here).
 */
router.put('/availability', (req, res) => {
  try {
    const entries = req.body;
    if (!Array.isArray(entries)) {
      return res
        .status(400)
        .json({ error: 'Request body must be an array of { resource_id, month, available_pct }' });
    }

    // Validate every entry up-front (ownership + shape) before mutating anything.
    for (const e of entries) {
      if (!e.resource_id || !e.month || e.available_pct == null) {
        return res
          .status(400)
          .json({ error: 'Each entry requires resource_id, month, and available_pct' });
      }
      if (!/^\d{4}-\d{2}$/.test(e.month)) {
        return res
          .status(400)
          .json({ error: `Invalid month format: ${e.month} (expected YYYY-MM)` });
      }
      const pct = Number(e.available_pct);
      if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
        return res
          .status(400)
          .json({ error: `available_pct must be an integer 0-100 (got ${e.available_pct})` });
      }
      const resource = getResourceById(e.resource_id);
      if (!resource || resource.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Apply atomically: delete redundant (== base) overrides, upsert the rest.
    const apply = db.transaction((items) => {
      for (const e of items) {
        const base = getResourceById(e.resource_id).max_capacity ?? 100;
        const pct = Number(e.available_pct);
        if (pct === base) {
          deleteAvailability(e.resource_id, e.month);
        } else {
          upsertAvailability(e.resource_id, e.month, pct);
        }
      }
    });
    apply(entries);

    res.json(getAvailabilityByUser(req.user.id));
  } catch (err) {
    console.error('Save availability error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

- [ ] **Step 4 : Vérification — lint + suite backend non régressée**

Run: `cd server && npx vitest run`
Expected: PASS (aucune régression ; les routes n'ont pas de test HTTP — la logique DB sous-jacente est couverte par Task 1).

Run (lint depuis la racine): `npm run lint`
Expected: aucune erreur sur `server/capacity.js`.

- [ ] **Step 5 : Commit**

```bash
git add server/capacity.js
git commit -m "feat(capacity): GET/PUT /availability endpoints"
```

---

## Task 3 : Helper de calcul `getMonthlyCapacity`

**Files:**

- Modify: `src/lib/capacityCalculations.js`
- Test: `src/__tests__/capacityCalculations.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Dans `src/__tests__/capacityCalculations.test.js`, ajouter `getMonthlyCapacity` à l'import :

```javascript
import {
  weekToMonth,
  getMonthRange,
  calculateUtilization,
  calculateTransitionCostImpact,
  getMonthlyCapacity,
} from '../lib/capacityCalculations';
```

Puis ajouter à la fin du fichier :

```javascript
describe('getMonthlyCapacity', () => {
  const overrides = [
    { resource_id: 1, month: '2026-03', available_pct: 50 },
    { resource_id: 1, month: '2026-07', available_pct: 0 },
    { resource_id: 2, month: '2026-03', available_pct: 80 },
  ];

  it('returns the override when one exists for that resource/month', () => {
    expect(getMonthlyCapacity(1, '2026-03', overrides, 100)).toBe(50);
    expect(getMonthlyCapacity(1, '2026-07', overrides, 100)).toBe(0);
  });

  it('falls back to base capacity when no override exists', () => {
    expect(getMonthlyCapacity(1, '2026-04', overrides, 100)).toBe(100);
    expect(getMonthlyCapacity(2, '2026-04', overrides, 60)).toBe(60);
  });

  it('defaults base capacity to 100 when undefined', () => {
    expect(getMonthlyCapacity(3, '2026-01', overrides, undefined)).toBe(100);
  });

  it('matches resource ids regardless of string/number type', () => {
    expect(getMonthlyCapacity('1', '2026-03', overrides, 100)).toBe(50);
  });
});

describe('time-phased over-allocation', () => {
  const assignments = [
    { resource_id: 1, allocation: 60, start_month: '2026-03', end_month: '2026-03' },
  ];

  it('flags over-allocation when demand exceeds reduced availability', () => {
    const overrides = [{ resource_id: 1, month: '2026-03', available_pct: 50 }];
    const demand = calculateUtilization(assignments, 1, '2026-03'); // 60
    const capacity = getMonthlyCapacity(1, '2026-03', overrides, 100); // 50
    expect(demand > capacity).toBe(true);
  });

  it('does not flag when demand is within base capacity and no override', () => {
    const demand = calculateUtilization(assignments, 1, '2026-03'); // 60
    const capacity = getMonthlyCapacity(1, '2026-03', [], 100); // 100
    expect(demand > capacity).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/__tests__/capacityCalculations.test.js`
Expected: FAIL — `getMonthlyCapacity is not a function` / `not exported`

- [ ] **Step 3 : Implémenter le helper**

Dans `src/lib/capacityCalculations.js`, après `calculateUtilization` (vers la ligne 81), ajouter :

```javascript
/**
 * Effective capacity (%) of a resource for a given month.
 *
 * Looks up a time-phased override in `overrides`; if none exists for this
 * resource/month, falls back to the resource's base capacity. This is the
 * single rule used everywhere capacity must be known per month.
 *
 * @param {string|number} resourceId  - Resource to look up.
 * @param {string}        month        - Target month in YYYY-MM format.
 * @param {object[]}      overrides    - Rows from resource_availability ({ resource_id, month, available_pct }).
 * @param {number}        baseCapacity - resources.max_capacity (defaults to 100 if undefined).
 * @returns {number} Capacity percentage 0..100.
 */
export function getMonthlyCapacity(resourceId, month, overrides, baseCapacity) {
  const override = (overrides || []).find(
    (o) => String(o.resource_id) === String(resourceId) && o.month === month
  );
  return override ? override.available_pct : (baseCapacity ?? 100);
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/__tests__/capacityCalculations.test.js`
Expected: PASS (tous verts, aucune régression).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/capacityCalculations.js src/__tests__/capacityCalculations.test.js
git commit -m "feat(capacity): getMonthlyCapacity helper + tests"
```

---

## Task 4 : Client API `getAvailability` / `saveAvailability`

**Files:**

- Modify: `src/lib/capacityApi.js`

- [ ] **Step 1 : Ajouter les deux méthodes au client**

Dans `src/lib/capacityApi.js`, dans l'objet `capacityApi`, après le bloc `// --- Assignments ---` (après `deleteAssignment`), ajouter :

```javascript
  // --- Availability (time-phased monthly capacity) ---

  /**
   * Fetch all monthly availability overrides for the pool.
   * @returns {Promise<Array<{ id, resource_id, month, available_pct }>>}
   */
  getAvailability: () => api.request('/capacity/availability'),

  /**
   * Bulk upsert monthly availability overrides. Entries whose available_pct
   * equals the resource's base capacity are removed server-side.
   * @param {Array<{ resource_id: number, month: string, available_pct: number }>} entries
   * @returns {Promise<Array>} The refreshed list of overrides.
   */
  saveAvailability: (entries) =>
    api.request('/capacity/availability', { method: 'PUT', body: JSON.stringify(entries) }),
```

- [ ] **Step 2 : Vérifier que le build n'est pas cassé**

Run: `npm run build`
Expected: build OK (pas d'erreur de syntaxe).

- [ ] **Step 3 : Commit**

```bash
git add src/lib/capacityApi.js
git commit -m "feat(capacity): availability API client methods"
```

---

## Task 5 : Traductions FR/EN

**Files:**

- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1 : Ajouter les clés FR**

Dans le bloc FR de `src/lib/i18n.jsx`, à côté des clés `capacity.*` existantes (après `'capacity.transitions': 'Transitions',`), ajouter :

```javascript
'capacity.availability': 'Disponibilité',
'capacity.availabilityTitle': 'Disponibilité mensuelle',
'capacity.availabilityHint': "Saisissez la disponibilité (%) d'une ressource pour un mois. Vide = capacité de base.",
'capacity.baseCapacity': 'Capacité de base',
```

- [ ] **Step 2 : Ajouter les clés EN**

Dans le bloc EN, au même endroit relatif (après `'capacity.transitions': 'Transitions',`), ajouter :

```javascript
'capacity.availability': 'Availability',
'capacity.availabilityTitle': 'Monthly availability',
'capacity.availabilityHint': 'Set a resource’s availability (%) for a month. Empty = base capacity.',
'capacity.baseCapacity': 'Base capacity',
```

- [ ] **Step 3 : Vérifier le build (pas de clé manquante / virgule oubliée)**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/i18n.jsx
git commit -m "feat(i18n): availability tab + grid labels (FR/EN)"
```

---

## Task 6 : Composant `AvailabilityGrid`

**Files:**

- Create: `src/components/AvailabilityGrid.jsx`

Le composant charge lui-même les ressources et les overrides (comme `ResourcePool`), affiche une grille ressources × 12 mois, et persiste à la perte de focus. Vider une cellule envoie la capacité de base (le serveur supprime alors l'override).

- [ ] **Step 1 : Créer le composant**

Créer `src/components/AvailabilityGrid.jsx` :

```jsx
/**
 * AvailabilityGrid — éditeur de disponibilité mensuelle (chantier A).
 *
 * Grille ressources (lignes) × 12 mois (colonnes). Chaque cellule édite la
 * disponibilité % de la ressource pour ce mois. Une cellule vide = capacité de
 * base (resources.max_capacity) : aucun override stocké. Saisir la valeur de
 * base efface l'override côté serveur.
 *
 * Source de vérité : la table resource_availability (overrides uniquement).
 * Le composant recharge la liste renvoyée par PUT après chaque sauvegarde.
 */
import { useEffect, useState, useMemo } from 'react';
import { capacityApi } from '../lib/capacityApi';
import { getMonthRange, getMonthlyCapacity } from '../lib/capacityCalculations';
import { useLocale } from '../lib/i18n';

/** Mois courant au format YYYY-MM (fenêtre glissante de 12 mois, comme le Gantt). */
function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Ajoute n mois à un YYYY-MM. */
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const AvailabilityGrid = () => {
  const { t } = useLocale();
  const [resources, setResources] = useState([]);
  const [overrides, setOverrides] = useState([]);

  const startMonth = useMemo(() => currentMonth(), []);
  const months = useMemo(() => getMonthRange(startMonth, addMonths(startMonth, 11)), [startMonth]);

  useEffect(() => {
    capacityApi
      .getResources()
      .then((d) => setResources(Array.isArray(d) ? d : []))
      .catch(() => {});
    capacityApi
      .getAvailability()
      .then((d) => setOverrides(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  /** Persiste une cellule au blur si la valeur a changé. */
  async function handleCommit(resource, month, raw) {
    const base = resource.max_capacity ?? 100;
    // Vide → revenir à la base ; sinon clamp 0..100.
    let pct = raw === '' ? base : Math.max(0, Math.min(100, parseInt(raw, 10)));
    if (Number.isNaN(pct)) pct = base;
    const current = getMonthlyCapacity(resource.id, month, overrides, base);
    if (pct === current) return; // pas de changement → pas d'appel réseau
    try {
      const updated = await capacityApi.saveAvailability([
        { resource_id: resource.id, month, available_pct: pct },
      ]);
      setOverrides(Array.isArray(updated) ? updated : []);
    } catch {
      /* fix-forward : en cas d'échec on garde l'état précédent */
    }
  }

  if (resources.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border border-border rounded-lg p-6 bg-card">
        {t('capacity.availabilityHint')}
      </div>
    );
  }

  const gridCols = `minmax(140px, 1.4fr) repeat(${months.length}, minmax(56px, 1fr))`;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {t('capacity.availabilityTitle')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t('capacity.availabilityHint')}</p>
      </div>

      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <div style={{ display: 'grid', gridTemplateColumns: gridCols }} className="min-w-max">
          {/* En-tête */}
          <div className="sticky left-0 bg-card z-10 border-b border-r border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            {t('capacity.baseCapacity')}
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
                <div className="sticky left-0 bg-card z-10 border-b border-r border-border px-3 py-2 text-sm flex items-center justify-between gap-2">
                  <span className="truncate">{r.name}</span>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums">
                    {base}%
                  </span>
                </div>
                {months.map((m) => {
                  const hasOverride = overrides.some(
                    (o) => String(o.resource_id) === String(r.id) && o.month === m
                  );
                  const value = getMonthlyCapacity(r.id, m, overrides, base);
                  return (
                    <div key={m} className="border-b border-border p-0.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={hasOverride ? value : ''}
                        placeholder={String(base)}
                        aria-label={`${r.name} ${m}`}
                        onBlur={(e) => handleCommit(r, m, e.target.value)}
                        className={`w-full text-center text-sm rounded-md py-1 font-mono tabular-nums bg-background border ${
                          hasOverride
                            ? 'border-border text-foreground'
                            : 'border-transparent text-muted-foreground'
                        } focus:border-primary focus:outline-none`}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AvailabilityGrid;
```

- [ ] **Step 2 : Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 3 : Commit**

```bash
git add src/components/AvailabilityGrid.jsx
git commit -m "feat(capacity): AvailabilityGrid month-by-resource editor"
```

---

## Task 7 : Brancher l'onglet « Disponibilité » dans `CapacityView`

**Files:**

- Modify: `src/components/CapacityView.jsx`

- [ ] **Step 1 : Importer le composant et l'icône**

En tête de `src/components/CapacityView.jsx`, ajouter l'import du composant :

```javascript
import AvailabilityGrid from './AvailabilityGrid';
```

Et ajouter `CalendarClock` à l'import existant depuis `lucide-react` (la ligne qui importe déjà `Users, BarChart3, ArrowLeftRight, Settings, …`).

- [ ] **Step 2 : Ajouter l'onglet dans le tableau `TABS`**

Modifier le tableau `TABS` pour insérer « Disponibilité » entre `gantt` et `transitions` :

```javascript
const TABS = [
  { id: 'resources', icon: Users, label: t('capacity.resources') },
  { id: 'gantt', icon: BarChart3, label: t('capacity.gantt') },
  { id: 'availability', icon: CalendarClock, label: t('capacity.availability') },
  { id: 'transitions', icon: ArrowLeftRight, label: t('capacity.transitions') },
  { id: 'rates', icon: Settings, label: t('tab.rates') },
];
```

- [ ] **Step 3 : Rendre le contenu de l'onglet**

Dans la section « Tab content », après le bloc `{activeTab === 'resources' && ( <ResourcePool .../> )}`, ajouter :

```javascript
{
  activeTab === 'availability' && <AvailabilityGrid />;
}
```

- [ ] **Step 4 : Vérifier le build + lint**

Run: `npm run build`
Expected: build OK.
Run: `npm run lint`
Expected: aucune erreur sur `CapacityView.jsx`.

- [ ] **Step 5 : Commit**

```bash
git add src/components/CapacityView.jsx
git commit -m "feat(capacity): add Availability sub-tab to CapacityView"
```

---

## Task 8 : Rendre `UtilizationSummary` time-phasé

**Files:**

- Modify: `src/components/UtilizationSummary.jsx`
- Modify: `src/components/CapacityGantt.jsx`

Aujourd'hui `UtilizationSummary` calcule `Σ(allocations) ÷ Σ(max_capacity)` (capacité constante). On remplace le dénominateur par la **capacité time-phasée** du mois via `getMonthlyCapacity`. `CapacityGantt` charge les overrides et les passe en prop.

- [ ] **Step 1 : Mettre à jour `UtilizationSummary` pour utiliser la capacité du mois**

Dans `src/components/UtilizationSummary.jsx` :

(a) Étendre l'import depuis `capacityCalculations` pour inclure `getMonthlyCapacity` :

```javascript
import { calculateUtilization, getMonthlyCapacity } from '../lib/capacityCalculations';
```

(b) Ajouter `availability = []` aux props et utiliser la capacité time-phasée. Remplacer la signature et le calcul de `totalCapacity` :

```javascript
const UtilizationSummary = ({ resources, assignments, months, gridCols, availability = [] }) => {
```

et, dans le `months.map(...)`, remplacer la ligne :

```javascript
const totalCapacity = resources.reduce((sum, r) => sum + (r.max_capacity || 100), 0);
```

par :

```javascript
const totalCapacity = resources.reduce(
  (sum, r) => sum + getMonthlyCapacity(r.id, month, availability, r.max_capacity ?? 100),
  0
);
```

(Le reste — `totalAllocation`, `pct`, les tokens de couleur — reste inchangé. La surcharge `pct >= 100` reflète désormais la dispo réelle du mois.)

- [ ] **Step 2 : Charger et passer `availability` depuis `CapacityGantt`**

Dans `src/components/CapacityGantt.jsx` :

(a) Ajouter un état + un chargement des overrides. Près du `useEffect` existant qui appelle `capacityApi.getGanttData(...)`, ajouter :

```javascript
const [availability, setAvailability] = useState([]);
useEffect(() => {
  capacityApi
    .getAvailability()
    .then((d) => setAvailability(Array.isArray(d) ? d : []))
    .catch(() => {});
}, []);
```

(Vérifier que `useState` est déjà importé depuis `react` — c'est le cas.)

(b) Passer la prop au rendu de `UtilizationSummary`. Localiser le rendu avec :

Run: `npx rg "UtilizationSummary" src/components/CapacityGantt.jsx`

Sur la balise `<UtilizationSummary ... />` trouvée, ajouter la prop :

```javascript
availability = { availability };
```

de sorte qu'elle devienne, par exemple :

```jsx
<UtilizationSummary
  resources={resources}
  assignments={assignments}
  months={months}
  gridCols={gridCols}
  availability={availability}
/>
```

(Conserver les autres props telles quelles ; n'ajouter que `availability`.)

- [ ] **Step 3 : Vérifier le build + tests**

Run: `npm run build`
Expected: build OK.
Run: `npx vitest run`
Expected: PASS (frontend) — aucune régression sur les tests de calcul.

- [ ] **Step 4 : Vérification manuelle (dev)**

Run: `npm run dev` (et `node server/index.js` si nécessaire pour l'API).
Vérifier :

1. Onglet « Disponibilité » visible entre Gantt et Transitions ; grille ressources × 12 mois.
2. Saisir `50` pour une ressource sur un mois → persiste après reload (la cellule garde `50`, bordure pleine).
3. Vider la cellule → revient au placeholder gris (= base) ; en base, l'override a disparu (vérifier via `GET /api/capacity/availability` ou un reload).
4. Sur le Gantt, allouer une ressource à 60 % un mois où sa dispo = 50 % → la ligne « Taux d'occupation » du mois passe au rouge (≥ 100 %).

- [ ] **Step 5 : Commit**

```bash
git add src/components/UtilizationSummary.jsx src/components/CapacityGantt.jsx
git commit -m "feat(capacity): time-phased utilization in UtilizationSummary"
```

---

## Finalisation

- [ ] **Lancer toute la suite + lint**

Run: `npm run lint && npx vitest run && (cd server && npx vitest run)`
Expected: tout vert.

- [ ] **Pousser la branche et ouvrir la PR**

```bash
git push -u origin feature/capacity-time-phased-availability
gh pr create --base main --title "feat(capacity): time-phased monthly availability per resource" --body "Voir docs/superpowers/specs/2026-06-01-capacite-time-phasee-design.md. Chantier A du diagnostic de parité MS Project."
```

Attendre la CI verte (Test & Lint + Docker Smoke Test) avant merge.

---

## Self-Review (couverture spec → plan)

| Exigence spec                                                       | Tâche                                                                |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| §5 Table `resource_availability` + index + cascade                  | Task 1                                                               |
| §5 Schéma de test synchronisé (setup.js)                            | Task 1 (Step 3)                                                      |
| §5 Invariant anti-duplication (delete si == base)                   | Task 2 (Step 3)                                                      |
| §6 GET/PUT `/availability`, validation manuelle, ownership          | Task 2                                                               |
| §7 Helper `getMonthlyCapacity` + tests                              | Task 3                                                               |
| §6 Client API                                                       | Task 4                                                               |
| §8 Sous-onglet « Disponibilité » (position Gantt→Dispo→Transitions) | Task 5 (i18n) + Task 6 (grille) + Task 7 (onglet)                    |
| §8 + Addendum : surcharge time-phasée via `UtilizationSummary`      | Task 8                                                               |
| §9 Tests (calc + DB)                                                | Task 1, Task 3                                                       |
| §10 Rétro-compat (sans override = comportement actuel)              | `getMonthlyCapacity` fallback (Task 3) + placeholder grille (Task 6) |

Hors périmètre confirmé (chantier 2 / suivis §11) : vue « capacité restante » chiffrée, cellules de surcharge par ressource dans le Gantt, extension de `ResourceConflicts`.
