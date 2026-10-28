// @ts-strict-ignore
import React, { useEffect, useEffectEvent, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SpaceBetween } from '@actual-app/components/space-between';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as undo from '@actual-app/core/platform/client/undo';
import { getNormalisedString } from '@actual-app/core/shared/normalisation';
import { q } from '@actual-app/core/shared/query';
import { groupRules, RULE_GROUPS } from '@actual-app/core/shared/ruleGroups';
import type { RuleGroup } from '@actual-app/core/shared/ruleGroups';
import type {
  NewRuleEntity,
  RuleEntity,
  ScheduleEntity,
} from '@actual-app/core/types/models';

import { useAccounts } from '#hooks/useAccounts';
import { useCategories } from '#hooks/useCategories';
import { usePayees } from '#hooks/usePayees';
import { useSchedules } from '#hooks/useSchedules';
import { SelectedProvider, useSelected } from '#hooks/useSelected';
import { pushModal } from '#modals/modalsSlice';
import { useDispatch } from '#redux';
import { friendlyOp, mapField } from '#util/rule';
import { describeSchedule } from '#util/schedule';

import { InfiniteScrollWrapper } from './common/InfiniteScrollWrapper';
import { Link } from './common/Link';
import { Search } from './common/Search';
import { RuleGroupHeader } from './rules/RuleGroupHeader';
import { RulesHeader } from './rules/RulesHeader';
import { RulesList } from './rules/RulesList';

export type FilterData = {
  payees?: Array<{ id: string; name: string }>;
  categories?: Array<{ id: string; name: string }>;
  accounts?: Array<{ id: string; name: string }>;
  schedules?: readonly ScheduleEntity[];
};

export function mapValue(
  field: string,
  value: unknown,
  { payees = [], categories = [], accounts = [] }: Partial<FilterData>,
) {
  if (!value) return '';

  let object = null;
  if (field === 'payee') {
    object = payees.find(p => p.id === value);
  } else if (field === 'category') {
    object = categories.find(c => c.id === value);
  } else if (field === 'account') {
    object = accounts.find(a => a.id === value);
  } else {
    return value;
  }
  if (object) {
    return object.name;
  }
  return '(deleted)';
}

export function ruleToString(rule: RuleEntity, data: FilterData) {
  const conditions = rule.conditions.flatMap(cond => [
    mapField(cond.field),
    friendlyOp(cond.op),
    cond.op === 'oneOf' || cond.op === 'notOneOf'
      ? Array.isArray(cond.value)
        ? cond.value.map(v => mapValue(cond.field, v, data)).join(', ')
        : mapValue(cond.field, cond.value, data)
      : mapValue(cond.field, cond.value, data),
  ]);
  const actions = rule.actions.flatMap(action => {
    if (action.op === 'set') {
      return [
        friendlyOp(action.op),
        mapField(action.field),
        'to',
        mapValue(action.field, action.value, data),
      ];
    } else if (action.op === 'link-schedule') {
      const schedule = data.schedules?.find(s => s.id === String(action.value));
      return [
        friendlyOp(action.op),
        schedule
          ? describeSchedule(
              schedule,
              data.payees?.find(p => p.id === schedule._payee),
            )
          : '-',
      ];
    } else if (action.op === 'prepend-notes' || action.op === 'append-notes') {
      const noteValue = String(action.value || '');
      return [friendlyOp(action.op), '\u201c' + noteValue + '\u201d'];
    } else if (action.op === 'delete-transaction') {
      return [friendlyOp(action.op), '(delete)'];
    } else {
      return [];
    }
  });
  return (
    (rule.stage || '') + ' ' + conditions.join(' ') + ' ' + actions.join(' ')
  );
}

type ManageRulesProps = {
  isModal: boolean;
  payeeId: string | null;
  setLoading?: Dispatch<SetStateAction<boolean>>;
};

export function ManageRules({
  isModal,
  payeeId,
  setLoading = () => {},
}: ManageRulesProps) {
  const { t } = useTranslation();

  const [allRules, setAllRules] = useState<RuleEntity[]>([]);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<RuleGroup>>(
    () => new Set(['custom']),
  );
  const dispatch = useDispatch();
  // A payee's rules are only a handful, so the payee modal stays a flat list
  const isGrouped = !payeeId;

  const { schedules = [] } = useSchedules({
    query: useMemo(() => q('schedules').select('*'), []),
  });
  const { data: { list: categories } = { list: [] } } = useCategories();
  const { data: payees } = usePayees();
  const { data: accounts = [] } = useAccounts();
  const filterData = useMemo(
    () => ({
      payees,
      accounts,
      schedules,
      categories,
    }),
    [payees, accounts, schedules, categories],
  );

  const matchingRules = useMemo(() => {
    const rules = allRules.filter(rule => {
      const schedule = schedules.find(schedule => schedule.rule === rule.id);
      return schedule ? schedule.completed === false : true;
    });

    return filter === ''
      ? rules
      : rules.filter(rule =>
          getNormalisedString(ruleToString(rule, filterData)).includes(
            getNormalisedString(filter),
          ),
        );
  }, [allRules, filter, filterData, schedules]);

  // Group before paginating so headers show full counts and collapsed groups
  // don't use up the page. A search opens every group that has a match.
  const sections = useMemo(() => {
    let remaining = 100 + page * 50;
    if (!isGrouped) {
      return [
        {
          group: null,
          total: 0,
          isExpanded: true,
          rules: matchingRules.slice(0, remaining),
        },
      ];
    }
    const groups = groupRules(matchingRules);
    return RULE_GROUPS.filter(group => groups[group].length > 0).map(group => {
      const isExpanded = filter !== '' || expandedGroups.has(group);
      const rules = isExpanded ? groups[group].slice(0, remaining) : [];
      remaining -= rules.length;
      return { group, total: groups[group].length, isExpanded, rules };
    });
  }, [expandedGroups, filter, isGrouped, matchingRules, page]);

  // Only rows on screen are selectable, so select-all can't reach into a
  // collapsed group
  const filteredRules = useMemo(
    () => sections.flatMap(section => section.rules),
    [sections],
  );

  const selectedInst = useSelected('manage-rules', filteredRules, []);
  const [hoveredRule, setHoveredRule] = useState(null);

  const onSearchChange = (value: string) => {
    setFilter(value);
    setPage(0);
  };

  async function loadRules() {
    setLoading(true);

    let loadedRules = null;
    if (payeeId) {
      loadedRules = await send('payees-get-rules', {
        id: payeeId,
      });
    } else {
      loadedRules = await send('rules-get');
    }

    setAllRules(loadedRules);
    return loadedRules;
  }

  const init = useEffectEvent(() => {
    async function loadData() {
      await loadRules();
      setLoading(false);
    }

    if (payeeId) {
      undo.setUndoState('openModal', { name: 'manage-rules', options: {} });
    }

    void loadData();

    return () => {
      undo.setUndoState('openModal', null);
    };
  });
  useEffect(() => {
    return init();
  }, []);

  function loadMore() {
    setPage(page => page + 1);
  }

  const onDeleteSelected = async () => {
    setLoading(true);

    const { someDeletionsFailed } = await send('rule-delete-all', [
      ...selectedInst.items,
    ]);

    if (someDeletionsFailed) {
      alert(
        t('Some rules were not deleted because they are linked to schedules.'),
      );
    }

    await loadRules();
    selectedInst.dispatch({ type: 'select-none' });
    setLoading(false);
  };

  async function onDeleteRule(id: string) {
    setLoading(true);
    await send('rule-delete', id);
    await loadRules();
    setLoading(false);
  }

  const onEditRule = rule => {
    dispatch(
      pushModal({
        modal: {
          name: 'edit-rule',
          options: {
            rule,
            onSave: async () => {
              await loadRules();
              setLoading(false);
            },
          },
        },
      }),
    );
  };

  function onCreateRule() {
    const rule: NewRuleEntity = {
      stage: null,
      conditionsOp: 'and',
      conditions: [
        {
          field: 'payee',
          op: 'is',
          value: payeeId || null,
          type: 'id',
        },
      ],
      actions: [
        {
          op: 'set',
          field: 'category',
          value: null,
          type: 'id',
        },
      ],
    };

    dispatch(
      pushModal({
        modal: {
          name: 'edit-rule',
          options: {
            rule,
            onSave: async () => {
              await loadRules();
              setLoading(false);
            },
          },
        },
      }),
    );
  }

  const onHover = id => {
    setHoveredRule(id);
  };

  function onToggleGroup(group: RuleGroup) {
    const isExpanded = expandedGroups.has(group);
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (isExpanded) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
    if (isExpanded) {
      // Rows that just collapsed shouldn't stay selected out of sight
      selectedInst.dispatch({ type: 'select-none' });
    }
  }

  return (
    <SelectedProvider instance={selectedInst}>
      <View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: isModal ? '0 13px 15px' : '0 0 15px',
            flexShrink: 0,
          }}
        >
          <View
            style={{
              color: theme.pageTextLight,
              flexDirection: 'row',
              alignItems: 'center',
              width: '50%',
            }}
          >
            <Text>
              {isGrouped ? (
                <Trans>
                  Rules are grouped for display. Within each group they are
                  listed in the order they run.
                </Trans>
              ) : (
                <Trans>
                  Rules are always run in the order that you see them.
                </Trans>
              )}{' '}
              <Link
                variant="external"
                to="https://actualbudget.org/docs/budgeting/rules/"
                linkColor="muted"
              >
                <Trans>Learn more</Trans>
              </Link>
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <Search
            placeholder={t('Filter rules...')}
            value={filter}
            onChange={onSearchChange}
          />
        </View>
        <View style={styles.tableContainer}>
          <RulesHeader />
          <InfiniteScrollWrapper loadMore={loadMore}>
            {matchingRules.length === 0 ? (
              <EmptyMessage text={t('No rules')} style={{ marginTop: 15 }} />
            ) : (
              sections.map(section => (
                <View key={section.group ?? 'all'}>
                  {section.group && (
                    <RuleGroupHeader
                      group={section.group}
                      count={section.total}
                      isExpanded={section.isExpanded}
                      isDisabled={filter !== ''}
                      onToggle={() => onToggleGroup(section.group)}
                    />
                  )}
                  <RulesList
                    rules={section.rules}
                    selectedItems={selectedInst.items}
                    hoveredRule={hoveredRule}
                    onHover={onHover}
                    onEditRule={onEditRule}
                    onDeleteRule={rule => onDeleteRule(rule.id)}
                  />
                </View>
              ))
            )}
          </InfiniteScrollWrapper>
        </View>
        <View
          style={{
            paddingBlock: 15,
            paddingInline: isModal ? 13 : 0,
            borderTop: isModal && '1px solid ' + theme.pillBorder,
            flexShrink: 0,
          }}
        >
          <SpaceBetween gap={10} style={{ justifyContent: 'flex-end' }}>
            {selectedInst.items.size > 0 && (
              <Button onPress={onDeleteSelected}>
                <Trans count={selectedInst.items.size}>
                  Delete {{ count: selectedInst.items.size }} rules
                </Trans>
              </Button>
            )}
            <Button variant="primary" onPress={onCreateRule}>
              <Trans>Create new rule</Trans>
            </Button>
          </SpaceBetween>
        </View>
      </View>
    </SelectedProvider>
  );
}

function EmptyMessage({ text, style }) {
  return (
    <View
      style={{
        textAlign: 'center',
        color: theme.pageTextSubdued,
        fontStyle: 'italic',
        fontSize: 13,
        marginTop: 5,
        style,
      }}
    >
      {text}
    </View>
  );
}
