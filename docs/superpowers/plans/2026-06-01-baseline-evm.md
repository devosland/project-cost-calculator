# Valeur acquise (EVM) v1 — onglet Pilotage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un onglet projet « Pilotage » affichant les métriques EVM (EV/PV/AC, SPI/CPI, EAC/VAC) au niveau projet et par phase, sans baseline figée et sans nouveau champ de tâche.

**Architecture:** Hybride. Le serveur ajoute un rollup `getProjectProgress` (avancement par phase, dérivé des statuts Kanban via `epic_phases`, jumeau de `getProjectActuals`). Le client ajoute une lib pure `evmCalculations` (PV linéaire + formules EVM, réutilise `costCalculations`) et une vue `PilotageView` ; le coût/PV est calculé côté client, le progrès et le réel viennent du serveur.

**Tech Stack:** Express + better-sqlite3 (backend), React 18 + Vite + tokens Prism (frontend), Vitest. Spec : `docs/superpowers/specs/2026-06-01-baseline-evm-design.md`.

**Convention :** chaque tâche se termine par un commit. Tout le plan vit sur la branche `feature/evm-pilotage` et part en **une seule PR**.

---

## File Structure

| Fichier                                 | Rôle                                             | Action                           |
| --------------------------------------- | ------------------------------------------------ | -------------------------------- |
| `src/lib/evmCalculations.js`            | Math EVM pure (PV, SPI/CPI/EAC, statut d'indice) | Créer                            |
| `src/__tests__/evmCalculations.test.js` | Tests frontend EVM                               | Créer                            |
| `server/execution/rollups.js`           | Rollups serveur                                  | Modifier : `getProjectProgress`  |
| `server/__tests__/progress.test.js`     | Test DB du rollup de progrès                     | Créer                            |
| `server/execution/index.js`             | Routes exécution                                 | Modifier : route `GET /progress` |
| `src/lib/executionApi.js`               | Client API exécution                             | Modifier : `getProgress`         |
| `src/lib/i18n.jsx`                      | Traductions FR/EN                                | Modifier : onglet + libellés EVM |
| `src/components/PilotageView.jsx`       | Vue EVM (cartes + tableau par phase)             | Créer                            |
| `src/components/ProjectView.jsx`        | Conteneur à onglets projet                       | Modifier : onglet « Pilotage »   |

---

## Task 1 : Lib pure `evmCalculations` + tests

**Files:**

- Create: `src/lib/evmCalculations.js`
- Test: `src/__tests__/evmCalculations.test.js`

- [ ] **Step 1 : Écrire les tests qui échouent**

Créer `src/__tests__/evmCalculations.test.js` :

```javascript
import { describe, it, expect } from 'vitest';
import {
  phaseProgressPct,
  plannedValueToDate,
  indexStatus,
  computeEvm,
} from '../lib/evmCalculations';

describe('phaseProgressPct', () => {
  it('weights by estimate hours when hours are present', () => {
    expect(phaseProgressPct({ earned: 8, est: 20, taskCount: 2, earnedCount: 1 })).toBe(0.4);
  });
  it('falls back to task count when no estimate hours', () => {
    expect(phaseProgressPct({ earned: 0, est: 0, taskCount: 4, earnedCount: 2 })).toBe(0.5);
  });
  it('returns 0 when there is nothing to measure', () => {
    expect(phaseProgressPct({ earned: 0, est: 0, taskCount: 0, earnedCount: 0 })).toBe(0);
    expect(phaseProgressPct(undefined)).toBe(0);
  });
});

describe('plannedValueToDate', () => {
  it('is 0 before the phase starts', () => {
    expect(plannedValueToDate(4, 10, 2, 6000)).toBe(0);
  });
  it('is the full cost after the phase ends', () => {
    expect(plannedValueToDate(0, 10, 12, 6000)).toBe(6000);
  });
  it('is linear in the middle', () => {
    expect(plannedValueToDate(0, 10, 5, 6000)).toBe(3000);
  });
  it('returns null when asOfWeek is null (no schedule)', () => {
    expect(plannedValueToDate(0, 10, null, 6000)).toBeNull();
  });
  it('treats a zero-length phase as fully earned once reached', () => {
    expect(plannedValueToDate(5, 5, 6, 6000)).toBe(6000);
    expect(plannedValueToDate(5, 5, 4, 6000)).toBe(0);
  });
});

describe('indexStatus', () => {
  it('green at or above 1', () => {
    expect(indexStatus(1)).toBe('success');
    expect(indexStatus(1.25)).toBe('success');
  });
  it('amber between 0.9 and 1', () => {
    expect(indexStatus(0.9)).toBe('warning');
    expect(indexStatus(0.95)).toBe('warning');
  });
  it('red below 0.9', () => {
    expect(indexStatus(0.8)).toBe('error');
  });
  it('neutral for null (N/A)', () => {
    expect(indexStatus(null)).toBe('neutral');
  });
});

describe('computeEvm', () => {
  const rates = { INTERNAL_RATE: 80, CONSULTANT_RATES: { Dev: { Senior: 100 } } };
  const project = {
    settings: { startDate: '2026-01-01' },
    phases: [
      {
        id: 'p1',
        name: 'P1',
        durationWeeks: 10,
        teamMembers: [{ role: 'Dev', level: 'Senior', quantity: 1, allocation: 100 }],
      },
    ],
  };
  // BAC = 100 $/h × 37.5 h/sem × 1 × 100% × 10 sem = 37 500 $
  const progress = { p1: { earned: 8, est: 20, taskCount: 2, earnedCount: 1 } }; // pct 0.4
  const actuals = { p1: { hours: 120, cost: 12000 } };

  it('computes EV/PV/AC and the indices on a worked example', () => {
    const r = computeEvm({ project, rates, progress, actuals, asOfWeek: 5 });
    expect(r.bac).toBe(37500);
    expect(r.pv).toBe(18750); // 50% of schedule elapsed
    expect(r.ev).toBe(15000); // 0.4 × 37500
    expect(r.ac).toBe(12000);
    expect(r.spi).toBeCloseTo(0.8, 5); // 15000 / 18750
    expect(r.cpi).toBeCloseTo(1.25, 5); // 15000 / 12000
    expect(r.eac).toBeCloseTo(30000, 5); // 37500 / 1.25
    expect(r.etc).toBeCloseTo(18000, 5); // 30000 - 12000
    expect(r.vac).toBeCloseTo(7500, 5); // 37500 - 30000
    expect(r.byPhase).toHaveLength(1);
    expect(r.byPhase[0].phaseId).toBe('p1');
  });

  it('marks PV and SPI as null when there is no start date (asOfWeek null)', () => {
    const r = computeEvm({ project, rates, progress, actuals, asOfWeek: null });
    expect(r.pv).toBeNull();
    expect(r.spi).toBeNull();
    expect(r.ev).toBe(15000); // EV/CPI still valid
    expect(r.cpi).toBeCloseTo(1.25, 5);
  });

  it('marks CPI and EAC as null when AC is 0', () => {
    const r = computeEvm({ project, rates, progress, actuals: {}, asOfWeek: 5 });
    expect(r.ac).toBe(0);
    expect(r.cpi).toBeNull();
    expect(r.eac).toBeNull();
    expect(r.etc).toBeNull();
    expect(r.vac).toBeNull();
  });
});
```

- [ ] **Step 2 : Lancer les tests pour vérifier l'échec**

Run: `npx vitest run src/__tests__/evmCalculations.test.js`
Expected: FAIL — module `../lib/evmCalculations` introuvable / fonctions non exportées.

- [ ] **Step 3 : Implémenter la lib**

Créer `src/lib/evmCalculations.js` :

```javascript
/**
 * Calculs de valeur acquise (EVM) — purs, sans effet de bord (chantier D).
 *
 * Niveau de calcul : la phase est le « compte de contrôle ». On agrège ensuite
 * au projet. PV est dérivé du plan vivant (accrual linéaire sur la durée de
 * phase), EV de l'avancement (statuts Kanban remontés par le serveur), AC des
 * réels (time_entries). Aucune baseline figée.
 */
import {
  calculatePhaseTotalCost,
  calculateProjectDurationWithDependencies,
} from './costCalculations';

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

/**
 * Avancement [0..1] d'une phase à partir des agrégats du rollup serveur.
 * Pondéré par les heures estimées ; repli sur le nombre de tâches si aucune
 * estimation n'existe dans la phase.
 * @param {{earned?:number, est?:number, taskCount?:number, earnedCount?:number}} [agg]
 * @returns {number}
 */
export function phaseProgressPct(agg) {
  const { earned = 0, est = 0, taskCount = 0, earnedCount = 0 } = agg || {};
  if (est > 0) return earned / est;
  if (taskCount > 0) return earnedCount / taskCount;
  return 0;
}

/**
 * Valeur planifiée (PV) d'une phase à une date donnée — accrual LINÉAIRE.
 * @param {number} startWeek  Semaine de début de phase (depuis le début projet).
 * @param {number} endWeek    Semaine de fin de phase.
 * @param {number|null} asOfWeek  Semaine « aujourd'hui » (null = pas de planning).
 * @param {number} phaseCost  Coût planifié total de la phase (BAC_phase).
 * @returns {number|null} PV de la phase, ou null si asOfWeek est null.
 */
export function plannedValueToDate(startWeek, endWeek, asOfWeek, phaseCost) {
  if (asOfWeek == null) return null;
  if (endWeek <= startWeek) return asOfWeek >= endWeek ? phaseCost : 0;
  const frac = Math.max(0, Math.min(1, (asOfWeek - startWeek) / (endWeek - startWeek)));
  return phaseCost * frac;
}

/**
 * Statut sémantique d'un indice de performance (SPI/CPI) pour le code couleur.
 * Sens inverse de la capacité : un indice >= 1 est bon.
 * @param {number|null} value
 * @returns {'success'|'warning'|'error'|'neutral'} neutral = N/A.
 */
export function indexStatus(value) {
  if (value == null) return 'neutral';
  if (value >= 1) return 'success';
  if (value >= 0.9) return 'warning';
  return 'error';
}

/**
 * Calcule l'EVM complet d'un projet (niveau phase + agrégat projet).
 * @param {object} params
 * @param {object} params.project   Projet (phases, settings).
 * @param {object} params.rates     Carte de taux ({INTERNAL_RATE, CONSULTANT_RATES}).
 * @param {object} params.progress  Map phaseId → agrégats d'avancement (rollup serveur).
 * @param {object} params.actuals   Map phaseId → { hours, cost } (getActuals.by_phase).
 * @param {number|null} params.asOfWeek  Semaines depuis startDate (null si pas de startDate).
 * @returns {{bac, pv, ev, ac, spi, cpi, eac, etc, vac, byPhase}} métriques (null si N/A).
 */
export function computeEvm({ project, rates, progress = {}, actuals = {}, asOfWeek = null }) {
  const { phaseSchedule } = calculateProjectDurationWithDependencies(project);
  const schedById = Object.fromEntries(phaseSchedule.map((s) => [s.phaseId, s]));

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

  const bac = sum(byPhase.map((p) => p.bac));
  const ev = sum(byPhase.map((p) => p.ev));
  const ac = sum(byPhase.map((p) => p.ac));
  const pv = asOfWeek == null ? null : sum(byPhase.map((p) => p.pv || 0));
  const spi = pv != null && pv > 0 ? ev / pv : null;
  const cpi = ac > 0 ? ev / ac : null;
  const eac = cpi != null && cpi > 0 ? bac / cpi : null;
  const etc = eac != null ? eac - ac : null;
  const vac = eac != null ? bac - eac : null;

  return { bac, pv, ev, ac, spi, cpi, eac, etc, vac, byPhase };
}
```

- [ ] **Step 4 : Lancer les tests pour vérifier le succès**

Run: `npx vitest run src/__tests__/evmCalculations.test.js`
Expected: PASS (tous verts).

- [ ] **Step 5 : Commit**

```bash
git add src/lib/evmCalculations.js src/__tests__/evmCalculations.test.js
git commit -m "feat(evm): pure EVM calculation library + tests"
```

---

## Task 2 : Rollup serveur `getProjectProgress` + test DB

**Files:**

- Modify: `server/execution/rollups.js` (ajouter la fonction après `getProjectActuals`)
- Test: `server/__tests__/progress.test.js` (créer)

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `server/__tests__/progress.test.js` :

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb, destroyTestDb, seedSchema, seedUser, seedProject } from './setup.js';

let db, dbPath;

beforeAll(() => {
  ({ db, dbPath } = createTestDb());
  seedSchema(db);
});

afterAll(() => {
  destroyTestDb(db, dbPath);
});

// Le rollup getProjectProgress est lié au singleton db de server/db.js ; comme
// les autres tests serveur, on valide la REQUÊTE en l'exécutant en SQL brut sur
// la DB de test. La requête ci-dessous DOIT rester identique à celle de
// server/execution/rollups.js::getProjectProgress.
const PROGRESS_SQL = `
  WITH epic_progress AS (
    SELECT e.id AS epic_id,
           SUM(COALESCE(t.estimate_hours,0) * (CASE ps.category WHEN 'done' THEN 1.0 WHEN 'inprogress' THEN 0.5 ELSE 0 END)) AS earned,
           SUM(COALESCE(t.estimate_hours,0)) AS est,
           COUNT(t.id) AS task_count,
           SUM(CASE ps.category WHEN 'done' THEN 1.0 WHEN 'inprogress' THEN 0.5 ELSE 0 END) AS earned_count
    FROM epics e
    JOIN stories s ON s.epic_id = e.id
    JOIN tasks   t ON t.story_id = s.id
    JOIN project_statuses ps ON ps.project_id = e.project_id AND ps.name = t.status
    WHERE e.project_id = ?
    GROUP BY e.id
  ),
  phase_count AS (
    SELECT epic_id, COUNT(*) AS n FROM epic_phases GROUP BY epic_id
  )
  SELECT ep.phase_id AS phase_id,
         SUM(epr.earned / COALESCE(pc.n,1)) AS earned,
         SUM(epr.est / COALESCE(pc.n,1)) AS est,
         SUM(CAST(epr.task_count AS REAL) / COALESCE(pc.n,1)) AS task_count,
         SUM(epr.earned_count / COALESCE(pc.n,1)) AS earned_count
  FROM epic_phases ep
  JOIN epic_progress epr ON epr.epic_id = ep.epic_id
  LEFT JOIN phase_count pc ON pc.epic_id = ep.epic_id
  GROUP BY ep.phase_id
`;

function seedStatuses(db, projectId) {
  const stmt = db.prepare(
    'INSERT INTO project_statuses (project_id, name, category, order_idx) VALUES (?, ?, ?, ?)'
  );
  stmt.run(projectId, 'To Do', 'todo', 0);
  stmt.run(projectId, 'In Progress', 'inprogress', 1);
  stmt.run(projectId, 'Done', 'done', 2);
}

describe('project progress rollup (SQL)', () => {
  it('weights status by estimate_hours and splits epics across phases', () => {
    const user = seedUser(db, { email: 'evm@test.com' });
    const project = seedProject(db, user.id, { id: 'proj-evm' });
    seedStatuses(db, project.id);

    // Epic linked to a single phase 'pA'
    const epic = db
      .prepare(
        'INSERT INTO epics (project_id, key, title, status, priority) VALUES (?, ?, ?, ?, ?)'
      )
      .run(project.id, 'E-1', 'Epic 1', 'To Do', 'medium');
    const epicId = Number(epic.lastInsertRowid);
    db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)').run(epicId, 'pA');
    const story = db
      .prepare('INSERT INTO stories (epic_id, key, title, status, priority) VALUES (?, ?, ?, ?, ?)')
      .run(epicId, 'S-1', 'Story 1', 'To Do', 'medium');
    const storyId = Number(story.lastInsertRowid);
    const insTask = db.prepare(
      'INSERT INTO tasks (story_id, key, title, status, priority, estimate_hours) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insTask.run(storyId, 'T-1', 'Done task', 'Done', 'medium', 10); // earned 10
    insTask.run(storyId, 'T-2', 'Todo task', 'To Do', 'medium', 10); // earned 0

    const rows = db.prepare(PROGRESS_SQL).all(project.id);
    const byPhase = Object.fromEntries(rows.map((r) => [r.phase_id, r]));

    expect(byPhase.pA.earned).toBe(10);
    expect(byPhase.pA.est).toBe(20);
    // pct = 10/20 = 0.5
    expect(byPhase.pA.earned / byPhase.pA.est).toBe(0.5);
  });

  it('splits an epic linked to two phases equally', () => {
    const user = seedUser(db, { email: 'evm2@test.com' });
    const project = seedProject(db, user.id, { id: 'proj-evm2' });
    seedStatuses(db, project.id);

    const epic = db
      .prepare(
        'INSERT INTO epics (project_id, key, title, status, priority) VALUES (?, ?, ?, ?, ?)'
      )
      .run(project.id, 'E-1', 'Epic 1', 'To Do', 'medium');
    const epicId = Number(epic.lastInsertRowid);
    db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)').run(epicId, 'pA');
    db.prepare('INSERT INTO epic_phases (epic_id, phase_id) VALUES (?, ?)').run(epicId, 'pB');
    const story = db
      .prepare('INSERT INTO stories (epic_id, key, title, status, priority) VALUES (?, ?, ?, ?, ?)')
      .run(epicId, 'S-1', 'Story 1', 'To Do', 'medium');
    const storyId = Number(story.lastInsertRowid);
    db.prepare(
      'INSERT INTO tasks (story_id, key, title, status, priority, estimate_hours) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(storyId, 'T-1', 'Done task', 'Done', 'medium', 20); // earned 20, split 10/10

    const rows = db.prepare(PROGRESS_SQL).all(project.id);
    const byPhase = Object.fromEntries(rows.map((r) => [r.phase_id, r]));

    expect(byPhase.pA.est).toBe(10);
    expect(byPhase.pB.est).toBe(10);
    expect(byPhase.pA.earned).toBe(10);
    expect(byPhase.pB.earned).toBe(10);
  });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il passe (il valide la requête seule)**

Run: `npx vitest run server/__tests__/progress.test.js` (depuis la racine)
Expected: PASS — la requête agrège correctement. (Le test valide la requête ; l'étape 3 la place dans le rollup.)

> Note : ce test passe avant d'écrire le rollup car il exécute la requête directement. Il sert de garde-fou sur la sémantique SQL, comme le test d'upsert du chantier A.

- [ ] **Step 3 : Implémenter `getProjectProgress`**

Dans `server/execution/rollups.js`, après `getProjectActuals`, ajouter (la requête est IDENTIQUE à `PROGRESS_SQL` du test) :

```javascript
/**
 * Avancement agrégé d'un projet, dérivé des statuts Kanban (règle 0/50/100 :
 * done=1, inprogress=0.5, todo=0), pondéré par estimate_hours, avec le même
 * split epic→phases que getProjectActuals (epic lié à N phases ⇒ split égal).
 *
 * Retourne des AGRÉGATS bruts par phase ; le pourcentage final (avec repli sur
 * le nombre de tâches si aucune estimation) est calculé côté client par
 * evmCalculations.phaseProgressPct.
 *
 * @param {string} projectId
 * @returns {{ by_phase: Object<string,{earned:number,est:number,taskCount:number,earnedCount:number}> }}
 */
export function getProjectProgress(projectId) {
  const rows = db
    .prepare(
      `
    WITH epic_progress AS (
      SELECT e.id AS epic_id,
             SUM(COALESCE(t.estimate_hours,0) * (CASE ps.category WHEN 'done' THEN 1.0 WHEN 'inprogress' THEN 0.5 ELSE 0 END)) AS earned,
             SUM(COALESCE(t.estimate_hours,0)) AS est,
             COUNT(t.id) AS task_count,
             SUM(CASE ps.category WHEN 'done' THEN 1.0 WHEN 'inprogress' THEN 0.5 ELSE 0 END) AS earned_count
      FROM epics e
      JOIN stories s ON s.epic_id = e.id
      JOIN tasks   t ON t.story_id = s.id
      JOIN project_statuses ps ON ps.project_id = e.project_id AND ps.name = t.status
      WHERE e.project_id = ?
      GROUP BY e.id
    ),
    phase_count AS (
      SELECT epic_id, COUNT(*) AS n FROM epic_phases GROUP BY epic_id
    )
    SELECT ep.phase_id AS phase_id,
           SUM(epr.earned / COALESCE(pc.n,1)) AS earned,
           SUM(epr.est / COALESCE(pc.n,1)) AS est,
           SUM(CAST(epr.task_count AS REAL) / COALESCE(pc.n,1)) AS task_count,
           SUM(epr.earned_count / COALESCE(pc.n,1)) AS earned_count
    FROM epic_phases ep
    JOIN epic_progress epr ON epr.epic_id = ep.epic_id
    LEFT JOIN phase_count pc ON pc.epic_id = ep.epic_id
    GROUP BY ep.phase_id
  `
    )
    .all(projectId);

  return {
    by_phase: Object.fromEntries(
      rows.map((r) => [
        r.phase_id,
        { earned: r.earned, est: r.est, taskCount: r.task_count, earnedCount: r.earned_count },
      ])
    ),
  };
}
```

- [ ] **Step 4 : Vérifier la suite serveur**

Run: `npx vitest run server/__tests__/progress.test.js`
Expected: PASS.
(Le rollup n'est pas appelé directement par le test — singleton db — mais sa requête est garantie identique à `PROGRESS_SQL`.)

- [ ] **Step 5 : Commit**

```bash
git add server/execution/rollups.js server/__tests__/progress.test.js
git commit -m "feat(evm): getProjectProgress rollup (status-weighted by phase)"
```

---

## Task 3 : Route `GET /progress` + client `getProgress`

**Files:**

- Modify: `server/execution/index.js`
- Modify: `src/lib/executionApi.js`

- [ ] **Step 1 : Importer le rollup dans les routes**

Dans `server/execution/index.js`, ajouter `getProjectProgress` à l'import existant qui amène `getProjectActuals` depuis `./rollups.js` (chercher `getProjectActuals` dans les imports et ajouter `getProjectProgress` à la même accolade).

- [ ] **Step 2 : Ajouter la route (jumelle de `/actuals`)**

Juste après le handler `router.get('/projects/:projectId/actuals', ...)`, ajouter :

```javascript
/**
 * GET /api/execution/projects/:projectId/progress
 * Retourne { by_phase: { phase_id: { earned, est, taskCount, earnedCount } } },
 * agrégats d'avancement dérivés des statuts (pour la valeur acquise EVM).
 */
router.get('/projects/:projectId/progress', (req, res) => {
  const { projectId } = req.params;
  const role = getProjectRole(projectId, req.user.id);
  if (gateAccess(res, role, 'viewer')) return;
  res.json(getProjectProgress(projectId));
});
```

- [ ] **Step 3 : Ajouter la méthode client**

Dans `src/lib/executionApi.js`, dans l'objet `executionApi`, juste après `getActuals`, ajouter :

```javascript
  /** Avancement par phase (statuts) pour l'EVM : { by_phase: { phase_id: {earned,est,taskCount,earnedCount} } }. */
  getProgress: (projectId) => request(`/projects/${projectId}/progress`),
```

- [ ] **Step 4 : Vérifier build + suite**

Run: `npm run build`
Expected: build OK.
Run: `npx vitest run`
Expected: PASS (ignorer le flake serveur connu `executionSyncFromPlan`/`apiKeysRoutes`/`publicApi.roadmap` ; un re-run passe).

- [ ] **Step 5 : Commit**

```bash
git add server/execution/index.js src/lib/executionApi.js
git commit -m "feat(evm): GET /progress endpoint + client method"
```

---

## Task 4 : Traductions FR/EN

**Files:**

- Modify: `src/lib/i18n.jsx`

- [ ] **Step 1 : Ajouter les clés FR**

Dans le bloc FR de `src/lib/i18n.jsx`, après `'tab.work': 'Travail',`, ajouter l'onglet et les libellés EVM :

```javascript
'tab.pilotage': 'Pilotage',
'evm.title': 'Valeur acquise (EVM)',
'evm.empty': "Le pilotage EVM repose sur les statuts des tâches. Ajoutez des Epics/Stories/Tâches dans l'onglet Travail.",
'evm.ev': 'Valeur acquise (EV)',
'evm.pv': 'Valeur planifiée (PV)',
'evm.ac': 'Coût réel (AC)',
'evm.bac': 'Budget à terminaison (BAC)',
'evm.spi': 'Indice de délai (SPI)',
'evm.cpi': 'Indice de coût (CPI)',
'evm.eac': 'Coût final estimé (EAC)',
'evm.etc': 'Reste à faire (ETC)',
'evm.vac': 'Écart à terminaison (VAC)',
'evm.phase': 'Phase',
'evm.planned': 'Planifié',
```

- [ ] **Step 2 : Ajouter les clés EN**

Dans le bloc EN, après `'tab.work': 'Work',`, ajouter :

```javascript
'tab.pilotage': 'Tracking',
'evm.title': 'Earned Value (EVM)',
'evm.empty': 'EVM tracking relies on task statuses. Add Epics/Stories/Tasks in the Work tab.',
'evm.ev': 'Earned Value (EV)',
'evm.pv': 'Planned Value (PV)',
'evm.ac': 'Actual Cost (AC)',
'evm.bac': 'Budget at Completion (BAC)',
'evm.spi': 'Schedule Index (SPI)',
'evm.cpi': 'Cost Index (CPI)',
'evm.eac': 'Estimate at Completion (EAC)',
'evm.etc': 'Estimate to Complete (ETC)',
'evm.vac': 'Variance at Completion (VAC)',
'evm.phase': 'Phase',
'evm.planned': 'Planned',
```

- [ ] **Step 3 : Vérifier le build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4 : Commit**

```bash
git add src/lib/i18n.jsx
git commit -m "feat(i18n): Pilotage tab + EVM labels (FR/EN)"
```

---

## Task 5 : Composant `PilotageView`

**Files:**

- Create: `src/components/PilotageView.jsx`

- [ ] **Step 1 : Créer le composant**

Créer `src/components/PilotageView.jsx` :

```jsx
/**
 * PilotageView — tableau de bord de valeur acquise (EVM) d'un projet (chantier D).
 *
 * Cartes EV/PV/AC, SPI/CPI, EAC/VAC/ETC + tableau par phase. Lecture seule.
 * Calcul côté client (evmCalculations) : coût/PV depuis le plan + costCalculations,
 * avancement (getProgress) et réels (getActuals) depuis le serveur. PV/SPI sont
 * « N/A » si le projet n'a pas de date de début.
 */
import { useEffect, useState, useMemo } from 'react';
import { executionApi } from '../lib/executionApi';
import { computeEvm, indexStatus } from '../lib/evmCalculations';
import { formatCurrency } from '../lib/costCalculations';
import { useLocale } from '../lib/i18n';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Semaines écoulées depuis startDate jusqu'à aujourd'hui (null si pas de date). */
function asOfWeekFrom(startDate) {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  return Math.max(0, (Date.now() - start.getTime()) / MS_PER_WEEK);
}

const PilotageView = ({ project, rates }) => {
  const { t } = useLocale();
  const currency = project.settings?.currency || 'CAD';
  const fmt = (v) => (v == null ? '—' : formatCurrency(v, currency));
  const fmtIdx = (v) => (v == null ? '—' : v.toFixed(2));

  const [progress, setProgress] = useState(null);
  const [actuals, setActuals] = useState(null);

  useEffect(() => {
    let cancelled = false;
    executionApi
      .getProgress(project.id)
      .then((d) => {
        if (!cancelled) setProgress(d?.by_phase || {});
      })
      .catch(() => {
        if (!cancelled) setProgress({});
      });
    executionApi
      .getActuals(project.id)
      .then((d) => {
        if (!cancelled) setActuals(d?.by_phase || {});
      })
      .catch(() => {
        if (!cancelled) setActuals({});
      });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  const asOfWeek = useMemo(
    () => asOfWeekFrom(project.settings?.startDate),
    [project.settings?.startDate]
  );

  const evm = useMemo(() => {
    if (progress == null || actuals == null) return null;
    return computeEvm({ project, rates, progress, actuals, asOfWeek });
  }, [project, rates, progress, actuals, asOfWeek]);

  if (evm == null) {
    return <div className="text-sm text-muted-foreground p-6">…</div>;
  }

  // Projet sans aucune tâche mesurable → invite (l'EVM repose sur les statuts).
  const hasProgress = Object.keys(progress).length > 0;
  if (!hasProgress) {
    return (
      <div className="text-sm text-muted-foreground border border-border rounded-lg p-6 bg-card">
        {t('evm.empty')}
      </div>
    );
  }

  const idxStyle = (v) => {
    const token = `--prism-${indexStatus(v)}`;
    if (indexStatus(v) === 'neutral') return {};
    return { color: `var(${token})` };
  };

  const Card = ({ label, value, style }) => (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold font-mono tabular-nums mt-1" style={style}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{t('evm.title')}</h2>

      {/* Cartes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label={t('evm.ev')} value={fmt(evm.ev)} />
        <Card label={t('evm.pv')} value={fmt(evm.pv)} />
        <Card label={t('evm.ac')} value={fmt(evm.ac)} />
        <Card label={t('evm.bac')} value={fmt(evm.bac)} />
        <Card label={t('evm.spi')} value={fmtIdx(evm.spi)} style={idxStyle(evm.spi)} />
        <Card label={t('evm.cpi')} value={fmtIdx(evm.cpi)} style={idxStyle(evm.cpi)} />
        <Card label={t('evm.eac')} value={fmt(evm.eac)} />
        <Card label={t('evm.vac')} value={fmt(evm.vac)} />
      </div>

      {/* Tableau par phase */}
      <div className="overflow-x-auto border border-border rounded-lg bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">{t('evm.phase')}</th>
              <th className="px-3 py-2 font-medium text-right">{t('evm.planned')}</th>
              <th className="px-3 py-2 font-medium text-right">{t('evm.pv')}</th>
              <th className="px-3 py-2 font-medium text-right">{t('evm.ev')}</th>
              <th className="px-3 py-2 font-medium text-right">{t('evm.ac')}</th>
              <th className="px-3 py-2 font-medium text-right">{t('evm.cpi')}</th>
              <th className="px-3 py-2 font-medium text-right">{t('evm.spi')}</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {evm.byPhase.map((p) => (
              <tr key={p.phaseId} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-sans">{p.name}</td>
                <td className="px-3 py-2 text-right">{fmt(p.bac)}</td>
                <td className="px-3 py-2 text-right">{fmt(p.pv)}</td>
                <td className="px-3 py-2 text-right">{fmt(p.ev)}</td>
                <td className="px-3 py-2 text-right">{fmt(p.ac)}</td>
                <td className="px-3 py-2 text-right" style={idxStyle(p.cpi)}>
                  {fmtIdx(p.cpi)}
                </td>
                <td className="px-3 py-2 text-right" style={idxStyle(p.spi)}>
                  {fmtIdx(p.spi)}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-3 py-2 font-sans">Total</td>
              <td className="px-3 py-2 text-right">{fmt(evm.bac)}</td>
              <td className="px-3 py-2 text-right">{fmt(evm.pv)}</td>
              <td className="px-3 py-2 text-right">{fmt(evm.ev)}</td>
              <td className="px-3 py-2 text-right">{fmt(evm.ac)}</td>
              <td className="px-3 py-2 text-right" style={idxStyle(evm.cpi)}>
                {fmtIdx(evm.cpi)}
              </td>
              <td className="px-3 py-2 text-right" style={idxStyle(evm.spi)}>
                {fmtIdx(evm.spi)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PilotageView;
```

> Note : `phaseProgressPct` n'est pas importé ici — `computeEvm` l'utilise en interne. Le composant n'importe que `computeEvm` et `indexStatus`.

- [ ] **Step 2 : Vérifier que `formatCurrency` est bien exporté**

Run: `npx rg "export function formatCurrency|export const formatCurrency" src/lib/costCalculations.js`
Expected: une correspondance. (BudgetTracker l'utilise déjà ; si le nom diffère, aligner l'import.)

- [ ] **Step 3 : Build + lint**

Run: `npm run build`
Expected: build OK.
Run: `npm run lint`
Expected: aucune nouvelle erreur sur `PilotageView.jsx`.

- [ ] **Step 4 : Commit**

```bash
git add src/components/PilotageView.jsx
git commit -m "feat(evm): PilotageView EVM dashboard (cards + per-phase table)"
```

---

## Task 6 : Brancher l'onglet « Pilotage » dans `ProjectView`

**Files:**

- Modify: `src/components/ProjectView.jsx`

- [ ] **Step 1 : Importer le composant et l'icône**

En tête de `src/components/ProjectView.jsx` :

- Ajouter : `import PilotageView from './PilotageView';`
- Ajouter `Target` à l'import existant depuis `lucide-react` (la ligne qui importe déjà `LayoutDashboard, Calendar, DollarSign, Briefcase, BarChart3, FileText, AlertTriangle, …`).

- [ ] **Step 2 : Ajouter l'onglet au tableau `TABS`**

Dans le tableau `TABS`, ajouter l'entrée « Pilotage » à la fin (après l'entrée `risks`), AVANT le `.filter((tab) => tab.showFor)` :

```javascript
  { id: 'pilotage', label: t('tab.pilotage'), icon: Target, showFor: !isTeamOnly },
```

de sorte que le tableau se termine par :

```javascript
  { id: 'risks', label: t('tab.risks'), icon: AlertTriangle, showFor: !isTeamOnly },
  { id: 'pilotage', label: t('tab.pilotage'), icon: Target, showFor: !isTeamOnly },
].filter((tab) => tab.showFor);
```

(Préserver les entrées existantes telles quelles ; n'ajouter que la ligne `pilotage`.)

- [ ] **Step 3 : Rendre le contenu de l'onglet**

Dans la section de rendu des onglets, après le bloc `{activeTab === 'risks' && ( ... )}` (ou à côté des autres blocs `activeTab === ...`), ajouter :

```javascript
{
  activeTab === 'pilotage' && <PilotageView project={project} rates={rates} />;
}
```

- [ ] **Step 4 : Vérifier build + lint**

Run: `npm run build`
Expected: build OK.
Run: `npm run lint`
Expected: aucune nouvelle erreur sur `ProjectView.jsx`.

- [ ] **Step 5 : Vérification manuelle (dev)**

Run: `npm run dev` (+ `node server/index.js` si besoin).
Vérifier :

1. Onglet « Pilotage » visible (dernier onglet, masqué pour les membres team-only).
2. Projet avec tâches + `startDate` → cartes EV/PV/AC, SPI/CPI (colorées), EAC/VAC remplies ; tableau par phase + ligne Total cohérente.
3. Passer une tâche en « Done » → EV augmente (SPI/CPI montent).
4. Projet sans `startDate` → PV et SPI affichent « — », le reste reste valide.
5. Projet sans tâches → message d'invite `evm.empty`.

- [ ] **Step 6 : Commit**

```bash
git add src/components/ProjectView.jsx
git commit -m "feat(evm): add Pilotage (EVM) project tab"
```

---

## Finalisation

- [ ] **Suite + lint**

Run: `npm run lint && npx vitest run`
Expected: tout vert (ignorer le flake serveur connu ; un re-run passe — cf. mémoire).

- [ ] **Pousser + PR**

```bash
git push -u origin feature/evm-pilotage
gh pr create --base main --title "feat(evm): Earned Value (EVM) Pilotage tab (chantier D)" --body "Voir docs/superpowers/specs/2026-06-01-baseline-evm-design.md. Chantier D du diagnostic de parité MS Project."
```

---

## Self-Review (couverture spec → plan)

| Exigence spec                                                                        | Tâche                                     |
| ------------------------------------------------------------------------------------ | ----------------------------------------- |
| §5 modèle EVM (BAC/PV linéaire/EV/AC, SPI/CPI/EAC/ETC/VAC)                           | Task 1 (`computeEvm`)                     |
| §5 dégradations (startDate absent, AC=0, PV=0)                                       | Task 1 (tests dédiés)                     |
| §6 rollup `getProjectProgress` (0/50/100 pondéré, split epic_phases)                 | Task 2                                    |
| §6 route `GET /progress` + client                                                    | Task 3                                    |
| §7 `evmCalculations` (phaseProgressPct, plannedValueToDate, indexStatus, computeEvm) | Task 1                                    |
| §7 `PilotageView` (cartes, tableau par phase, état vide, N/A en « — »)               | Task 5                                    |
| §7 onglet « Pilotage » dans ProjectView                                              | Task 6                                    |
| §8 tests (evmCalculations pur + getProjectProgress SQL)                              | Task 1, Task 2                            |
| §9 rétro-compat (additif, BudgetTracker inchangé)                                    | Tasks 2-6 (aucune modif de BudgetTracker) |

Hors périmètre confirmé (§4) : baseline figée, courbes temporelles, % manuel, EAC alternatifs, export.
