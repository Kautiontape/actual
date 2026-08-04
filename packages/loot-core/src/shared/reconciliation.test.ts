import { detectSignFlip, findSubsetSummingTo } from './reconciliation';

describe('findSubsetSummingTo', () => {
  test('finds a single transaction matching the target', () => {
    expect(findSubsetSummingTo([100, 250, 30], 250)).toEqual([1]);
  });

  test('prefers a single match over a multi-item match', () => {
    // 30 + 100 === 130, but the single 130 should win
    expect(findSubsetSummingTo([30, 100, 130], 130)).toEqual([2]);
  });

  test('finds a pair when no single matches', () => {
    expect(findSubsetSummingTo([100, 250, 30], 130)).toEqual([0, 2]);
  });

  test('finds a triple when no single or pair matches', () => {
    expect(findSubsetSummingTo([10, 20, 5, 100], 35)).toEqual([0, 1, 2]);
  });

  test('returns null when nothing sums to the target', () => {
    expect(findSubsetSummingTo([100, 250], 17)).toBeNull();
  });

  test('handles negative amounts', () => {
    expect(findSubsetSummingTo([-100, 50, -30], -130)).toEqual([0, 2]);
  });

  test('matches a single negative amount', () => {
    expect(findSubsetSummingTo([-100, 50], -100)).toEqual([0]);
  });

  test('returns the first index when several singles match', () => {
    expect(findSubsetSummingTo([40, 40, 80], 40)).toEqual([0]);
  });

  test('returns null for an empty list', () => {
    expect(findSubsetSummingTo([], 100)).toBeNull();
  });

  test('respects maxSize (no pair search when maxSize is 1)', () => {
    expect(findSubsetSummingTo([30, 100], 130, { maxSize: 1 })).toBeNull();
  });

  test('returns the empty subset for a target of zero', () => {
    expect(findSubsetSummingTo([10, 20], 0)).toEqual([]);
  });
});

describe('detectSignFlip', () => {
  test('detects an entered value that is the exact negation of the cleared balance', () => {
    // cleared balance is -1346.81; user typed +1346.81
    expect(detectSignFlip(134681, -134681)).toBe(-134681);
  });

  test('detects the flip in the other direction', () => {
    expect(detectSignFlip(-134681, 134681)).toBe(134681);
  });

  test('returns null when the entered value already matches the cleared balance', () => {
    expect(detectSignFlip(-134681, -134681)).toBeNull();
  });

  test('returns null when the cleared balance is zero', () => {
    expect(detectSignFlip(50, 0)).toBeNull();
    expect(detectSignFlip(0, 0)).toBeNull();
  });

  test('returns null for unrelated values', () => {
    expect(detectSignFlip(100, -50)).toBeNull();
  });
});
