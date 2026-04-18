# Security Policy

## Supported versions

Only the latest version on `main` receives security updates.

## Reporting a vulnerability

**Please do not open public issues for security vulnerabilities.**

Instead, report them privately to: **valiquette.daniel@gmail.com**

Include :
- A description of the issue
- Steps to reproduce
- The version / commit SHA affected
- Any proof-of-concept (if applicable)

You can expect :
- An acknowledgment within 72 hours
- A timeline for a fix within 7 days
- Credit in the release notes (unless you prefer to remain anonymous)

## Security considerations for self-hosters

- Set a strong `JWT_SECRET` in production (never use the default `change-me-in-production`)
- Use HTTPS (e.g., behind nginx-proxy-manager / Caddy / Cloudflare)
- Restrict `PUBLIC_API_ALLOWED_ORIGINS` to known domains only
- API keys are hashed SHA-256 and cannot be recovered — users must generate new ones if lost
- The webhook SSRF protection blocks internal IP ranges; do not disable it
- See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development best practices
