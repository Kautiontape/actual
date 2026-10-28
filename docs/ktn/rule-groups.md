# Rule groups

**Commit:** `ktn: rule-groups` (this file rides in it; revert the commit to drop the feature)
**What:** The Rules page lists rules in three collapsible groups instead of one
flat list. Custom rules start expanded. "Payee to category" rules start
collapsed: a single `payee is X` condition and a single `set category` action in
the default stage, the shape Actual's category learning creates and updates.
"Scheduled" rules (any `link-schedule` action) also start collapsed.
Grouping is display only: rules still run by stage, then rank, and each group
keeps that run order. Headers show full counts, and pagination applies only to
expanded rows. A search opens every group with a match. Only visible rows can
be selected, so select-all and "Delete N rules" never reach into a collapsed
group. Collapse state isn't saved. The payee modal's rule list stays flat.
**Surface:** `packages/loot-core/src/shared/ruleGroups.ts` (+ test),
`packages/desktop-client/src/components/ManageRules.tsx`,
`packages/desktop-client/src/components/rules/RuleGroupHeader.tsx`.
**Conflict history:** None yet. `ManageRules.tsx` is the likely spot.
Known gap: the mobile rules list (`mobile/rules/RulesList.tsx`) is still flat.
**Upstream potential:** Plausible as a UX PR; would need design review, mobile
support, and probably a way to name or tag custom groups.
