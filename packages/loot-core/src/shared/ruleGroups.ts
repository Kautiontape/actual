// Display-only grouping for the Rules page. Rules still run by stage and rank;
// these groups only decide which collapsible section a rule is listed under.
import type { RuleEntity } from '#types/models';

export const RULE_GROUPS = ['custom', 'payee-category', 'schedule'] as const;

export type RuleGroup = (typeof RULE_GROUPS)[number];

export function classifyRule(rule: RuleEntity): RuleGroup {
  if (rule.actions.some(action => action.op === 'link-schedule')) {
    return 'schedule';
  }

  // The shape Actual's category learning creates and maintains:
  // "payee is X" -> "set category to Y", in the default stage
  const [condition] = rule.conditions;
  const [action] = rule.actions;
  if (
    !rule.stage &&
    rule.conditions.length === 1 &&
    condition.field === 'payee' &&
    condition.op === 'is' &&
    rule.actions.length === 1 &&
    action.op === 'set' &&
    action.field === 'category'
  ) {
    return 'payee-category';
  }

  return 'custom';
}

// Splits rules into groups, keeping each group in the order the rules were
// given (the run order from `rules-get`)
export function groupRules(
  rules: readonly RuleEntity[],
): Record<RuleGroup, RuleEntity[]> {
  const groups: Record<RuleGroup, RuleEntity[]> = {
    custom: [],
    'payee-category': [],
    schedule: [],
  };
  for (const rule of rules) {
    groups[classifyRule(rule)].push(rule);
  }
  return groups;
}
