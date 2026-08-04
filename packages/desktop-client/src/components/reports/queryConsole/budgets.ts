// @ts-strict-ignore
// Synthetic `budgets` source for the Query console. Produces one row per
// (category, month) by reading Actual's budget-month spreadsheet values
// (which already chain carryover rollover) — see run.ts for how it plugs into
// the pipeline.
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';

import type { Condition, Stage, Value } from './parse';

export type BudgetCategory = {
  id: string;
  name: string;
  group: string;
  isIncome: boolean;
  hidden: boolean;
};

type BudgetBounds = { start: string; end: string };
type MonthHints = { gte?: string; lte?: string };
type CellValue = number | boolean | null;
type Cell = { name: string; value: CellValue };
type Row = Record<string, unknown>;

const DEFAULT_MONTHS_BACK = 24;

// Cell `name` is `"<sheet>!<binding>"` (e.g. `budget202503!leftover-cat1`).
// Index by the binding so a category id can be looked up directly.
export function indexCells(cells: Cell[]): Map<string, CellValue> {
  const idx = new Map<string, CellValue>();
  for (const cell of cells) {
    const bang = cell.name.indexOf('!');
    const binding = bang === -1 ? cell.name : cell.name.slice(bang + 1);
    idx.set(binding, cell.value);
  }
  return idx;
}

type GroupedCategory = {
  id: string;
  name: string;
  is_income?: boolean;
  categories: Array<{ id: string; name: string; hidden?: boolean }>;
};

export function flattenCategories(
  grouped: GroupedCategory[],
): BudgetCategory[] {
  const out: BudgetCategory[] = [];
  for (const group of grouped) {
    for (const cat of group.categories) {
      out.push({
        id: cat.id,
        name: cat.name,
        group: group.name,
        isIncome: !!group.is_income,
        hidden: !!cat.hidden,
      });
    }
  }
  return out;
}

function minMonth(a: string, b: string): string {
  return a <= b ? a : b;
}
function maxMonth(a: string, b: string): string {
  return a >= b ? a : b;
}

// Compute the months to fetch: honor explicit month-filter hints, otherwise
// default to the last DEFAULT_MONTHS_BACK months; always clamp to the budget's
// real bounds so we never query months with no budget data.
export function monthRange(bounds: BudgetBounds, hints: MonthHints): string[] {
  let end = hints.lte ?? bounds.end;
  end = minMonth(maxMonth(end, bounds.start), bounds.end);

  let start = hints.gte ?? monthUtils.subMonths(end, DEFAULT_MONTHS_BACK - 1);
  start = maxMonth(start, bounds.start);

  if (start > end) return [];
  return monthUtils.rangeInclusive(start, end);
}

// Walk all filter conditions and collect month bounds. Over-collecting is safe:
// the authoritative filter still runs client-side; hints only size the fetch.
export function collectMonthHints(stages: Stage[]): MonthHints {
  const hints: MonthHints = {};

  const monthValue = (values: Value[]): string | undefined => {
    const v = values[0];
    if (!v) return undefined;
    if (v.type === 'string') return v.value;
    if (v.type === 'date') return String(v.value).slice(0, 7);
    return undefined;
  };

  const walk = (cond: Condition) => {
    switch (cond.kind) {
      case 'and':
        walk(cond.left);
        walk(cond.right);
        return;
      // A month bound inside `or`/`not` doesn't constrain the whole result set,
      // so we must not narrow the fetch window from it. Skip these branches and
      // fall back to the default window; the client-side filter stays
      // authoritative.
      case 'or':
      case 'not':
        return;
      case 'compare': {
        if (cond.field !== 'month') return;
        const m = monthValue(cond.values);
        if (m == null) return;
        if (cond.op === '>=' || cond.op === '>' || cond.op === '==') {
          hints.gte = hints.gte ? minMonth(hints.gte, m) : m;
        }
        if (cond.op === '<=' || cond.op === '<' || cond.op === '==') {
          hints.lte = hints.lte ? maxMonth(hints.lte, m) : m;
        }
        return;
      }
      default:
        return;
    }
  };

  for (const s of stages) {
    if (s.kind === 'filter') walk(s.cond);
  }
  return hints;
}

function num(v: CellValue): number {
  return typeof v === 'number' ? v : 0;
}

// Assemble one row per (category, month). Money cells are cents; `spent` keeps
// native sign. available = budget + carried rollover = leftover - spent.
export function cellsToRows(
  months: string[],
  cellsByMonth: Map<string, Map<string, CellValue>>,
  categories: BudgetCategory[],
): Row[] {
  const rows: Row[] = [];
  for (const month of months) {
    const cells = cellsByMonth.get(month);
    if (!cells) continue;
    for (const cat of categories) {
      const budgetedCents = num(cells.get(`budget-${cat.id}`));
      const spentCents = num(cells.get(`sum-amount-${cat.id}`));
      const leftoverCents = num(cells.get(`leftover-${cat.id}`));
      const availableCents = leftoverCents - spentCents;
      const goalCell = cells.get(`goal-${cat.id}`);

      rows.push({
        month,
        category: cat.name,
        group: cat.group,
        budgeted: budgetedCents / 100,
        spent: spentCents / 100,
        available: availableCents / 100,
        balance: leftoverCents / 100,
        carryover: cells.get(`carryover-${cat.id}`) === true,
        goal: typeof goalCell === 'number' ? goalCell / 100 : null,
        saturation: availableCents > 0 ? -spentCents / availableCents : null,
      });
    }
  }
  return rows;
}

// Fetch budget rows for the months implied by the query. One handler call per
// month returns every category's cells at once; the leftover cell already
// includes carryover from prior months.
export async function loadBudgetRows(
  stages: Stage[],
  budgetType: string = 'envelope',
): Promise<Row[]> {
  const bounds: BudgetBounds = await send('get-budget-bounds');
  const months = monthRange(bounds, collectMonthHints(stages));
  if (months.length === 0) return [];

  const { grouped } = await send('get-categories');
  const categories = flattenCategories(grouped as GroupedCategory[]);

  const handler =
    budgetType === 'tracking'
      ? 'tracking-budget-month'
      : 'envelope-budget-month';

  const cellsByMonth = new Map<string, Map<string, CellValue>>();
  for (const month of months) {
    const cells: Cell[] = (await send(handler, { month })) as Cell[];
    cellsByMonth.set(month, indexCells(cells));
  }

  return cellsToRows(months, cellsByMonth, categories);
}
