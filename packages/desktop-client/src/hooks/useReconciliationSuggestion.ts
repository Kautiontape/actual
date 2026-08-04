import { useEffect, useState } from 'react';

import { q } from '@actual-app/core/shared/query';
import {
  detectSignFlip,
  findSubsetSummingTo,
} from '@actual-app/core/shared/reconciliation';
import { ungroupTransactions } from '@actual-app/core/shared/transactions';
import type {
  AccountEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';

import { aqlQuery } from '#queries/aqlQuery';

export type ReconciliationSuggestion =
  | { type: 'none' }
  | { type: 'signFlip'; correctedBalance: number }
  | {
      type: 'clearTransactions';
      transactions: TransactionEntity[];
      total: number;
    };

type UseReconciliationSuggestionArgs = {
  accountId?: AccountEntity['id'];
  targetBalance: number;
  clearedBalance: number;
  targetDiff: number;
};

/**
 * Inspect a not-yet-balanced reconciliation and suggest a "close enough" fix:
 *  - `signFlip`: the entered balance is the exact negation of the cleared
 *    balance (e.g. 1346.81 typed for a -1346.81 balance).
 *  - `clearTransactions`: a subset of the account's uncleared transactions
 *    sums exactly to the remaining difference, so clearing them reconciles
 *    the account without an adjustment.
 *
 * The sign-flip case takes priority and is computed synchronously; the
 * uncleared-combination search runs against the account's uncleared
 * transactions and resolves asynchronously.
 */
export function useReconciliationSuggestion({
  accountId,
  targetBalance,
  clearedBalance,
  targetDiff,
}: UseReconciliationSuggestionArgs): ReconciliationSuggestion {
  const signFlip =
    targetDiff !== 0 ? detectSignFlip(targetBalance, clearedBalance) : null;

  const [asyncSuggestion, setAsyncSuggestion] =
    useState<ReconciliationSuggestion>({ type: 'none' });

  useEffect(() => {
    let cancelled = false;

    if (targetDiff === 0 || accountId == null || signFlip != null) {
      setAsyncSuggestion({ type: 'none' });
      return;
    }

    void (async () => {
      const { data } = await aqlQuery(
        q('transactions')
          .filter({ cleared: false, account: accountId })
          .select('*')
          .options({ splits: 'grouped' }),
      );
      const uncleared = ungroupTransactions(data).filter(t => !t.is_parent);
      const subset = findSubsetSummingTo(
        uncleared.map(t => t.amount),
        targetDiff,
      );

      if (cancelled) {
        return;
      }

      if (subset && subset.length > 0) {
        setAsyncSuggestion({
          type: 'clearTransactions',
          transactions: subset.map(i => uncleared[i]),
          total: targetDiff,
        });
      } else {
        setAsyncSuggestion({ type: 'none' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetDiff, accountId, signFlip]);

  if (targetDiff === 0) {
    return { type: 'none' };
  }
  if (signFlip != null) {
    return { type: 'signFlip', correctedBalance: signFlip };
  }
  return asyncSuggestion;
}
