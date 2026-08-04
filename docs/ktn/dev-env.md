# Dev environment

**Commit:** `ktn: dev-env` (this file rides in it; revert the commit to drop the feature)
**What:** Local development conveniences. Adds gitignore entries for local
agent/tool scratch output (`.playwright-mcp/`, `/docs/superpowers/`) and allows
the dev tunnel host (`.lhr.kautiontape.com`) in the Vite dev server's
`allowedHosts` so the app can be opened through the tunnel during development.
**Surface:** `.gitignore`, `packages/desktop-client/vite.config.mts`
(`server.allowedHosts`).
**Conflict history:** The `.gitignore` tail collides with the ci-cd entries
during regroups; upstream rarely touches either spot.
**Upstream potential:** No — machine/user-specific; never upstream.
