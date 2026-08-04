# Add New press-event fix

**Commit:** `ktn: register-addnew-fix` (this file rides in it; revert the commit to drop the feature)
**What:** Pressing the register's Add New button passed the triggering press
event through to the new-transaction machinery, seeding the temporary
transaction with the event object instead of clean defaults. This change stops
the event from leaking into the new transaction.
**Surface:** `packages/desktop-client/src/components/accounts/Header.tsx`
(Add New button handler).
**Conflict history:** None of its own; it lives in `Header.tsx`, which churns
upstream, so it rides the usual merge noise.
**Upstream potential:** Strong candidate — it is a small bugfix, easy to review.
