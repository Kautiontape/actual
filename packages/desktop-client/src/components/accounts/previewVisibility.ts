import type { TransactionEntity } from '@actual-app/core/types/models';

type MergeOptions = {
  filtered: boolean;
  hideScheduled: boolean;
};

// ktn: decide whether upcoming scheduled/preview transactions are prepended to
// the register. Previews are shown only when we're not filtering and the
// per-account `hide-scheduled` preference is off. Pure + isolated so it can be
// unit-tested without rendering the (large) account component.
export function mergeWithPreviews(
  transactions: TransactionEntity[],
  previewTransactions: readonly TransactionEntity[],
  { filtered, hideScheduled }: MergeOptions,
): TransactionEntity[] {
  if (!filtered && !hideScheduled && previewTransactions.length > 0) {
    return previewTransactions.concat(transactions);
  }
  return transactions;
}
