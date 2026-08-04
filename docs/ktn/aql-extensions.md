# AQL extensions

**Commit:** `ktn: aql-extensions` (this file rides in it; revert the commit to drop the feature)
**What:** Extensions to the Query Console's query language: `first`/`last`
aggregates for most-recent-per-group queries, account `open`/`closed` filter
fields, and per-aggregate `where` clauses (filtered aggregates, e.g. "latest
transaction that is a payment"). Implemented in the console's own parse/execute
layer on top of AQL — loot-core's AQL compiler is not modified.
**Surface:** `packages/desktop-client/src/components/reports/queryConsole/parse.ts`,
`packages/desktop-client/src/components/reports/queryConsole/run.ts` (+
`run.test.ts`), documented in
`packages/desktop-client/src/components/reports/queryConsole/queryLanguageReference.ts`.
**Conflict history:** None — the files are fork-only. Note the ordering
dependency: this commit edits files created by the query-console and
saved-queries commits, so it must stay after both.
**Upstream potential:** Only as part of a real AQL feature (the concepts —
filtered aggregates, first/last — could be proposed against loot-core's AQL,
but this implementation is tied to the fork's console).
