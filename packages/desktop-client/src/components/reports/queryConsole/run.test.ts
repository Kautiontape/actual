import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));

import { send } from '@actual-app/core/platform/client/connection';

import { parseQuery } from './parse';
import { runQuery } from './run';

const sendMock = vi.mocked(send);

function cell(month: string, binding: string, value: number | boolean) {
  return { name: `budget${month.replace('-', '')}!${binding}`, value };
}

const SPENT_BY_MONTH: Record<string, number> = {
  '2025-01': -10000,
  '2025-02': -20000,
  '2025-03': -30000,
};

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockImplementation((async (
    name: string,
    args: { month: string },
  ) => {
    if (name === 'get-budget-bounds') {
      return { start: '2025-01', end: '2025-03' };
    }
    if (name === 'get-categories') {
      return {
        grouped: [
          {
            id: 'g1',
            name: 'Food',
            is_income: false,
            categories: [{ id: 'c1', name: 'Groceries', hidden: false }],
          },
        ],
      };
    }
    if (name === 'envelope-budget-month') {
      const m = args.month;
      const spent = SPENT_BY_MONTH[m] ?? 0;
      return [
        cell(m, 'budget-c1', 40000),
        cell(m, 'sum-amount-c1', spent),
        cell(m, 'leftover-c1', 40000 + spent),
        cell(m, 'carryover-c1', false),
      ];
    }
    return [];
  }) as unknown as typeof send);
});

describe('runQuery — budgets source', () => {
  it('returns one row per (category, month)', async () => {
    const res = await runQuery(parseQuery('from budgets\nsort month'), {
      budgetType: 'envelope',
    });
    expect(res.rowCount).toBe(3);
    expect(res.rows.map(r => r.month)).toEqual([
      '2025-01',
      '2025-02',
      '2025-03',
    ]);
    expect(res.rows[0]).toMatchObject({
      month: '2025-01',
      category: 'Groceries',
      spent: -100,
    });
  });

  it('groups budgets rows by month', async () => {
    const res = await runQuery(
      parseQuery(
        'from budgets\ngroup month\naggregate spend = sum spent\nsort month',
      ),
      { budgetType: 'envelope' },
    );
    expect(res.rows).toEqual([
      { month: '2025-01', spend: -100 },
      { month: '2025-02', spend: -200 },
      { month: '2025-03', spend: -300 },
    ]);
  });
});
