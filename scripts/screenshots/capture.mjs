/**
 * UI screenshot automation — implements docs/ui-test-plan.md.
 *
 * Flow per run:
 *   1. Assumes dev servers are running (vite :5173, Express :3000 — see
 *      scripts/screenshots/README.md for startup instructions).
 *   2. Registers (or logs in to) the dedicated screenshots test account.
 *   3. Wipes any stale fixture data then re-seeds a deterministic dataset so
 *      the screenshots are reproducible run-to-run.
 *   4. Launches headless Chromium at 1440×900, forces light mode via
 *      localStorage, walks the test plan routes, and saves PNGs to
 *      docs/screenshots/.
 *
 * Idempotency: re-running the script deletes the previous resources,
 * assignments, transitions, and projects under the test user before reseeding,
 * so the output is always the same regardless of prior runs.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(repoRoot, 'docs/screenshots');

// Ports chosen to avoid collisions with common dev services (uvicorn on 3000,
// alt Python stacks on 8000, etc.). Matches the env vars used in
// scripts/screenshots/README.md for the two dev servers.
const API_BASE = (process.env.SCREENSHOTS_API_BASE || 'http://localhost:3099/api');
const APP_BASE = (process.env.SCREENSHOTS_APP_BASE || 'http://localhost:5173');
const VIEWPORT = { width: 1440, height: 900 };

const TEST_USER = {
  email: 'screenshots@test.local',
  name: 'Demo User',
  password: 'TestPass123!',
};

mkdirSync(OUT_DIR, { recursive: true });

// ───── API helpers ─────────────────────────────────────────────────────────

let authToken = null;

/** Thin wrapper around fetch that adds the bearer token and parses JSON. */
async function apiCall(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const msg = body?.error || `HTTP ${res.status}`;
    throw new Error(`${options.method || 'GET'} ${path} → ${msg}`);
  }
  return body;
}

/** Log in if the account exists, otherwise register. Returns JWT. */
async function loginOrRegister() {
  try {
    const res = await apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: TEST_USER.email, password: TEST_USER.password }),
    });
    authToken = res.token;
    console.log(`  ✓ logged in as ${TEST_USER.email}`);
  } catch {
    const res = await apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(TEST_USER),
    });
    authToken = res.token;
    console.log(`  ✓ registered ${TEST_USER.email}`);
  }
}

/** Delete every resource, assignment, transition, and project owned by the
    test user so re-runs produce identical output. */
async function wipeFixtures() {
  const resources = await apiCall('/capacity/resources');
  for (const r of resources || []) {
    await apiCall(`/capacity/resources/${r.id}`, { method: 'DELETE' });
  }
  const transitions = await apiCall('/capacity/transitions');
  for (const tr of transitions || []) {
    await apiCall(`/capacity/transitions/${tr.id}`, { method: 'DELETE' });
  }
  const projects = await apiCall('/projects');
  for (const p of projects || []) {
    await apiCall(`/projects/${p.id}`, { method: 'DELETE' });
  }
  console.log(`  ✓ wiped stale fixtures`);
}

/** Short random id in the project/phase format used by the app. */
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Seed a reproducible fixture: 5 resources, 2 projects, 1 transition plan. */
async function seed() {
  // --- Resources ---
  const resourceSeeds = [
    { name: 'Alice Tremblay',   role: 'Développeur',         level: 'Sénior',        max_capacity: 100 },
    { name: 'Benjamin Côté',    role: 'Analyste d\'affaires', level: 'Intermédiaire', max_capacity: 100 },
    { name: 'Claudia Nguyen',   role: 'Architecte',          level: 'Principal',     max_capacity: 80  },
    { name: 'Daniel Martin',    role: 'DevOps',              level: 'Sénior',        max_capacity: 100 },
    { name: 'Émilie Roy',       role: 'Chargée de projet',   level: 'Sénior',        max_capacity: 100 },
  ];
  const permanentsIdx = [0, 1, 4]; // Alice, Benjamin, Émilie → 'Employé interne'
  const resources = [];
  for (let i = 0; i < resourceSeeds.length; i++) {
    const body = { ...resourceSeeds[i] };
    // Internal Employees use the canonical 'Employé interne' level (the app
    // derives the Permanent/Consultant badge from this field).
    if (permanentsIdx.includes(i)) body.level = 'Employé interne';
    const r = await apiCall('/capacity/resources', { method: 'POST', body: JSON.stringify(body) });
    resources.push(r);
  }

  // --- Projects ---
  const startMonth = nextMonthStr(0);
  const projectA = {
    id: genId(),
    name: 'Refonte portail client',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      includeContingency: true,
      contingencyPercentage: 10,
      includeTaxes: false,
      currency: 'CAD',
      startDate: startMonth,
      budgetAlertThreshold: 80,
    },
    budget: 250000,
    nonLabourCosts: [],
    phases: [
      {
        id: genId(), name: 'Discovery', durationWeeks: 4, order: 0,
        teamMembers: [
          { role: 'Analyste d\'affaires', level: 'Employé interne', quantity: 1, allocation: 100, resourceId: resources[1].id, resourceName: resources[1].name },
          { role: 'Architecte',           level: 'Principal',       quantity: 1, allocation: 50,  resourceId: resources[2].id, resourceName: resources[2].name },
        ],
        milestones: [
          { id: genId(), name: 'Kickoff',   weekOffset: 1 },
          { id: genId(), name: 'Findings',  weekOffset: 4 },
        ],
      },
      {
        id: genId(), name: 'Build', durationWeeks: 12, order: 1,
        teamMembers: [
          { role: 'Développeur', level: 'Sénior',          quantity: 2, allocation: 100, resourceId: resources[0].id, resourceName: resources[0].name },
          { role: 'Architecte',  level: 'Principal',       quantity: 1, allocation: 50,  resourceId: resources[2].id, resourceName: resources[2].name },
          { role: 'DevOps',      level: 'Sénior',          quantity: 1, allocation: 50,  resourceId: resources[3].id, resourceName: resources[3].name },
        ],
        milestones: [
          { id: genId(), name: 'MVP',       weekOffset: 6 },
          { id: genId(), name: 'Beta',      weekOffset: 10 },
        ],
      },
      {
        id: genId(), name: 'Launch', durationWeeks: 2, order: 2,
        teamMembers: [
          { role: 'DevOps',             level: 'Sénior',        quantity: 1, allocation: 100, resourceId: resources[3].id, resourceName: resources[3].name },
          { role: 'Chargée de projet',  level: 'Employé interne', quantity: 1, allocation: 50,  resourceId: resources[4].id, resourceName: resources[4].name },
        ],
        milestones: [
          { id: genId(), name: 'Go-live',   weekOffset: 2 },
        ],
      },
    ],
    risks: [
      { id: genId(), name: 'Intégration tierce retardée', description: '', probability: 3, impact: 4, phase: 'Build',     mitigation: 'POC tôt, buffer de 2 sem.' },
      { id: genId(), name: 'Adoption utilisateur faible', description: '', probability: 2, impact: 5, phase: 'Launch',    mitigation: 'Formation + support post-lancement.' },
      { id: genId(), name: 'Scope creep',                 description: '', probability: 4, impact: 3, phase: 'Discovery', mitigation: 'Comité de pilotage hebdo.' },
      { id: genId(), name: 'Départ ressource clé',        description: '', probability: 2, impact: 4, phase: 'Build',     mitigation: 'Partage de connaissances.' },
    ],
  };

  const projectB = {
    id: genId(),
    name: 'Migration ERP',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings: {
      includeContingency: true,
      contingencyPercentage: 15,
      includeTaxes: true,
      currency: 'CAD',
      startDate: startMonth,
      budgetAlertThreshold: 80,
    },
    budget: 500000,
    nonLabourCosts: [
      { id: genId(), name: 'Licences SAP',   category: 'Licences', amount: 45000 },
      { id: genId(), name: 'Infra AWS',      category: 'Infrastructure', amount: 12000 },
    ],
    phases: [
      {
        id: genId(), name: 'Analyse', durationWeeks: 6, order: 0,
        teamMembers: [
          { role: 'Analyste d\'affaires', level: 'Employé interne', quantity: 1, allocation: 100, resourceId: resources[1].id, resourceName: resources[1].name },
          { role: 'Architecte',           level: 'Principal',       quantity: 1, allocation: 80,  resourceId: resources[2].id, resourceName: resources[2].name },
        ],
        milestones: [{ id: genId(), name: 'Rapport d\'analyse', weekOffset: 6 }],
      },
      {
        id: genId(), name: 'Implémentation', durationWeeks: 16, order: 1,
        teamMembers: [
          { role: 'Développeur', level: 'Sénior',          quantity: 3, allocation: 100, resourceId: resources[0].id, resourceName: resources[0].name },
          { role: 'DevOps',      level: 'Sénior',          quantity: 1, allocation: 80,  resourceId: resources[3].id, resourceName: resources[3].name },
        ],
        milestones: [
          { id: genId(), name: 'Sandbox prêt',  weekOffset: 4 },
          { id: genId(), name: 'Recette',       weekOffset: 14 },
        ],
      },
    ],
    risks: [],
  };

  // Projects + rates are saved via the bulk /data endpoint (same path the
  // client's api.saveData uses). Default rates come from getRatesConfig in
  // the client, but since we're bypassing the client we pass a minimal
  // explicit rate table that covers the roles used in the seed.
  const rates = {
    INTERNAL_RATE: 75,
    CONSULTANT_RATES: {
      'Développeur':           { 'Junior': 90, 'Intermédiaire': 110, 'Sénior': 140, 'Principal': 170 },
      'Analyste d\'affaires':  { 'Junior': 85, 'Intermédiaire': 105, 'Sénior': 130, 'Principal': 160 },
      'Architecte':            { 'Junior': 110, 'Intermédiaire': 140, 'Sénior': 175, 'Principal': 210 },
      'DevOps':                { 'Junior': 95, 'Intermédiaire': 120, 'Sénior': 150, 'Principal': 180 },
      'Chargée de projet':     { 'Junior': 80, 'Intermédiaire': 100, 'Sénior': 125, 'Principal': 150 },
    },
  };
  await apiCall('/data', {
    method: 'PUT',
    body: JSON.stringify({ projects: [projectA, projectB], rates }),
  });

  // --- Assignments (capacity Gantt links) ---
  // Link each resourceId mentioned in the project phases to an assignment so
  // the Gantt has bars to draw.
  for (const proj of [projectA, projectB]) {
    let weekOffset = 0;
    for (const ph of proj.phases) {
      for (const m of ph.teamMembers) {
        if (!m.resourceId) continue;
        const sm = nextMonthStr(Math.floor(weekOffset / 4));
        const em = nextMonthStr(Math.floor((weekOffset + ph.durationWeeks - 1) / 4));
        try {
          await apiCall('/capacity/assignments', {
            method: 'POST',
            body: JSON.stringify({
              resource_id: m.resourceId,
              project_id: proj.id,
              phase_id: ph.id,
              allocation: m.allocation,
              start_month: sm,
              end_month: em,
            }),
          });
        } catch {
          // Ignore 409 (assignment exists) — idempotent.
        }
      }
      weekOffset += ph.durationWeeks;
    }
  }

  // --- Transition plan (draft) ---
  // Claudia Nguyen (consultant, Architecte/Principal) → new permanent hire.
  const claudia = resources[2];
  await apiCall('/capacity/transitions', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Internalisation Architecte',
      status: 'draft',
      data: {
        transitions: [
          {
            id: 'tr-' + genId(),
            consultant_resource_id: claudia.id,
            replacement_resource_id: null,
            transition_date: nextMonthStr(6),
            overlap_weeks: 2,
          },
        ],
      },
    }),
  });

  console.log(`  ✓ seeded 5 resources, 2 projects, 1 transition plan`);
  return { resources, projectA, projectB };
}

/** Returns a 'YYYY-MM' string for (now + offset months). */
function nextMonthStr(offsetMonths) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ───── Playwright capture ──────────────────────────────────────────────────

async function capture({ projectA }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  // Force light mode before any app JS runs. NOTE: we deliberately do NOT
  // pre-set auth_token here — we need the first capture to show the
  // unauthenticated AuthPage. Token is injected + page is reloaded *after*
  // the auth screenshot, so App.jsx re-mounts and sees the token.
  await page.addInitScript(() => {
    localStorage.setItem('theme', 'light');
  });

  // Step 1 — AuthPage (unauthenticated state).
  await page.goto(APP_BASE);
  await waitStable(page);
  await shot(page, '01-auth');

  // Log the user in for the rest of the captures. Reload is required because
  // App.jsx checks auth_token on mount only — setting it post-mount doesn't
  // retrigger the auth check.
  await page.evaluate((token) => localStorage.setItem('auth_token', token), authToken);
  await page.reload();
  await waitStable(page);

  const steps = [
    // Dashboard (already at root after reload; navigate via hash for consistency).
    ['02-dashboard',             '#/projects'],
    ['03-project-phases',        `#/projects/${projectA.id}/phases`],
    ['04-project-timeline',      `#/projects/${projectA.id}/timeline`],
    ['05-project-budget',        `#/projects/${projectA.id}/budget`],
    ['06-project-charts',        `#/projects/${projectA.id}/charts`],
    ['07-project-summary',       `#/projects/${projectA.id}/summary`],
    ['08-project-risks',         `#/projects/${projectA.id}/risks`],
    ['09-capacity-resources',    '#/capacity/resources'],
    ['10-capacity-gantt',        '#/capacity/gantt'],
    ['11-capacity-transitions',  '#/capacity/transitions'],
    ['12-capacity-rates',        '#/capacity/rates'],
    ['13-profile',               '#/profile'],
  ];
  for (const [slug, hash] of steps) {
    // Set the hash then force a reload. Reload is required because
    // ProjectView's `activeTab` state is initialised from the `initialTab`
    // prop only at mount — hash-change alone updates the route segments but
    // the mounted ProjectView ignores them (tab state is owned internally).
    // Reload causes a fresh mount with the new initialTab derived from the
    // URL, so each tab captures the expected view.
    await page.evaluate((h) => { window.location.hash = h; }, hash);
    await page.reload();
    await waitStable(page);
    await shot(page, slug);
  }

  await browser.close();
}

/** Wait for the app to finish rendering. `networkidle` alone isn't sufficient
    because React's initial data-fetch + font loading both continue past the
    first idle window. We additionally wait for a content-bearing element
    inside #root to appear and then give fonts/animations a final settle tick. */
async function waitStable(page) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  // Wait until the app has actually rendered something meaningful (not just
  // the empty #root div from index.html).
  await page.waitForFunction(() => {
    const root = document.querySelector('#root');
    if (!root) return false;
    const html = root.innerHTML;
    return html.length > 200;
  }, { timeout: 10000 }).catch(() => {});
  // Wait for variable fonts to finish loading (Fraunces/DM Sans) so text is
  // laid out at final width before capture.
  await page.evaluate(() => document.fonts ? document.fonts.ready : null).catch(() => {});
  // Final settle for React post-data-fetch rerenders and any CSS transitions.
  await page.waitForTimeout(1500);
}

async function shot(page, slug) {
  const outPath = path.join(OUT_DIR, `${slug}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  ✓ ${slug}.png`);
}

// ───── Entrypoint ──────────────────────────────────────────────────────────

async function main() {
  console.log('Prism screenshots — start\n');
  console.log('→ auth');
  await loginOrRegister();
  console.log('→ wipe');
  await wipeFixtures();
  console.log('→ seed');
  const fixture = await seed();
  console.log('→ capture');
  await capture(fixture);
  console.log('\nDone. Screenshots in docs/screenshots/');
}

main().catch((err) => {
  console.error('\n✗ capture failed:', err.message);
  process.exit(1);
});
