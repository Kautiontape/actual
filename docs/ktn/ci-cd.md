# CI/CD + deploy

**Commit:** `ktn: ci-cd` (this file rides in it; revert the commit to drop the feature)
**What:** The fork's build-and-deploy pipeline. GitHub Actions builds the sync-server
image in the cloud and publishes it to GHCR; the deploy workflow authenticates to
GHCR and pull-deploys in place on the production host via the compose file under
`deploy/ktn/`, which the deploy workflow installs to the host before running
`docker compose pull && up -d`. Auto-deploy runs on `workflow_run` after a
successful build. A
separate job packs the fork's API package (workspace refs rewritten by
`.github/scripts/ktn-rewrite-api-manifest.mjs`) and publishes it as a rolling
GitHub Release, so external tooling can install the fork's API. `.ktn-base` records
the upstream release tag this branch is based on.
**Surface:** `.github/workflows/ktn-build-publish.yml`, `.github/workflows/ktn-deploy.yml`,
`.github/workflows/ktn-upstream-sync.yml`, `.github/scripts/ktn-rewrite-api-manifest.mjs`,
`deploy/ktn/docker-compose.yml`, `.ktn-base`,
`.gitignore` (ignore locally packed `packages/api/*.tgz`).
**Conflict history:** None with upstream — all files are ktn-only. The `.gitignore`
tail can collide with the dev-env entries during regroups.
**Upstream potential:** No — fork-specific infrastructure; never upstream.
