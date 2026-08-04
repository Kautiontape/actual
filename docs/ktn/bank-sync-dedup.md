# Bank-sync duplicate collapse

**Commit:** `ktn: bank-sync-dedup` (this file rides in it; revert the commit to drop the feature)
**What:** During bank sync, a provider can return the same transaction twice in
one batch — once as pending and once as booked. This change collapses such
same-batch pending/booked duplicates before import, so the register does not end
up with a pending row that never reconciles against its booked twin.
**Surface:** `packages/loot-core/src/server/accounts/sync.ts` (+ tests in
`sync.test.ts`).
**Conflict history:** None so far — the change is localized in loot-core sync
code that upstream touches infrequently.
**Upstream potential:** Strong candidate — it fixes a real import annoyance with
tests attached; a PR would mainly need review of the matching heuristic.
