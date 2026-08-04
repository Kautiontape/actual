import type { TransactionEntity } from '@actual-app/core/types/models';

import { mergeWithPreviews } from './previewVisibility';

function tx(id: string): TransactionEntity {
  return { id } as TransactionEntity;
}

const transactions = [tx('t1'), tx('t2')];
const previews = [tx('p1'), tx('p2')];

describe('mergeWithPreviews', () => {
  it('prepends previews when not filtered and hideScheduled is false', () => {
    expect(
      mergeWithPreviews(transactions, previews, {
        filtered: false,
        hideScheduled: false,
      }),
    ).toEqual([...previews, ...transactions]);
  });

  it('omits previews when hideScheduled is true', () => {
    expect(
      mergeWithPreviews(transactions, previews, {
        filtered: false,
        hideScheduled: true,
      }),
    ).toEqual(transactions);
  });

  it('omits previews when filtering', () => {
    expect(
      mergeWithPreviews(transactions, previews, {
        filtered: true,
        hideScheduled: false,
      }),
    ).toEqual(transactions);
  });

  it('returns transactions unchanged when there are no previews', () => {
    expect(
      mergeWithPreviews(transactions, [], {
        filtered: false,
        hideScheduled: false,
      }),
    ).toEqual(transactions);
  });
});
