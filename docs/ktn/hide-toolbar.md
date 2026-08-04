# Hide scheduled/reconciled toolbar toggles

**Commit:** `ktn: hide-toolbar` (this file rides in it; revert the commit to drop the feature)
**What:** Per-account register toolbar icons to hide scheduled-preview rows and
reconciled rows. Hiding scheduled previews is a new synced pref
(`hide-scheduled-${accountId}`); hiding reconciled rows reuses upstream's
`hide-reconciled` pref but surfaces it as a one-click toolbar icon next to the
new hide-upcoming icon. Works in single-account and combined (All/On/Off
budget) registers. An earlier fork iteration also had a per-row reconcile
shift+click toggle; the toolbar icons replaced it and nothing of it remains in
this patch.
**Surface:** `packages/desktop-client/src/components/accounts/Account.tsx`,
`packages/desktop-client/src/components/accounts/Header.tsx`,
`packages/desktop-client/src/components/accounts/previewVisibility.ts` (+ test),
`hide-scheduled-${string}` synced pref key in `packages/loot-core/src/types/prefs.ts`.
**Conflict history:** `Account.tsx` and `Header.tsx` conflict on essentially every
upstream sync — both files churn upstream. Known gap: the mobile register ignores
`hide-scheduled`.
**Upstream potential:** Plausible as a UX PR (toolbar visibility toggles); would
need design review and mobile support first.
