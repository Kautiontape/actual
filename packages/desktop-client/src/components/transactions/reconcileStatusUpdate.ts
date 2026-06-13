import type { StatusTypes } from '#components/schedules/StatusBadge';

export type StatusFieldUpdate = {
  field: 'cleared' | 'reconciled';
  value: boolean;
};

// ktn: a plain click on the status icon toggles `cleared` (existing behavior); a
// Shift+click toggles `reconciled` instead. Pure so the decision can be unit-tested
// without rendering the transaction table.
export function reconcileStatusUpdate(
  status: StatusTypes | null | undefined,
  shiftKey: boolean,
): StatusFieldUpdate {
  if (shiftKey) {
    return { field: 'reconciled', value: status !== 'reconciled' };
  }
  return { field: 'cleared', value: status !== 'cleared' };
}
