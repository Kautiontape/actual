import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgExpandArrow } from '@actual-app/components/icons/v0';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { RuleGroup } from '@actual-app/core/shared/ruleGroups';

type RuleGroupHeaderProps = {
  group: RuleGroup;
  count: number;
  isExpanded: boolean;
  isDisabled?: boolean;
  onToggle: () => void;
};

export function RuleGroupHeader({
  group,
  count,
  isExpanded,
  isDisabled = false,
  onToggle,
}: RuleGroupHeaderProps) {
  const { t } = useTranslation();
  const labels: Record<RuleGroup, string> = {
    custom: t('Custom rules'),
    'payee-category': t('Payee to category'),
    schedule: t('Scheduled'),
  };

  return (
    <View
      style={{
        backgroundColor: theme.tableRowHeaderBackground,
        borderBottom: '1px solid ' + theme.tableBorder,
      }}
    >
      <Button
        variant="bare"
        isDisabled={isDisabled}
        aria-expanded={isExpanded}
        onPress={onToggle}
        style={{
          justifyContent: 'flex-start',
          padding: '8px 13px',
          color: theme.tableRowHeaderText,
          fontWeight: 600,
          borderRadius: 0,
        }}
      >
        <SvgExpandArrow
          width={8}
          height={8}
          style={{
            marginRight: 8,
            transform: isExpanded ? undefined : 'rotate(-90deg)',
          }}
        />
        {labels[group]}
        <View
          style={{
            marginLeft: 6,
            color: theme.pageTextSubdued,
            fontWeight: 400,
          }}
        >
          {count}
        </View>
      </Button>
    </View>
  );
}
