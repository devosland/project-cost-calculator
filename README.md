# Planificateur - Project Cost Calculator

A full-featured project planning and budgeting tool built with React and Express. Estimate costs across phases, roles, and currencies, then share, compare, and report.

**Live:** [calculateur.danielvaliquette.com](https://calculateur.danielvaliquette.com)

## Features

### Project Management
- Multi-project dashboard with create, duplicate, rename, import/export (JSON & CSV)
- Phase-based planning with team allocation, duration, and milestones
- Gantt-style timeline with week markers and cost breakdown table
- Scenario comparison across 2+ projects (side-by-side metrics)

### Budgeting & Costs
- Per-role hourly rates with 5 experience levels (internal, junior to expert)
- Budget tracking with progress bar and variance analysis
- Non-labour cost categories (infrastructure, licenses, SaaS, travel, etc.)
- Multi-currency support: CAD, USD, EUR, GBP with locale-aware formatting
- Contingency percentage and Quebec tax (4.9875%) toggles

### Collaboration
- User accounts with email/password authentication (JWT)
- Project sharing by email with viewer/editor roles
- Project templates — save and reuse project structures
- Version history with named snapshots and restore

### Reporting & Visualization
- SVG pie charts and CSS bar charts (by role, phase, or category)
- Printable one-page project summary report
- Dashboard-level metrics: cost, duration, phases, team size

### UX
- Dark mode with system preference detection
- Auto-save indicator in header
- Responsive layout for mobile and desktop
- French-language interface

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS 3, Radix UI, Lucide icons |
| Backend | Node.js, Express 4 |
| Database | SQLite (better-sqlite3, WAL mode) |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Build | Vite 5 |
| Deploy | Docker (multi-stage), Nginx Proxy Manager |

## Project Structure

```
src/
  App.jsx                    # Root — auth, routing, state, API sync
  lib/
    api.js                   # API client (auth, projects, templates, snapshots)
    costCalculations.js      # All cost formulas, currencies, formatting
    projectStore.js          # Project/phase factories, export/import helpers
  components/
    AuthPage.jsx             # Login / register / password reset
    Dashboard.jsx            # Project list, compare mode, actions
    ProjectView.jsx          # Tabbed project editor (6 tabs)
    PhaseEditor.jsx          # Phase: team, duration, milestones
    TimelineView.jsx         # Gantt chart + cost table
    BudgetTracker.jsx        # Budget progress, burn rate, breakdown
    NonLabourCosts.jsx       # Non-labour cost items by category
    CostCharts.jsx           # Pie + bar charts (role/phase/category)
    ProjectSummary.jsx       # Printable report
    ScenarioComparison.jsx   # Side-by-side project comparison
    RolesRatesManager.jsx    # Rate table editor
    TemplateManager.jsx      # Save/load project templates
    ShareDialog.jsx          # Share project by email
    VersionHistory.jsx       # Snapshot list with restore
    SaveIndicator.jsx        # Saving/Saved/Error status
    ThemeToggle.jsx          # Dark mode toggle
    ui/                      # Primitives: Button, Card, Switch, Label, Dropdown
  config/rates/              # Rate configuration (demo + prod template)
server/
  index.js                   # Express entry — static + API + SPA fallback
  db.js                      # SQLite schema, migrations, all queries
  auth.js                    # Register, login, password reset routes
  data.js                    # Bulk data sync (legacy + new project table)
  projects.js                # Project CRUD, sharing, snapshots routes
  templates.js               # Template CRUD routes
  middleware.js              # JWT auth middleware
```

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Local Development

```bash
# Install frontend dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Start the backend (port 3000)
node server/index.js &

# Start the frontend dev server (port 5173, proxies /api to :3000)
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` requests to the Express backend.

### Production Rates

To use custom rates instead of demo values:

1. Copy `src/config/rates/rates.prod.template.js` to `src/config/rates/rates.prod.js`
2. Edit with your actual hourly rates
3. `rates.prod.js` is gitignored

### Docker

```bash
# Build and run
docker build -t project-cost-calculator .
docker run -d -p 3002:80 \
  -v pcc-data:/data \
  -e JWT_SECRET=your-secret-here \
  project-cost-calculator

# Or with docker-compose (requires .env with APP_SLUG, APP_DOMAIN, JWT_SECRET)
docker compose up -d
```

The Docker image builds the frontend with Vite, then runs the Express server which serves both the API and the static files. SQLite data is persisted in the `/data` volume.

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `80` | Server listen port |
| `JWT_SECRET` | `change-me-in-production` | Secret for signing JWT tokens |
| `DATA_DIR` | `/data` | Directory for SQLite database file |
| `NODE_ENV` | — | Set to `production` in Docker |

## API Reference

All endpoints except auth require `Authorization: Bearer <token>` header.

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account (email, name, password) |
| POST | `/api/auth/login` | Login (email, password) |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/forgot-password` | Request reset token |
| POST | `/api/auth/reset-password` | Reset password (token, password) |

### Data (legacy bulk sync)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/data` | Load all projects + rates |
| PUT | `/api/data` | Save all projects + rates |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | List accessible projects |
| POST | `/api/projects` | Create project |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project (owner only) |
| POST | `/api/projects/:id/share` | Share with user (email, role) |
| DELETE | `/api/projects/:id/share/:userId` | Remove share |
| GET | `/api/projects/:id/shares` | List shares |
| GET | `/api/projects/:id/snapshots` | List version snapshots |
| POST | `/api/projects/:id/snapshots` | Create snapshot |
| POST | `/api/projects/snapshots/:id/restore` | Restore snapshot |

### Templates
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/templates` | List user templates |
| POST | `/api/templates` | Create template (name, data) |
| DELETE | `/api/templates/:id` | Delete template |

## License

Private repository.
