# UI Test Plan — Prism

Plan de test UI exhaustif pour Prism. Chaque scénario décrit un flux utilisateur, l'état pré-requis, les étapes, et la vérification. Utilisé par `scripts/screenshots/capture.mjs` pour générer automatiquement les captures README.

## Environnement

- **Dev local** : frontend Vite sur `http://localhost:5173` + backend Express sur `http://localhost:3000`
- **DB de test** : `DATA_DIR=./data-test` pour isoler du dev principal
- **Viewport** : `1440×900` (desktop standard, cadre README)
- **Thème** : light mode forcé
- **Compte de test** : `screenshots@test.local` / `TestPass123!`

## Fixture minimale

Pour couvrir tous les écrans sans vide visuel, le compte de test contient :

**Resources (pool capacity)** — 5 personnes :

1. Alice Tremblay — Développeur, Sénior (permanent, `level='Employé interne'`)
2. Benjamin Côté — Analyste d'affaires, Intermédiaire (permanent)
3. Claudia Nguyen — Architecte, Principal (consultant)
4. Daniel Martin — DevOps, Sénior (consultant)
5. Émilie Roy — Chargée de projet, Sénior (permanent)

**Projects** — 2 projets :

1. **Refonte portail client** — 3 phases (Discovery 4 sem, Build 12 sem, Launch 2 sem), budget 250 000 CAD, 4 risques, 2 milestones/phase
2. **Migration ERP** — 2 phases (Analyse 6 sem, Implémentation 16 sem), budget 500 000 CAD, 1 non-labour cost (licences)

**Assignments** — members + capacity assignments reliés pour peupler le Gantt.

**Transition plans** — 1 draft (Claudia → nouveau permanent, transition dans 6 mois, overlap 2 sem).

## Scénarios / screenshots

Chaque étape produit un fichier `docs/screenshots/NN-slug.png` référencé dans le README.

### 01-auth.png — Page d'authentification

- Naviguer `/` (non authentifié)
- Attendre rendering complet (logo Prism + wordmark + tagline visibles)
- Capturer

### 02-dashboard.png — Dashboard avec projets

- Login `screenshots@test.local`
- Naviguer `#/projects`
- Attendre que stats + liste des projets soient rendues
- Capturer

### 03-project-phases.png — Onglet Phases

- Naviguer `#/projects/{projet1.id}/phases`
- Attendre rendering des 3 PhaseEditors
- Scroll top
- Capturer

### 04-project-timeline.png — Onglet Timeline

- Naviguer `#/projects/{projet1.id}/timeline`
- Attendre rendering du Gantt + cost breakdown
- Capturer

### 05-project-budget.png — Onglet Budget

- Naviguer `#/projects/{projet1.id}/budget`
- Attendre rendering BudgetTracker + WebhookSettings + NonLabourCosts
- Capturer

### 06-project-charts.png — Onglet Charts

- Naviguer `#/projects/{projet1.id}/charts`
- Attendre rendering PieChart + BarChart (vue par rôle)
- Capturer

### 07-project-summary.png — Onglet Sommaire

- Naviguer `#/projects/{projet1.id}/summary`
- Attendre rendering rapport complet
- Capturer

### 08-project-risks.png — Onglet Risques

- Naviguer `#/projects/{projet1.id}/risks`
- Attendre rendering RiskRegister (matrix + table)
- Capturer

### 09-capacity-resources.png — Pool de ressources

- Naviguer `#/capacity/resources`
- Attendre rendering table des 5 ressources avec badges type
- Capturer

### 10-capacity-gantt.png — Gantt 12 mois

- Naviguer `#/capacity/gantt`
- Attendre rendering grid + barres d'assignments + UtilizationSummary
- Capturer

### 11-capacity-transitions.png — Plans de transition

- Naviguer `#/capacity/transitions`
- Attendre rendering TransitionList avec 1 plan draft
- Capturer

### 12-capacity-rates.png — Rates enterprise

- Naviguer `#/capacity/rates`
- Attendre rendering RolesRatesManager (internal rate + table consultant)
- Capturer

### 13-profile.png — Profil utilisateur

- Naviguer `#/profile`
- Attendre rendering identity header + ApiKeysView
- Capturer

## Cleanup

Le script `capture.mjs` :

- Crée le compte de test s'il n'existe pas, sinon se connecte
- Wipe + re-seed les fixtures à chaque run (idempotent)
- Laisse le dev server tourner (géré par l'utilisateur)
- Produit les 13 screenshots dans `docs/screenshots/`

## Prochain pas

Régression visuelle : diff pixel-par-pixel contre une baseline checked-in (outil : `pixelmatch` ou similaire). Hors scope du premier PR.
