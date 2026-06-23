import { describe, expect, it } from 'vitest';

import { cellsToRows, collectMonthHints, flattenCategories, indexCells, monthRange } from './budgets';
import type { BudgetCategory } from './budgets';
import { parseQuery } from './parse';

describe('indexCells', () => {
  it('keys cells by the binding after the sheet prefix', () => {
    const idx = indexCells([
      { name: 'budget202503!leftover-cat1', value: 100 },
      { name: 'budget202503!carryover-cat1', value: true },
    ]);
    expect(idx.get('leftover-cat1')).toBe(100);
    expect(idx.get('carryover-cat1')).toBe(true);
  });
});

describe('flattenCategories', () => {
  it('flattens grouped categories with group name and income flag', () => {
    const cats = flattenCategories([
      {
        id: 'g1',
        name: 'Food',
        is_income: false,
        categories: [{ id: 'c1', name: 'Groceries', hidden: false }],
      },
      {
        id: 'g2',
        name: 'Income',
        is_income: true,
        categories: [{ id: 'c2', name: 'Salary', hidden: false }],
      },
    ]);
    expect(cats).toEqual([
      {
        id: 'c1',
        name: 'Groceries',
        group: 'Food',
        isIncome: false,
        hidden: false,
      },
      {
        id: 'c2',
        name: 'Salary',
        group: 'Income',
        isIncome: true,
        hidden: false,
      },
    ]);
  });
});

describe('monthRange', () => {
  it('defaults to the last 24 months ending at bounds.end', () => {
    const months = monthRange({ start: '2020-01', end: '2026-06' }, {});
    expect(months.length).toBe(24);
    expect(months[0]).toBe('2024-07');
    expect(months[months.length - 1]).toBe('2026-06');
  });

  it('clamps the default window to a younger budget start', () => {
    const months = monthRange({ start: '2026-01', end: '2026-06' }, {});
    expect(months).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
  });

  it('honors gte/lte hints, clamped to bounds', () => {
    const months = monthRange(
      { start: '2020-01', end: '2026-06' },
      { gte: '2026-03', lte: '2026-05' },
    );
    expect(months).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('returns [] when the range is empty', () => {
    expect(
      monthRange({ start: '2026-01', end: '2026-06' }, { gte: '2027-01' }),
    ).toEqual([]);
  });
});

describe('collectMonthHints', () => {
  it('extracts gte/lte bounds from month filters', () => {
    const stages = parseQuery(
      ['from budgets', 'filter month >= "2025-01" and month <= "2025-12"'].join(
        '\n',
      ),
    );
    expect(collectMonthHints(stages)).toEqual({
      gte: '2025-01',
      lte: '2025-12',
    });
  });

  it('ignores filters on other fields', () => {
    const stages = parseQuery(
      ['from budgets', 'filter saturation < 0.8'].join('\n'),
    );
    expect(collectMonthHints(stages)).toEqual({});
  });

  it('ignores month bounds inside an or (cannot safely narrow)', () => {
    const stages = parseQuery(
      ['from budgets', 'filter month >= "2025-01" or month <= "2024-06"'].join(
        '\n',
      ),
    );
    expect(collectMonthHints(stages)).toEqual({});
  });
});

describe('cellsToRows', () => {
  const categories: BudgetCategory[] = [
    {
      id: 'cat1',
      name: 'Groceries',
      group: 'Food',
      isIncome: false,
      hidden: false,
    },
  ];

  function monthCells(entries: Array<[string, number | boolean]>) {
    return new Map([
      ['2025-03', new Map<string, number | boolean | null>(entries)],
    ]);
  }

  it('computes budgeted/spent/available/balance/saturation with native sign', () => {
    const rows = cellsToRows(
      ['2025-03'],
      monthCells([
        ['budget-cat1', 40000],
        ['sum-amount-cat1', -31200],
        ['leftover-cat1', 20800],
        ['carryover-cat1', false],
        ['goal-cat1', 40000],
      ]),
      categories,
    );
    expect(rows).toEqual([
      {
        month: '2025-03',
        category: 'Groceries',
        group: 'Food',
        budgeted: 400,
        spent: -312,
        available: 520,
        balance: 208,
        carryover: false,
        goal: 400,
        saturation: 0.6,
      },
    ]);
  });

  it('reports saturation > 1 when overspent', () => {
    const rows = cellsToRows(
      ['2025-03'],
      monthCells([
        ['budget-cat1', 40000],
        ['sum-amount-cat1', -60000],
        ['leftover-cat1', -8000],
      ]),
      categories,
    );
    expect(rows[0].available).toBe(520);
    expect(rows[0].saturation).toBeCloseTo(60000 / 52000, 5);
  });

  it('returns null saturation when available <= 0', () => {
    const rows = cellsToRows(
      ['2025-03'],
      monthCells([
        ['budget-cat1', 0],
        ['sum-amount-cat1', -5000],
        ['leftover-cat1', -5000],
      ]),
      categories,
    );
    expect(rows[0].available).toBe(0);
    expect(rows[0].saturation).toBeNull();
  });

  it('includes categories with no budget cells (null money fields)', () => {
    const rows = cellsToRows(['2025-03'], monthCells([]), categories);
    expect(rows[0]).toMatchObject({
      category: 'Groceries',
      budgeted: 0,
      spent: 0,
      available: 0,
      balance: 0,
      carryover: false,
      goal: null,
      saturation: null,
    });
  });
});
