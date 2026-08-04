# Migration validation by id set

**Commit:** `ktn: migrations-idset` (this file rides in it; revert the commit to drop the feature)
**What:** `checkDatabaseValidity` used to compare applied migrations against the
available list positionally. When an upstream migration arrived whose id sorts
before a fork migration the database had already applied (e.g. upstream's
`1780606215001_add_performance_indexes.sql` vs the fork's
`1784000000000_saved_queries.js`), the positional prefix check failed and the
budget refused to load with `out-of-sync-migrations`. This change compares id
sets instead: a migration missing from the middle of the applied set is
recoverable (`getPending` selects by id and applies it on the next load), while
a database carrying migration ids this build does not know about is still
rejected — that downgrade guard is the part that actually protects data.
**Surface:** `packages/loot-core/src/server/migrate/migrations.ts`
(`checkDatabaseValidity`), `packages/loot-core/src/server/migrate/migrations.test.ts`.
**Conflict history:** None; the function is stable upstream.
**Upstream potential:** Prime candidate — it fixes a real footgun for anyone
carrying fork migrations, keeps the newer-version guard, and ships with tests.
