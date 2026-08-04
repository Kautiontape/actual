import { send } from '@actual-app/core/platform/client/connection';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { aqlQuery } from '#queries/aqlQuery';

import { parseQuery } from './parse';
import { runQuery } from './run';

vi.mock('@actual-app/core/platform/client/connection', () => ({
  send: vi.fn(),
}));
vi.mock('#queries/aqlQuery', () => ({
  aqlQuery: vi.fn(),
}));

const sendMock = vi.mocked(send);
const aqlMock = vi.mocked(aqlQuery);

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

  it('first/last aggregates pick the row per group in sort order', async () => {
    const res = await runQuery(
      parseQuery(
        'from budgets\nsort -month\ngroup category\naggregate newest = first month, oldest = last month, amt = first spent',
      ),
      { budgetType: 'envelope' },
    );
    expect(res.rows).toEqual([
      {
        category: 'Groceries',
        newest: '2025-03',
        oldest: '2025-01',
        amt: -300,
      },
    ]);
  });

  it('filtered aggregates (where) compute per-aggregate before having', async () => {
    const res = await runQuery(
      parseQuery(
        'from budgets\nsort -month\ngroup category\naggregate balance = sum spent, recent_big = first month where spent < -150\nhaving balance < 0',
      ),
      { budgetType: 'envelope' },
    );
    expect(res.rows).toEqual([
      { category: 'Groceries', balance: -600, recent_big: '2025-03' },
    ]);
  });
});

describe('runQuery — transactions source', () => {
  it('`first ... where amount > 0` returns the most recent payment, not the latest transaction', async () => {
    // Amounts are stored in cents (normalizeRow divides by 100); `account` is
    // the account name. Mirrors a credit card: charges are negative, payments
    // (money in) are positive.
    const rows = [
      { id: '1', date: '2026-07-14', amount: -10000, account: 'Test Card' },
      { id: '2', date: '2026-07-10', amount: -5000, account: 'Test Card' },
      { id: '3', date: '2026-07-06', amount: 3000, account: 'Test Card' },
      { id: '4', date: '2026-07-01', amount: -2000, account: 'Test Card' },
      { id: '5', date: '2026-06-17', amount: 1000, account: 'Test Card' },
    ];
    aqlMock.mockResolvedValue({ data: rows } as unknown as Awaited<
      ReturnType<typeof aqlQuery>
    >);

    const res = await runQuery(
      parseQuery(
        'from transactions\nfilter account ~ "Test"\nsort -date\ngroup account\naggregate balance = sum amount, day = first date where amount > 0, paid = first amount where amount > 0\nhaving balance < 0',
      ),
    );

    // Latest transaction is the -100 charge on 07-14, but the latest PAYMENT is
    // +30 on 07-06 — that is what should surface.
    expect(res.rows).toEqual([
      { account: 'Test Card', balance: -130, day: '2026-07-06', paid: 30 },
    ]);
  });
});
