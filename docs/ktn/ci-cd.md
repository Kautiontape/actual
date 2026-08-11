# CI/CD + deploy

**Commit:** `ktn: ci-cd` (this file rides in it; revert the commit to drop the feature)
**What:** The fork's build-and-deploy pipeline. GitHub Actions builds the sync-server
image in the cloud and publishes it to GHCR; the deploy workflow authenticates to
GHCR and pull-deploys in place on the production host via the compose file under
`deploy/ktn/`, which the deploy workflow installs to the host before running
`docker compose pull && up -d`. Auto-deploy runs on `workflow_run` after a
successful build; docs-only pushes (`**.md`, `docs/ktn/**`) are excluded from
the build trigger, so a prose edit never redeploys production. A
separate job packs the fork's API package (workspace refs rewritten by
`.github/scripts/ktn-rewrite-api-manifest.mjs`) and publishes it as a rolling
GitHub Release, so external tooling can install the fork's API. `.ktn-base` records
the upstream release tag this branch is based on.
Upstream releases are adopted in three stages: `ktn-upstream-sync.yml` replays
the carried patches onto the new tag and opens a `sync/<tag>` PR,
`ktn-build-publish.yml` gates that branch on push, and `ktn-promote.yml` —
dispatched by hand — force-pushes the gated branch over `ktn`. See the runbook
below; the promote is the one manual step in the pipeline.
**Surface:** `.github/workflows/ktn-build-publish.yml`, `.github/workflows/ktn-deploy.yml`,
`.github/workflows/ktn-upstream-sync.yml`, `.github/workflows/ktn-promote.yml`,
`.github/scripts/ktn-rewrite-api-manifest.mjs`,
`deploy/ktn/docker-compose.yml`, `.ktn-base`,
`.gitignore` (ignore locally packed `packages/api/*.tgz`).
**Conflict history:** None with upstream — all files are ktn-only. The `.gitignore`
tail can collide with the dev-env entries during regroups.
**Upstream potential:** No — fork-specific infrastructure; never upstream.

## Runbook: adopting an upstream release

Everything up to "a green sync branch is waiting" happens on its own. Shipping
it is a deliberate manual step — the only human gate in the pipeline.

1. **Wait for the sync branch.** `ktn-upstream-sync.yml` runs Mondays at 13:00
   UTC (dispatchable, with a `dry_run` option). On a new upstream tag it
   replays the carried patches onto it, pushes `sync/<tag>`, and opens a PR.
2. **Never merge that PR.** It conflicts on `.ktn-base` by construction — both
   sides changed the marker from different bases — so the merge button is
   unusable, deliberately. Merging would weave both histories together and
   double every carried patch in the next sync's carry list. The PR exists to
   review the diff and hold the checks, nothing more.
3. **Wait for the gate to go green.** `ktn-build-publish.yml` triggers on push
   to `sync/**`, not on `pull_request` — GitHub never runs `pull_request`
   workflows on a conflicted PR, so a PR-triggered gate would silently never
   fire. The checks attach to the head SHA and still show on the PR. Both the
   build and `yarn typecheck` must pass.
4. **Dry-run the promote.** It verifies without pushing anything:
   `gh workflow run ktn-promote.yml -R Kautiontape/actual -f tag=v26.8.1 -f dry_run=true`
5. **Promote for real.** Same command without `dry_run`:
   `gh workflow run ktn-promote.yml -R Kautiontape/actual -f tag=v26.8.1`
   It re-verifies the checks, force-pushes `sync/<tag>` over `ktn` (replace,
   never merge), waits for GitHub's indirect-merge detection to mark the PR
   merged, then deletes the sync branch. The push to `ktn` runs the normal
   build → GHCR → `ktn-deploy` chain, so this deploys production.
6. **Reset local clones.** The promote rewrites `ktn`. Never `git pull` after
   one — it tries to merge two divergent stacks. Use
   `git fetch origin && git reset --hard origin/ktn`.

Dispatch the promote once and let it finish. Clicking it twice is caught (see
below), but the shared `fork-sync-${{ github.repository }}` concurrency group
is what actually prevents the two runs from racing into a double force-push.

### Promote refusals

Each is a guard firing before anything is pushed, in the order checked:

| Message                                               | Meaning                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unsafe tag: '<tag>'`                                 | The tag reaches git refs and shell strings; anything outside `[A-Za-z0-9._-]` is rejected.                                                                                                                                                             |
| `branch sync/<tag> not found ... records 'X'`         | No sync branch, and `.ktn-base` on `ktn` disagrees — typo'd tag, or the sync never ran. (Marker agrees → `already-promoted`, see below.)                                                                                                               |
| `.ktn-base on sync/<tag> reads 'X', expected '<tag>'` | That branch was built for a different tag. Wrong `tag` input.                                                                                                                                                                                          |
| `no check runs on ...`                                | The gate never fired — branch predates the push-triggered gate, was pushed with `github.token` (whose events never start workflow runs), or the last push to it was docs-only and therefore `paths-ignore`d. Re-run the build via `workflow_dispatch`. |
| `N check run(s) still in progress`                    | Gate not finished. Wait and re-dispatch.                                                                                                                                                                                                               |
| `not green: <job> -> <conclusion>`                    | The rebase broke something. Fix on the sync branch; `continue-on-error` jobs still report success and stay non-blocking.                                                                                                                               |

A refusal exits non-zero, and the `notify` job — which runs even when
`promote` fails — has no job outputs to read, so it falls back to a
high-priority `rotating_light` ntfy ping titled `<repo>: <tag> promote
FAILED`. It cannot say which guard fired; read the run log before treating one
as an incident.

Dispatching a promote for a tag that is already live is **not** a refusal. It
exits 0 with outcome `already-promoted` and a low-priority ping, on the
strength of `.ktn-base` on `ktn` already reading that tag. That case used to
page at full volume for what was really "already shipped".
