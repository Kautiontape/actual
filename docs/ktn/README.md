# Carried patches (ktn fork)

This fork = upstream release tag (see `.ktn-base`) + the feature commits listed
below, one commit per feature, each carrying its own doc in this directory.
To drop a feature: `git revert <its commit>` — code and doc leave together.
To upstream one: its commit is a self-contained diff; start from its doc.
Sync automation: `.github/workflows/ktn-upstream-sync.yml` — weekly Monday
check via the Kautiontape/fork-sync reusable workflow (rebase mode); manual
dispatch with a dry-run option also available. It opens a `sync/<tag>` PR,
which is **never merged with the merge button** — rebase-mode syncs conflict
on `.ktn-base` by construction, and merging would double every carried patch
in the next sync. Ship it by dispatching `ktn-promote.yml` instead, which
force-pushes the gated branch over `ktn`. Full runbook in [ci-cd.md](ci-cd.md).
A cross-cutting "anchor registration points" commit keeps ktn entries at
end-of-list in upstream registries — the feature-flag registries, the ktn
synced-pref keys, and the saved-queries modal registrations — to minimize
conflicts.

Revert caveats (tested at this base): reconcile-helpers, bank-sync-dedup,
register-addnew-fix, migrations-idset, aql-extensions, saved-queries (within
the reverse-order sequence below), and dev-env revert cleanly. The query stack
must be dropped in reverse order (aql-extensions → saved-queries →
query-console); reverting query-console hits small conflicts in the flag
registries (`useFeatureFlag.ts`, `prefs.ts`) plus the lockfile — rerun
`yarn install` afterwards. Small context conflicts also hit hide-toolbar
(`Header.tsx`), net-worth-exclusion (`Header.tsx`, `prefs.ts`), and
record-payment (`prefs.ts` — its `payment-source-` key was relocated by the
anchor commit).

| Feature                                   | Doc                    |
| ----------------------------------------- | ---------------------- |
| CI/CD + deploy                            | ci-cd.md               |
| Hide scheduled/reconciled toolbar toggles | hide-toolbar.md        |
| Exclude accounts from net worth           | net-worth-exclusion.md |
| Reconcile helpers                         | reconcile-helpers.md   |
| Record Payment                            | record-payment.md      |
| Bank-sync duplicate collapse              | bank-sync-dedup.md     |
| Add New press-event fix                   | register-addnew-fix.md |
| Migration validation by id set            | migrations-idset.md    |
| AQL extensions                            | aql-extensions.md      |
| Query Console                             | query-console.md       |
| Saved Queries                             | saved-queries.md       |
| Dev environment                           | dev-env.md             |
