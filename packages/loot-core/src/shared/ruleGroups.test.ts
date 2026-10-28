import type { RuleEntity } from '#types/models';

import { classifyRule, groupRules } from './ruleGroups';

function rule(overrides: Partial<RuleEntity>): RuleEntity {
  return {
    id: 'r',
    stage: null,
    conditionsOp: 'and',
    conditions: [{ op: 'is', field: 'payee', value: 'p1', type: 'id' }],
    actions: [{ op: 'set', field: 'category', value: 'c1', type: 'id' }],
    ...overrides,
  };
}

describe('classifyRule', () => {
  test('a single payee-is to set-category rule is payee-category', () => {
    expect(classifyRule(rule({}))).toBe('payee-category');
  });

  test('any link-schedule action makes it a schedule rule', () => {
    expect(
      classifyRule(
        rule({
          actions: [
            { op: 'set', field: 'category', value: 'c1', type: 'id' },
            { op: 'link-schedule', value: 's1' },
          ],
        }),
      ),
    ).toBe('schedule');
  });

  test('a staged rule is custom', () => {
    expect(classifyRule(rule({ stage: 'pre' }))).toBe('custom');
  });

  test('extra conditions make it custom', () => {
    expect(
      classifyRule(
        rule({
          conditions: [
            { op: 'is', field: 'payee', value: 'p1', type: 'id' },
            { op: 'gt', field: 'amount', value: 10000, type: 'number' },
          ],
        }),
      ),
    ).toBe('custom');
  });

  test('a payee one-of condition is custom', () => {
    expect(
      classifyRule(
        rule({
          conditions: [
            { op: 'oneOf', field: 'payee', value: ['p1', 'p2'], type: 'id' },
          ],
        }),
      ),
    ).toBe('custom');
  });

  test('a non-category action is custom', () => {
    expect(
      classifyRule(
        rule({
          actions: [{ op: 'set', field: 'payee', value: 'p2', type: 'id' }],
        }),
      ),
    ).toBe('custom');
  });

  test('extra actions make it custom', () => {
    expect(
      classifyRule(
        rule({
          actions: [
            { op: 'set', field: 'category', value: 'c1', type: 'id' },
            { op: 'set', field: 'amount', value: 0, type: 'number' },
          ],
        }),
      ),
    ).toBe('custom');
  });
});

describe('groupRules', () => {
  test('keeps the given order within each group', () => {
    const rules = [
      rule({ id: 'a' }),
      rule({ id: 'b', stage: 'post' }),
      rule({ id: 'c' }),
      rule({ id: 'd', actions: [{ op: 'link-schedule', value: 's1' }] }),
    ];
    const groups = groupRules(rules);
    expect(groups['payee-category'].map(r => r.id)).toEqual(['a', 'c']);
    expect(groups.custom.map(r => r.id)).toEqual(['b']);
    expect(groups.schedule.map(r => r.id)).toEqual(['d']);
  });
});
