# Exclude accounts from net worth

**Commit:** `ktn: net-worth-exclusion` (this file rides in it; revert the commit to drop the feature)
**What:** A per-account "Exclude from net worth" toggle in the account ⋯ menu,
stored as the synced pref `exclude-from-net-worth-${accountId}`. Flagged accounts
are filtered out of the Net Worth report and out of the sidebar All accounts /
On budget / Off budget totals. The sidebar bindings take the excluded id list and
build an `$and` of `$ne` filters, because AQL has no `$notoneof` operator.
**Surface:** `packages/desktop-client/src/components/reports/reports/NetWorth.tsx`,
`packages/desktop-client/src/components/reports/reports/excludeFromNetWorth.ts` (+ test),
`packages/desktop-client/src/components/accounts/Header.tsx` (menu toggle),
`packages/desktop-client/src/components/sidebar/Accounts.tsx`,
`packages/desktop-client/src/spreadsheet/bindings.ts`
(`allAccountBalance`/`onBudgetAccountBalance`/`offBudgetAccountBalance` gain an
excluded-ids argument), `exclude-from-net-worth-${string}` pref key in
`packages/loot-core/src/types/prefs.ts`.
**Conflict history:** `sidebar/Accounts.tsx` conflicted during this rebuild onto
v26.8.0 (upstream replaced `useFailedAccounts` with `isAccountFailedSync`).
**Upstream potential:** Yes — commonly requested; a PR would need the bindings
API change reviewed and probably a proper `$notoneof` AQL operator instead of
the `$and`-of-`$ne` workaround.
