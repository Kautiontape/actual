// Pure helpers for the account reconciliation "close enough" detectors.
//
// All amounts are integer cents, matching how transactions store `amount`.

type FindSubsetOptions = {
  // Largest subset size to consider. Defaults to 4, which covers the common
  // "I forgot to clear a few transactions" cases while staying fast.
  maxSize?: number;
};

// Upper bound on the number of index combinations we will examine. Bounded
// subset-sum is NP-hard in general, so we cap the work and degrade the search
// depth on very large uncleared sets rather than risk a slow scan.
const MAX_COMBINATIONS = 1_000_000;

function countCombinations(n: number, maxSize: number): number {
  // Sum of C(n, k) for k = 1..maxSize, saturating at MAX_COMBINATIONS so we
  // never overflow on large n.
  let total = 0;
  let cNk = 1; // C(n, 0)
  for (let k = 1; k <= maxSize && k <= n; k++) {
    cNk = (cNk * (n - k + 1)) / k;
    total += cNk;
    if (total > MAX_COMBINATIONS) {
      return MAX_COMBINATIONS + 1;
    }
  }
  return total;
}

/**
 * Find a subset of `amounts` that sums exactly to `target`, preferring the
 * fewest items. Returns the matching indices (ascending), or `null` if no
 * subset matches within the bounded search depth. A `target` of 0 returns the
 * empty subset.
 */
export function findSubsetSummingTo(
  amounts: number[],
  target: number,
  options: FindSubsetOptions = {},
): number[] | null {
  if (target === 0) {
    return [];
  }

  const n = amounts.length;
  if (n === 0) {
    return null;
  }

  // Degrade the search depth so we stay within the combination budget.
  let maxSize = Math.max(1, options.maxSize ?? 4);
  while (maxSize > 1 && countCombinations(n, maxSize) > MAX_COMBINATIONS) {
    maxSize--;
  }

  // Search by increasing subset size so the first match found is the one with
  // the fewest items.
  for (let size = 1; size <= maxSize && size <= n; size++) {
    const indices = Array.from({ length: size }, (_, k) => k);

    while (true) {
      let sum = 0;
      for (let k = 0; k < size; k++) {
        sum += amounts[indices[k]];
      }
      if (sum === target) {
        return [...indices];
      }

      // Advance to the next combination in lexicographic order.
      let pos = size - 1;
      while (pos >= 0 && indices[pos] === n - size + pos) {
        pos--;
      }
      if (pos < 0) {
        break;
      }
      indices[pos]++;
      for (let k = pos + 1; k < size; k++) {
        indices[k] = indices[k - 1] + 1;
      }
    }
  }

  return null;
}

/**
 * Detect when the entered reconciliation target is the exact negation of the
 * cleared balance (e.g. the user typed 1346.81 when the balance is -1346.81).
 * Returns the corrected target balance, or `null` when there is no sign flip.
 */
export function detectSignFlip(
  targetBalance: number,
  clearedBalance: number,
): number | null {
  if (clearedBalance !== 0 && targetBalance === -clearedBalance) {
    return -targetBalance;
  }
  return null;
}
