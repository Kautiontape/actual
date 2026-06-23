import { describe, expect, it } from 'vitest';

import { parseQuery, QueryParseError } from './parse';
import type { Stage } from './parse';

function only<K extends Stage['kind']>(
  stages: Stage[],
  kind: K,
): Extract<Stage, { kind: K }> {
  const found = stages.find(s => s.kind === kind);
  if (!found) throw new Error(`No ${kind} stage`);
  return found as Extract<Stage, { kind: K }>;
}

describe('parseQuery', () => {
  it('parses a basic filter pipeline', () => {
    const stages = parseQuery(
      [
        'from transactions',
        'filter payee ~ "Costco" and amount <= -50',
        'sort -date',
        'take 50',
      ].join('\n'),
    );

    expect(only(stages, 'from').table).toBe('transactions');
    expect(only(stages, 'sort')).toMatchObject({ key: 'date', dir: 'desc' });
    expect(only(stages, 'take').n).toBe(50);

    const cond = only(stages, 'filter').cond;
    expect(cond.kind).toBe('and');
  });

  it('treats comments and blank lines as ignorable', () => {
    const stages = parseQuery(
      ['# a comment', '', 'from transactions', '  # indented comment'].join(
        '\n',
      ),
    );
    expect(stages).toHaveLength(1);
  });

  it('does not strip # inside a string', () => {
    const stages = parseQuery('filter notes ~ "#vacation"');
    const cond = only(stages, 'filter').cond;
    expect(cond).toMatchObject({
      kind: 'compare',
      field: 'notes',
      op: '~',
      values: [{ type: 'string', value: '#vacation' }],
    });
  });

  it('parses in-lists and negation', () => {
    const incl = only(
      parseQuery('filter payee in ("Costco", "Sam\'s Club")'),
      'filter',
    ).cond;
    expect(incl).toMatchObject({ kind: 'compare', op: 'in' });
    if (incl.kind === 'compare') {
      expect(incl.values).toHaveLength(2);
    }

    const excl = only(parseQuery('exclude id in ("a", "b")'), 'exclude').cond;
    expect(excl).toMatchObject({ kind: 'compare', op: 'in', field: 'id' });
  });

  it('parses a bare boolean field as `== true`', () => {
    const cond = only(parseQuery('filter onbudget'), 'filter').cond;
    expect(cond).toEqual({
      kind: 'compare',
      field: 'onbudget',
      op: '==',
      values: [{ type: 'bool', value: true }],
    });
  });

  it('combines a bare boolean with other conditions', () => {
    const cond = only(
      parseQuery('filter onbudget and amount < 0'),
      'filter',
    ).cond;
    expect(cond.kind).toBe('and');
    if (cond.kind === 'and') {
      expect(cond.left).toMatchObject({ field: 'onbudget', op: '==' });
      expect(cond.right).toMatchObject({ field: 'amount', op: '<' });
    }
  });

  it('supports `not` before a bare boolean field', () => {
    const cond = only(parseQuery('filter not offbudget'), 'filter').cond;
    expect(cond).toMatchObject({
      kind: 'not',
      cond: { field: 'offbudget', op: '==' },
    });
  });

  it('resolves relative date helpers to ISO dates', () => {
    const cond = only(
      parseQuery('filter date >= last 12 months'),
      'filter',
    ).cond;
    expect(cond.kind).toBe('compare');
    if (cond.kind === 'compare') {
      expect(cond.values[0].type).toBe('date');
      expect(cond.values[0].value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('parses group + aggregate with multiple definitions', () => {
    const stages = parseQuery(
      [
        'from transactions',
        'group month',
        'aggregate spend = sum amount, typical = median amount, n = count',
      ].join('\n'),
    );

    expect(only(stages, 'group').keys).toEqual([
      { field: 'date', bucket: 'month' },
    ]);

    const aggs = only(stages, 'aggregate').aggs;
    expect(aggs).toEqual([
      { name: 'spend', fn: 'sum', arg: 'amount' },
      { name: 'typical', fn: 'median', arg: 'amount' },
      { name: 'n', fn: 'count' },
    ]);
  });

  it('parses window and forecast verbs', () => {
    const stages = parseQuery(
      [
        'group month',
        'aggregate spend = sum amount',
        'window avg_3 = rolling_avg spend 3',
        'forecast projected = spend 3',
      ].join('\n'),
    );

    expect(only(stages, 'window')).toMatchObject({
      name: 'avg_3',
      fn: 'rolling_avg',
      arg: 'spend',
      n: 3,
    });
    expect(only(stages, 'forecast')).toMatchObject({
      name: 'projected',
      arg: 'spend',
      n: 3,
    });
  });

  it('parses select with renames', () => {
    const stage = only(
      parseQuery('select date, spend = amount, payee'),
      'select',
    );
    expect(stage.cols).toEqual([
      { out: 'date', src: 'date' },
      { out: 'spend', src: 'amount' },
      { out: 'payee', src: 'payee' },
    ]);
  });

  it('parses having as a condition', () => {
    const cond = only(parseQuery('having spend < -2000'), 'having').cond;
    expect(cond).toMatchObject({ kind: 'compare', field: 'spend', op: '<' });
  });

  it('parses derive arithmetic with correct precedence', () => {
    const stage = only(
      parseQuery('derive pct = (income - spend) / income * 100'),
      'derive',
    );
    expect(stage.name).toBe('pct');
    // ((income - spend) / income) * 100
    expect(stage.expr).toMatchObject({
      kind: 'binary',
      op: '*',
      right: { kind: 'num', value: 100 },
      left: {
        kind: 'binary',
        op: '/',
        left: {
          kind: 'binary',
          op: '-',
          left: { kind: 'col', name: 'income' },
          right: { kind: 'col', name: 'spend' },
        },
        right: { kind: 'col', name: 'income' },
      },
    });
  });

  it('parses derive with a function call', () => {
    const stage = only(parseQuery('derive a = abs(amount)'), 'derive');
    expect(stage.expr).toMatchObject({
      kind: 'call',
      fn: 'abs',
      args: [{ kind: 'col', name: 'amount' }],
    });
  });

  it('rejects malformed derive expressions', () => {
    expect(() => parseQuery('derive x = 1 +')).toThrow(QueryParseError);
    expect(() => parseQuery('derive x = (1 + 2')).toThrow(QueryParseError);
  });

  it('rejects unknown verbs', () => {
    expect(() => parseQuery('frobnicate transactions')).toThrow(
      QueryParseError,
    );
  });

  it('accepts budgets as a from table', () => {
    const stages = parseQuery('from budgets');
    expect(only(stages, 'from')).toEqual({ kind: 'from', table: 'budgets' });
  });

  it('rejects unknown tables and aggregate functions', () => {
    expect(() => parseQuery('from spaceships')).toThrow(/Unknown table/);
    expect(() => parseQuery('aggregate x = bogus amount')).toThrow(
      /Unknown aggregate/,
    );
  });

  it('reports the offending line number', () => {
    try {
      parseQuery(['from transactions', 'filter amount <<'].join('\n'));
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(QueryParseError);
      expect((e as QueryParseError).line).toBe(2);
    }
  });
});
