# Record Payment

**Commit:** `ktn: record-payment` (this file rides in it; revert the commit to drop the feature)
**What:** A credit-card icon appears in the register toolbar for on-budget
accounts with a negative balance. Clicking it starts a transfer transaction
pre-filled with the full cleared balance, so paying off a card is one click plus
confirm. The pay-from account is remembered per account via the synced pref
`payment-source-${accountId}`. Implementation threads new `overrides` and
focus-field parameters through `makeTemporaryTransactions` and the transaction
table so the new row arrives pre-populated with the right field focused.
**Surface:** `packages/desktop-client/src/components/accounts/Account.tsx`,
`packages/desktop-client/src/components/accounts/Header.tsx`,
`packages/desktop-client/src/components/transactions/TransactionList.tsx`,
`packages/desktop-client/src/components/transactions/TransactionsTable.tsx`,
`packages/desktop-client/src/components/transactions/table/utils.ts`
(`makeTemporaryTransactions` signature), `payment-source-${string}` pref key in
`packages/loot-core/src/types/prefs.ts`.
**Conflict history:** Rides the same `Account.tsx`/`Header.tsx`/transaction-table
churn as the other register features; no standalone conflicts so far.
**Upstream potential:** Maybe — the workflow is broadly useful but the UX
(icon trigger, per-account source memory) would need product review.
