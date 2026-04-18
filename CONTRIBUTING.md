# Contributing to Project Cost Calculator

Thanks for your interest in contributing! This is a personal project but contributions and feedback are welcome.

## Development setup

1. Clone the repo and install dependencies :
   ```bash
   git clone https://github.com/devosland/project-cost-calculator.git
   cd project-cost-calculator
   npm install
   cd server && npm install && cd ..
   ```

2. Copy `.env.example` to `.env` and adjust values as needed.

3. Start the dev server :
   ```bash
   npm run dev
   ```

4. Run tests :
   ```bash
   npx vitest run
   ```

## Workflow

- **Never push directly to `main`**. All changes go through a pull request.
- Branch from `main` with a descriptive name: `feature/...`, `fix/...`, `docs/...`, `chore/...`.
- Keep PRs focused — one logical change per PR.
- Follow Conventional Commits for commit messages (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`).

## Code style

- **JSDoc** on all exported functions
- **File headers** describing module responsibility
- **"Why" comments** on non-obvious logic — not "what" (the code already says what)
- **TDD** encouraged for server-side work (`server/__tests__/`)
- ESLint must pass (`npm run lint`)

## Architecture

- Frontend : React 18 + Vite + Tailwind CSS
- Backend : Express 4 + better-sqlite3 (SQLite)
- i18n : custom provider (FR/EN)
- Routing : hash-based (`#/projects/:id/...`)

See [`README.md`](README.md) for full architecture overview and [`docs/integration-api-roadmap.md`](docs/integration-api-roadmap.md) for the public API.

## Reporting issues

- Use GitHub Issues with the bug or feature template
- Security vulnerabilities : see [`SECURITY.md`](SECURITY.md)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
