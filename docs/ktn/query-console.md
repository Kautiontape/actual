# Query Console

**Commit:** `ktn: query-console` (this file rides in it; revert the commit to drop the feature)
**What:** A pipeline-DSL query page under Reports, gated behind the
`queryConsole` feature flag. Queries are written in a small pipeline language
(CodeMirror editor with highlighting, autocomplete, and linting via
`@codemirror/lint`), parsed by `parse.ts` and executed by `run.ts` against AQL.
Includes budgets-table support via a synthetic source with pure row-assembly
helpers (`budgets.ts`), month/year grouping fixes, a resizable editor, and a
mobile-nav fix so the Settings tab is not hidden when the Query tab is enabled.
**Surface:** `packages/desktop-client/src/components/reports/queryConsole/`
(`QueryConsole.tsx`, `QueryEditor.tsx`, `codeMirror-queryLanguage.ts`,
`parse.ts`, `run.ts`, `budgets.ts`, + tests), route in
`packages/desktop-client/src/components/FinancesApp.tsx`, sidebar entry in
`PrimaryButtons.tsx`, mobile nav in `MobileNavTabs.tsx`, `queryConsole` feature
flag (`prefs.ts`, `useFeatureFlag.ts`, `Experimental.tsx`),
`@codemirror/lint` dependency in `packages/desktop-client/package.json` + `yarn.lock`.
**Conflict history:** The flag registration points (`prefs.ts`,
`useFeatureFlag.ts`, `Experimental.tsx`) and `package.json`/`yarn.lock`
conflicted on this rebuild onto v26.8.0 and will again on every sync where
upstream adds flags or bumps deps — the anchor commit mitigates this.
**Upstream potential:** No — this is fork identity; upstream has its own
reporting direction.
