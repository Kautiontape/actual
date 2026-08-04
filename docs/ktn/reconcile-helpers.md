# Reconcile helpers

**Commit:** `ktn: reconcile-helpers` (this file rides in it; revert the commit to drop the feature)
**What:** Quality-of-life helpers around account reconciliation. The reconcile
button uses an equals icon (distinct from the hide-reconciled lock icon).
During reconcile, a banner detects a sign-flip (entered target equals the
negative of the cleared balance) and offers a one-click fix, and can find an
uncleared subset of transactions summing exactly to the difference, shown as a
preview before confirming the clears. Reconciling only already-cleared rows is
upstream behavior as of v26.8.0 (the fork's earlier implementation of that rule
was superseded and removed within the fork's own history); this commit carries
only the equals icon, the sign-flip suggestion, and the uncleared-subset
suggestion.
**Surface:** `packages/loot-core/src/shared/reconciliation.ts` (pure helpers,
16 tests in `reconciliation.test.ts`),
`packages/desktop-client/src/hooks/useReconciliationSuggestion.ts`,
`packages/desktop-client/src/components/accounts/Reconcile.tsx` (+ test),
`packages/desktop-client/src/components/accounts/Account.tsx`,
`packages/desktop-client/src/components/accounts/Header.tsx`.
**Conflict history:** `Account.tsx`/`Header.tsx` are upstream churn hotspots and
conflict regularly during syncs; the loot-core helpers never have.
**Upstream potential:** The pure helpers (sign-flip detection, subset-sum
suggestion) are upstreamable; the banner UX is opinionated and would need
product review.
