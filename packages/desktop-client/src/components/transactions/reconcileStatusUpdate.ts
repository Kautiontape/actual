import type { StatusTypes } from '#components/schedules/StatusBadge';

export type StatusFieldUpdate = {
  field: 'cleared' | 'reconciled';
  value: boolean;
};

// ktn: a plain click on the status icon toggles `cleared` (existing behaviour). A
// Shift+click toggles `reconciled` — but only on an already-cleared row, so the
// app's "reconciled implies cleared" invariant is never broken. Shift+clicking an
// uncleared row just clears it (a second Shift+click then reconciles). Pure so the
// decision can be unit-tested without rendering the transaction table.
export function reconcileStatusUpdate(
  status: StatusTypes | null | undefined,
  shiftKey: boolean,
): StatusFieldUpdate {
  if (shiftKey && status === 'cleared') {
    return { field: 'reconciled', value: true };
  }
  if (shiftKey && status === 'reconciled') {
    return { field: 'reconciled', value: false };
  }
  return { field: 'cleared', value: status !== 'cleared' };
}
