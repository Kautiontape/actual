# Rule amount action default

**Commit:** `ktn: rule-amount-default` (this file rides in it; revert the commit to drop the feature)
**What:** Picking "amount" as a rule action's field stored `null` while the
amount input displayed 0.00. Saving without editing the input kept the `null`,
and the rule then set every matched transaction's amount to null instead of 0.
Switching an action to a number field now stores the 0 the input shows.
**Surface:** `packages/desktop-client/src/components/rules/RuleEditor.tsx`
(`onChangeAction`, the field-change branch).
**Conflict history:** None yet; `RuleEditor.tsx` changes upstream now and then,
so expect the occasional context conflict on that one line.
**Upstream potential:** Strong candidate — a one-line bugfix.
