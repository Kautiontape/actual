// @ts-strict-ignore
// Executes a parsed Query-console pipeline.
//
// Strategy: push positive `filter` conditions down to ActualQL (real SQL
// filtering, so we don't pull the whole table), then run everything else —
// `exclude`, grouping, statistics, windows and forecasting — client-side on
// the returned rows. ActualQL is the row source; JS is the analytics engine.

import { q } from '@actual-app/core/shared/query';

import { aqlQuery } from '#queries/aqlQuery';

import { loadBudgetRows } from './budgets';
import type {
  Aggregation,
  Condition,
  Expr,
  GroupKey,
  SelectColumn,
  Stage,
  Table,
  Value,
} from './parse';

const DEFAULT_RAW_LIMIT = 500;

export type Row = Record<string, unknown>;

export type QueryResult = {
  columns: string[];
  rows: Row[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  grouped: boolean;
};

// --- field / value mapping -------------------------------------------------

function aqlField(table: Table, field: string): string {
  if (table === 'transactions') {
    if (field === 'payee') return 'payee.name';
    if (field === 'category') return 'category.name';
    if (field === 'account') return 'account.name';
    // `offbudget`/`onbudget` are properties of the account; expose them as
    // friendly aliases (`onbudget` is the inverse — see aqlValue).
    if (field === 'offbudget' || field === 'onbudget') {
      return 'account.offbudget';
    }
  }
  return field;
}

function aqlValue(field: string, v: Value): unknown {
  if (field === 'amount' && v.type === 'number') {
    return Math.round(v.value * 100);
  }
  // `onbudget` is the logical inverse of the stored `offbudget` flag.
  if (field === 'onbudget' && v.type === 'bool') {
    return !v.value;
  }
  return v.value;
}

function isPushable(cond: Condition): boolean {
  switch (cond.kind) {
    case 'not':
      return false;
    case 'and':
    case 'or':
      return isPushable(cond.left) && isPushable(cond.right);
    case 'compare':
      return cond.op !== 'not in';
    default:
      return false;
  }
}

const OP_TO_AQL: Record<string, string> = {
  '==': '$eq',
  '!=': '$ne',
  '<': '$lt',
  '<=': '$lte',
  '>': '$gt',
  '>=': '$gte',
};

function condToAql(cond: Condition, table: Table): Record<string, unknown> {
  switch (cond.kind) {
    case 'and':
      return {
        $and: [condToAql(cond.left, table), condToAql(cond.right, table)],
      };
    case 'or':
      return {
        $or: [condToAql(cond.left, table), condToAql(cond.right, table)],
      };
    case 'not':
      throw new Error('Negation cannot be pushed to the query');
    case 'compare': {
      const field = aqlField(table, cond.field);
      const [first] = cond.values;
      if (cond.op === 'in') {
        return {
          [field]: { $oneof: cond.values.map(v => aqlValue(cond.field, v)) },
        };
      }
      if (cond.op === '~') {
        return { [field]: { $like: `%${first.value}%` } };
      }
      if (cond.op === '!~') {
        return { [field]: { $notlike: `%${first.value}%` } };
      }
      const aqlOp = OP_TO_AQL[cond.op];
      return { [field]: { [aqlOp]: aqlValue(cond.field, first) } };
    }
    default:
      throw new Error('Unsupported condition');
  }
}

// --- client-side condition evaluation --------------------------------------

function eq(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
}

function compareScalar(rowVal: unknown, op: string, v: Value): boolean {
  const target = v.value;
  switch (op) {
    case '==':
      return eq(rowVal, target);
    case '!=':
      return !eq(rowVal, target);
    case '~':
      return String(rowVal ?? '')
        .toLowerCase()
        .includes(String(target).toLowerCase());
    case '!~':
      return !String(rowVal ?? '')
        .toLowerCase()
        .includes(String(target).toLowerCase());
    case '<':
    case '<=':
    case '>':
    case '>=': {
      let cmp: number;
      if (v.type === 'number') {
        cmp = Number(rowVal) - Number(target);
      } else {
        cmp = String(rowVal ?? '').localeCompare(String(target));
      }
      if (op === '<') return cmp < 0;
      if (op === '<=') return cmp <= 0;
      if (op === '>') return cmp > 0;
      return cmp >= 0;
    }
    default:
      return false;
  }
}

function evalCond(row: Row, cond: Condition): boolean {
  switch (cond.kind) {
    case 'and':
      return evalCond(row, cond.left) && evalCond(row, cond.right);
    case 'or':
      return evalCond(row, cond.left) || evalCond(row, cond.right);
    case 'not':
      return !evalCond(row, cond.cond);
    case 'compare': {
      const rowVal = row[cond.field];
      if (cond.op === 'in') {
        return cond.values.some(v => eq(rowVal, v.value));
      }
      if (cond.op === 'not in') {
        return !cond.values.some(v => eq(rowVal, v.value));
      }
      return compareScalar(rowVal, cond.op, cond.values[0]);
    }
    default:
      return false;
  }
}

// --- rows ------------------------------------------------------------------

function defaultSelect(table: Table): Array<string | Record<string, string>> {
  if (table === 'transactions') {
    return [
      'id',
      'date',
      'amount',
      'notes',
      'cleared',
      'reconciled',
      { payee: 'payee.name' },
      { category: 'category.name' },
      { account: 'account.name' },
      { offbudget: 'account.offbudget' },
    ];
  }
  return ['*'];
}

function displayColumns(table: Table, rows: Row[]): string[] {
  if (table === 'transactions') {
    return ['date', 'payee', 'category', 'account', 'amount', 'notes'];
  }
  if (table === 'budgets') {
    return [
      'month',
      'category',
      'group',
      'budgeted',
      'spent',
      'available',
      'balance',
      'carryover',
      'goal',
      'saturation',
    ];
  }
  return rows.length > 0 ? Object.keys(rows[0]) : [];
}

function normalizeRow(r: Row, table: Table): Row {
  if (table !== 'transactions') return r;
  return {
    id: r.id,
    date: r.date,
    amount: r.amount == null ? 0 : Number(r.amount) / 100,
    payee: r.payee ?? '',
    category: r.category ?? '',
    account: r.account ?? '',
    notes: r.notes ?? '',
    cleared: r.cleared,
    reconciled: r.reconciled,
    offbudget: r.offbudget,
    onbudget: r.offbudget == null ? null : !r.offbudget,
  };
}

// --- grouping & aggregation ------------------------------------------------

function keyName(key: GroupKey): string {
  return key.bucket ?? key.field;
}

function bucketValue(row: Row, key: GroupKey): unknown {
  // Time buckets read `date` (transactions) or fall back to `month` — the
  // synthetic `budgets` source has a `month` field (`YYYY-MM`) and no `date`.
  if (key.bucket === 'month' || key.bucket === 'year') {
    const src = String(row.date ?? row.month ?? '');
    return key.bucket === 'month' ? src.slice(0, 7) : src.slice(0, 4);
  }
  return row[key.field];
}

function numericValues(rows: Row[], arg?: string): number[] {
  if (!arg) return [];
  return rows.map(r => Number(r[arg])).filter(v => !Number.isNaN(v));
}

function reduce(fn: Aggregation['fn'], rows: Row[], arg?: string): number {
  if (fn === 'count') return rows.length;
  if (fn === 'count_distinct') {
    return new Set(rows.map(r => r[arg])).size;
  }
  const vals = numericValues(rows, arg);
  if (vals.length === 0) return 0;
  switch (fn) {
    case 'sum':
      return vals.reduce((a, b) => a + b, 0);
    case 'mean':
    case 'avg':
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    case 'min':
      return Math.min(...vals);
    case 'max':
      return Math.max(...vals);
    case 'median': {
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    case 'mode': {
      const counts = new Map<number, number>();
      let best = vals[0];
      let bestCount = 0;
      for (const v of vals) {
        const c = (counts.get(v) ?? 0) + 1;
        counts.set(v, c);
        if (c > bestCount) {
          bestCount = c;
          best = v;
        }
      }
      return best;
    }
    case 'stddev': {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (vals.length < 2) return 0;
      const variance =
        vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1);
      return Math.sqrt(variance);
    }
    default:
      return 0;
  }
}

function round(n: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}

// --- derive (arithmetic) / select ------------------------------------------

const EXPR_FNS: Record<string, (args: number[]) => number> = {
  abs: a => Math.abs(a[0]),
  round: a => Math.round(a[0]),
  floor: a => Math.floor(a[0]),
  ceil: a => Math.ceil(a[0]),
  sqrt: a => Math.sqrt(a[0]),
  neg: a => -a[0],
  min: a => Math.min(...a),
  max: a => Math.max(...a),
};

function evalExpr(expr: Expr, row: Row): number | null {
  switch (expr.kind) {
    case 'num':
      return expr.value;
    case 'col': {
      const v = Number(row[expr.name]);
      return Number.isFinite(v) ? v : null;
    }
    case 'unary': {
      const v = evalExpr(expr.operand, row);
      return v == null ? null : -v;
    }
    case 'binary': {
      const l = evalExpr(expr.left, row);
      const r = evalExpr(expr.right, row);
      if (l == null || r == null) return null;
      switch (expr.op) {
        case '+':
          return l + r;
        case '-':
          return l - r;
        case '*':
          return l * r;
        case '/':
          return r === 0 ? null : l / r;
        default:
          return null;
      }
    }
    case 'call': {
      const fn = EXPR_FNS[expr.fn];
      if (!fn) {
        throw new Error(`Unknown function "${expr.fn}" in derive`);
      }
      const args = expr.args.map(a => evalExpr(a, row));
      if (args.some(a => a == null)) return null;
      const v = fn(args as number[]);
      return Number.isFinite(v) ? v : null;
    }
    default:
      return null;
  }
}

function applyDerive(rows: Row[], name: string, expr: Expr): void {
  for (const row of rows) {
    const v = evalExpr(expr, row);
    row[name] = v == null ? null : round(v);
  }
}

function applySelect(
  rows: Row[],
  cols: SelectColumn[],
  available: string[],
): { rows: Row[]; columns: string[] } {
  const availableSet = new Set(available);
  for (const c of cols) {
    if (!availableSet.has(c.src)) {
      throw new Error(
        `Unknown column "${c.src}" in select. Available columns: ${available.join(', ')}`,
      );
    }
  }
  const projected = rows.map(row => {
    const o: Row = {};
    for (const c of cols) o[c.out] = row[c.src];
    return o;
  });
  return { rows: projected, columns: cols.map(c => c.out) };
}

function groupAndAggregate(
  rows: Row[],
  keys: GroupKey[],
  aggs: Aggregation[],
): Row[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const keyVals = keys.map(k => bucketValue(row, k));
    const gid = JSON.stringify(keyVals);
    const bucket = groups.get(gid);
    if (bucket) bucket.push(row);
    else groups.set(gid, [row]);
  }

  const out: Row[] = [];
  for (const grows of groups.values()) {
    const result: Row = {};
    keys.forEach(k => {
      result[keyName(k)] = bucketValue(grows[0], k);
    });
    aggs.forEach(a => {
      result[a.name] = round(reduce(a.fn, grows, a.arg));
    });
    out.push(result);
  }
  return out;
}

// --- sort / window / forecast ----------------------------------------------

function sortRows(rows: Row[], key: string, dir: 'asc' | 'desc'): void {
  const sign = dir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') {
      return (av - bv) * sign;
    }
    return String(av ?? '').localeCompare(String(bv ?? '')) * sign;
  });
}

function applyWindow(rows: Row[], w: Extract<Stage, { kind: 'window' }>): void {
  const vals = rows.map(r => Number(r[w.arg]));
  const n = w.n ?? (w.fn === 'lag' ? 1 : 3);
  const total = vals.reduce((a, b) => a + (Number.isNaN(b) ? 0 : b), 0);

  rows.forEach((row, i) => {
    let v: number | null = null;
    switch (w.fn) {
      case 'rolling_avg': {
        const slice = vals.slice(Math.max(0, i - n + 1), i + 1);
        v = slice.reduce((a, b) => a + b, 0) / slice.length;
        break;
      }
      case 'running_total':
        v = vals.slice(0, i + 1).reduce((a, b) => a + b, 0);
        break;
      case 'delta':
        v = i === 0 ? null : vals[i] - vals[i - 1];
        break;
      case 'pct_of_total':
        v = total === 0 ? 0 : (vals[i] / total) * 100;
        break;
      case 'lag':
        v = i - n >= 0 ? vals[i - n] : null;
        break;
      default:
        v = null;
    }
    row[w.name] = v == null ? null : round(v);
  });
}

function shiftMonth(ym: string, k: number): string {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + k;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

function forecastRows(
  rows: Row[],
  keys: GroupKey[],
  fc: Extract<Stage, { kind: 'forecast' }>,
): Row[] {
  // Least-squares linear fit over the existing series.
  const points = rows
    .map((r, i) => ({ x: i, y: Number(r[fc.arg]) }))
    .filter(p => !Number.isNaN(p.y));
  if (points.length < 2) return [];

  const m = points.length;
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = m * sumXX - sumX * sumX;
  if (denom === 0) return [];
  const slope = (m * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / m;

  const timeKey = keys.find(k => k.bucket) ?? keys[0];
  const lastKeyVal = rows.length
    ? rows[rows.length - 1][keyName(timeKey)]
    : null;

  const out: Row[] = [];
  for (let k = 1; k <= fc.n; k++) {
    const predicted = round(intercept + slope * (rows.length - 1 + k));
    const row: Row = {};
    keys.forEach(key => {
      row[keyName(key)] = '';
    });
    if (timeKey?.bucket === 'month' && typeof lastKeyVal === 'string') {
      row[keyName(timeKey)] = shiftMonth(lastKeyVal, k) + ' *';
    } else if (timeKey?.bucket === 'year' && lastKeyVal != null) {
      row[keyName(timeKey)] = String(Number(lastKeyVal) + k) + ' *';
    } else {
      row[keyName(timeKey)] = `+${k} *`;
    }
    row[fc.name] = predicted;
    out.push(row);
  }
  return out;
}

// --- main ------------------------------------------------------------------

export async function runQuery(
  stages: Stage[],
  opts: { budgetType?: string } = {},
): Promise<QueryResult> {
  const start =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  const fromStage = stages.find(s => s.kind === 'from');
  const table: Table = fromStage ? fromStage.table : 'transactions';

  const filterStages = stages.filter(s => s.kind === 'filter');
  const excludeStages = stages.filter(s => s.kind === 'exclude');
  const groupStage = stages.find(s => s.kind === 'group');
  const aggStage = stages.find(s => s.kind === 'aggregate');
  const deriveStages = stages.filter(s => s.kind === 'derive');
  const havingStage = stages.find(s => s.kind === 'having');
  const selectStage = stages.find(s => s.kind === 'select');
  const sortStage = stages.find(s => s.kind === 'sort');
  const takeStage = stages.find(s => s.kind === 'take');
  const windowStages = stages.filter(s => s.kind === 'window');
  const forecastStage = stages.find(s => s.kind === 'forecast');

  const grouped = !!(groupStage || aggStage);
  const rawLimit = takeStage ? takeStage.n : DEFAULT_RAW_LIMIT;

  let rows: Row[];
  let sortPushed = false;

  if (table === 'budgets') {
    // Synthetic source: no SQL, so every filter/exclude runs client-side.
    rows = await loadBudgetRows(stages, opts.budgetType);
    const preds: Array<(r: Row) => boolean> = [
      ...filterStages.map(f => (r: Row) => evalCond(r, f.cond)),
      ...excludeStages.map(ex => (r: Row) => !evalCond(r, ex.cond)),
    ];
    if (preds.length) {
      rows = rows.filter(r => preds.every(p => p(r)));
    }
  } else {
    // Build the ActualQL query (positive, pushable filters).
    let query = q(table);
    const clientPreds: Array<(r: Row) => boolean> = [];

    for (const f of filterStages) {
      if (isPushable(f.cond)) {
        query = query.filter(condToAql(f.cond, table));
      } else {
        clientPreds.push(r => evalCond(r, f.cond));
      }
    }
    for (const ex of excludeStages) {
      clientPreds.push(r => !evalCond(r, ex.cond));
    }

    query = query.select(defaultSelect(table));

    // For raw (ungrouped) queries with no client-side post-processing, push the
    // sort + limit down to SQL. Otherwise we fetch the filtered rows and do the
    // remaining work (derive/having/sort/select/take) in JS.
    const PUSHABLE_SORT_FIELDS = new Set([
      'date',
      'amount',
      'notes',
      'id',
      'cleared',
      'reconciled',
      'payee',
      'category',
      'account',
    ]);
    const rawPostProcess =
      deriveStages.length > 0 || !!havingStage || !!selectStage;
    const canPushRaw =
      !grouped &&
      clientPreds.length === 0 &&
      !rawPostProcess &&
      (!sortStage || PUSHABLE_SORT_FIELDS.has(sortStage.key));

    if (canPushRaw) {
      if (sortStage) {
        query = query.orderBy({
          [aqlField(table, sortStage.key)]: sortStage.dir,
        });
      }
      query = query.limit(rawLimit + 1);
    }
    sortPushed = canPushRaw;

    const { data } = await aqlQuery(query);
    rows = (data as Row[]).map(r => normalizeRow(r, table));

    if (clientPreds.length) {
      rows = rows.filter(r => clientPreds.every(p => p(r)));
    }
  }

  let columns: string[];
  let resultRows: Row[];
  let truncated = false;

  const addColumn = (cols: string[], name: string) => {
    if (!cols.includes(name)) cols.push(name);
  };

  if (grouped) {
    const keys = groupStage ? groupStage.keys : [];
    const aggs: Aggregation[] = aggStage
      ? aggStage.aggs
      : [{ name: 'count', fn: 'count' }];

    resultRows = groupAndAggregate(rows, keys, aggs);
    columns = [...keys.map(keyName), ...aggs.map(a => a.name)];

    // Establish series order (needed for window functions).
    if (sortStage) {
      sortRows(resultRows, sortStage.key, sortStage.dir);
    } else if (keys.length > 0) {
      sortRows(resultRows, keyName(keys[0]), 'asc');
    }

    for (const w of windowStages) {
      applyWindow(resultRows, w);
      addColumn(columns, w.name);
    }

    for (const d of deriveStages) {
      applyDerive(resultRows, d.name, d.expr);
      addColumn(columns, d.name);
    }

    if (havingStage) {
      resultRows = resultRows.filter(r => evalCond(r, havingStage.cond));
    }

    // Re-sort once derived/aggregate columns exist so `sort` can target them.
    if (sortStage) {
      sortRows(resultRows, sortStage.key, sortStage.dir);
    }

    if (forecastStage) {
      resultRows = resultRows.concat(
        forecastRows(resultRows, keys, forecastStage),
      );
      addColumn(columns, forecastStage.name);
    }

    if (takeStage) {
      truncated = resultRows.length > takeStage.n;
      resultRows = resultRows.slice(0, takeStage.n);
    }
  } else {
    columns = displayColumns(table, rows);

    for (const d of deriveStages) {
      applyDerive(rows, d.name, d.expr);
      addColumn(columns, d.name);
    }

    if (havingStage) {
      rows = rows.filter(r => evalCond(r, havingStage.cond));
    }

    if (sortStage && !sortPushed) {
      sortRows(rows, sortStage.key, sortStage.dir);
    }

    if (rows.length > rawLimit) {
      truncated = true;
      rows = rows.slice(0, rawLimit);
    }
    resultRows = rows;
  }

  // Final projection (`select`) — pick / reorder / rename columns.
  if (selectStage) {
    const available = grouped
      ? columns
      : Array.from(
          new Set([
            ...columns,
            ...(resultRows[0] ? Object.keys(resultRows[0]) : []),
          ]),
        );
    const projected = applySelect(resultRows, selectStage.cols, available);
    resultRows = projected.rows;
    columns = projected.columns;
  }

  const end =
    typeof performance !== 'undefined' ? performance.now() : Date.now();

  return {
    columns,
    rows: resultRows,
    rowCount: resultRows.length,
    truncated,
    durationMs: Math.round(end - start),
    grouped,
  };
}
