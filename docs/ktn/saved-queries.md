# Saved Queries

**Commit:** `ktn: saved-queries` (this file rides in it; revert the commit to drop the feature)
**What:** Persistence and management for Query Console queries. Adds a
`saved_queries` table (JS migration `1784000000000_saved_queries.js`) with an
AQL schema entry, server CRUD handlers (`loot-core/src/server/queryConsole/app.ts`),
shared helpers, and a client layer: a SavedQueriesBar on the console, a manager
view with a nested-tree modal for organizing queries, sidebar entries, and an
in-app query-language reference page.
**Surface:** `packages/loot-core/migrations/1784000000000_saved_queries.js`,
`packages/loot-core/src/server/queryConsole/app.ts`, AQL schema entry in
`packages/loot-core/src/server/aql/schema/index.ts`, `javascriptMigrations`
entry in `packages/loot-core/src/server/migrate/migrations.ts`, handler/model
types (`handlers.ts`, `models/savedQuery.ts`), shared helpers in
`packages/loot-core/src/shared/savedQueries.ts` (+ tests); client:
`SavedQueriesBar.tsx`, `SavedQueriesManager.tsx`, `QueryReference.tsx`,
`queryLanguageReference.ts`, `savedQueries.ts`, `savedQueryMutations.ts`,
`SavedQueriesModal.tsx`, `modalsSlice.ts`, `Modals.tsx`, routes in
`FinancesApp.tsx`, sidebar in `PrimaryButtons.tsx`.
**Conflict history:** The migration id sorting after upstream's newer migrations
once bricked budget loading via the positional validity check — fixed by the
migrations-idset patch. Registration points (`modalsSlice.ts`, `Modals.tsx`,
`FinancesApp.tsx`, AQL schema) are recurring sync friction.
**Upstream potential:** No — depends on Query Console, which stays fork-only.
