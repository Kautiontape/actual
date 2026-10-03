# Exclude accounts from net worth

**Commit:** `ktn: net-worth-exclusion` (this file rides in it; revert the commit to drop the feature)
**What:** A per-account "Exclude from net worth" toggle in the account ⋯ menu,
stored as the synced pref `exclude-from-net-worth-${accountId}`. Flagged accounts
are filtered out of the Net Worth report and out of the sidebar All accounts /
On budget / Off budget totals, in both the classic and the redesigned sidebar
(where account-group subtotals leave them out too, so the groups add up to the
side total). The `netWorth*` bindings chain one `$ne` filter per excluded id,
because AQL has no `$notoneof` operator. They use their own sheet cell names
(`…-net-worth`) because a cell keeps whichever query bound it last, and the
upstream `accounts-balance` cells are also bound unfiltered by the All accounts
register, the command bar and mobile. Sharing those names would let any of those
views, once mounted, rebind the cell and put excluded accounts back in the
sidebar total.
**Surface:** `packages/desktop-client/src/components/reports/reports/NetWorth.tsx`,
`packages/desktop-client/src/components/reports/reports/excludeFromNetWorth.ts` (+ test),
`packages/desktop-client/src/components/accounts/Header.tsx` (menu toggle),
`packages/desktop-client/src/components/sidebar/Accounts.tsx`,
redesigned sidebar `packages/desktop-client/src/components/sidebar/redesign/`
(`AccountsHeaderRow.tsx`, `AccountsSection.tsx`, `SideGroup.tsx` binding type,
`AccountGroupHeader.tsx`), `packages/desktop-client/src/hooks/useNetWorthExcludedAccountIds.ts`,
`packages/desktop-client/src/spreadsheet/bindings.ts` (additive `netWorth*`
block after `accountGroupBalance`; upstream functions untouched),
`packages/desktop-client/src/spreadsheet/index.ts` (`…-net-worth` cell names),
`exclude-from-net-worth-${string}` pref key in
`packages/loot-core/src/types/prefs.ts`.
**Conflict history:** `sidebar/Accounts.tsx` conflicted during this rebuild onto
v26.8.0 (upstream replaced `useFailedAccounts` with `isAccountFailedSync`).
**Upstream potential:** Yes — commonly requested; a PR would need the bindings
API change reviewed and probably a proper `$notoneof` AQL operator instead of
the `$and`-of-`$ne` workaround.
