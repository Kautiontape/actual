import React, { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Form } from 'react-aria-components';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { SvgCheckCircle1 } from '@actual-app/components/icons/v2';
import { InitialFocus } from '@actual-app/components/initial-focus';
import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { Query } from '@actual-app/core/shared/query';
import { tsToRelativeTime } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  TransactionEntity,
} from '@actual-app/core/types/models';
import type { TransObjectLiteral } from '@actual-app/core/types/util';
import { format as formatDate, parseISO } from 'date-fns';
import { t } from 'i18next';

import { useDateFormat } from '#hooks/useDateFormat';
import { useFormat } from '#hooks/useFormat';
import { useLocale } from '#hooks/useLocale';
import { usePayeesById } from '#hooks/usePayees';
import { useReconciliationSuggestion } from '#hooks/useReconciliationSuggestion';
import { useSheetValue } from '#hooks/useSheetValue';
import * as bindings from '#spreadsheet/bindings';

type ReconcilingMessageProps = {
  balanceQuery: { name: `balance-query-${string}`; query: Query };
  targetBalance: number;
  accountId?: AccountEntity['id'];
  onDone: () => void;
  onCreateTransaction: (targetDiff: number) => void;
  onUpdateTargetBalance?: (amount: number) => void;
  onClearTransactions?: (ids: Array<TransactionEntity['id']>) => void;
};

export function ReconcilingMessage({
  balanceQuery,
  targetBalance,
  accountId,
  onDone,
  onCreateTransaction,
  onUpdateTargetBalance,
  onClearTransactions,
}: ReconcilingMessageProps) {
  const cleared =
    useSheetValue<'balance', `balance-query-${string}-cleared`>({
      name: (balanceQuery.name +
        '-cleared') as `balance-query-${string}-cleared`,
      value: 0,
      query: balanceQuery.query.filter({ cleared: true }),
    }) ?? 0;
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const locale = useLocale();
  const { data: payeesById = {} } = usePayeesById();
  const targetDiff = targetBalance - cleared;

  const suggestion = useReconciliationSuggestion({
    accountId,
    targetBalance,
    clearedBalance: cleared,
    targetDiff,
  });
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  const clearedBalance = format(cleared, 'financial');
  const bankBalance = format(targetBalance, 'financial');
  const difference =
    (targetDiff > 0 ? '+' : '') + format(targetDiff, 'financial');

  return (
    <View
      style={{
        flexDirection: 'column',
        alignSelf: 'center',
        backgroundColor: theme.tableBackground,
        ...styles.shadow,
        borderRadius: 4,
        marginTop: 5,
        marginBottom: 15,
        padding: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {targetDiff === 0 ? (
          <View
            style={{
              color: theme.noticeTextLight,
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SvgCheckCircle1
              style={{
                width: 13,
                height: 13,
                color: 'inherit',
                marginRight: 3,
              }}
            />
            <Trans>All reconciled!</Trans>
          </View>
        ) : (
          <View style={{ color: theme.tableText }}>
            <Text style={{ fontStyle: 'italic', textAlign: 'center' }}>
              <Trans>
                Your cleared balance{' '}
                <strong>{{ clearedBalance } as TransObjectLiteral}</strong>{' '}
                needs <strong>{{ difference } as TransObjectLiteral}</strong> to
                match
                <br /> your bank&apos;s balance of{' '}
                <Text style={{ fontWeight: 700 }}>
                  {{ bankBalance } as TransObjectLiteral}
                </Text>
              </Trans>
            </Text>
          </View>
        )}
        <View style={{ marginLeft: 15 }}>
          <Button variant="primary" onPress={onDone}>
            {targetDiff === 0
              ? t('Lock transactions')
              : t('Exit reconciliation')}
          </Button>
        </View>
        {targetDiff !== 0 && !isConfirmingClear && (
          <View style={{ marginLeft: 15 }}>
            <Button onPress={() => onCreateTransaction(targetDiff)}>
              <Trans>Create reconciliation transaction</Trans>
            </Button>
          </View>
        )}
      </View>

      {targetDiff !== 0 &&
        suggestion.type === 'signFlip' &&
        onUpdateTargetBalance && (
          <View
            style={{
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ marginRight: 10 }}>
              <Trans>
                This looks like a sign error. Did you mean{' '}
                <strong>
                  {
                    {
                      corrected: format(
                        suggestion.correctedBalance,
                        'financial',
                      ),
                    } as TransObjectLiteral
                  }
                </strong>
                ?
              </Trans>
            </Text>
            <Button
              variant="primary"
              onPress={() => onUpdateTargetBalance(suggestion.correctedBalance)}
            >
              {t('Use {{corrected}}', {
                corrected: format(suggestion.correctedBalance, 'financial'),
              })}
            </Button>
          </View>
        )}

      {targetDiff !== 0 &&
        suggestion.type === 'clearTransactions' &&
        onClearTransactions &&
        (!isConfirmingClear ? (
          <View
            style={{
              marginTop: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ marginRight: 10 }}>
              <Trans>
                These uncleared transactions add up to exactly{' '}
                <strong>{{ difference } as TransObjectLiteral}</strong>.
              </Trans>
            </Text>
            <Button
              variant="primary"
              onPress={() => setIsConfirmingClear(true)}
            >
              <Trans>Review &amp; mark cleared</Trans>
            </Button>
          </View>
        ) : (
          <View style={{ marginTop: 10 }}>
            <View style={{ marginBottom: 8 }}>
              {suggestion.transactions.map(transaction => (
                <View
                  key={transaction.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: '2px 0',
                  }}
                >
                  <Text style={{ marginRight: 12, color: theme.tableText }}>
                    {formatDate(parseISO(transaction.date), dateFormat, {
                      locale,
                    })}
                  </Text>
                  <Text
                    style={{ flex: 1, marginRight: 12, color: theme.tableText }}
                  >
                    {(transaction.payee &&
                      payeesById[transaction.payee]?.name) ||
                      ''}
                  </Text>
                  <Text style={{ fontWeight: 700 }}>
                    {format(transaction.amount, 'financial')}
                  </Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
              <Button
                variant="primary"
                style={{ marginRight: 10 }}
                onPress={() =>
                  onClearTransactions(
                    suggestion.transactions.map(transaction => transaction.id),
                  )
                }
              >
                <Trans>Mark cleared &amp; reconcile</Trans>
              </Button>
              <Button onPress={() => setIsConfirmingClear(false)}>
                <Trans>Cancel</Trans>
              </Button>
            </View>
          </View>
        ))}
    </View>
  );
}

type ReconcileMenuProps = {
  account: AccountEntity;
  onReconcile: (amount: number | null) => void;
  onClose: () => void;
};

export function ReconcileMenu({
  account,
  onReconcile,
  onClose,
}: ReconcileMenuProps) {
  const balanceQuery = bindings.accountBalance(account.id);
  const clearedBalance = useSheetValue<'account', `balance-${string}-cleared`>({
    name: (balanceQuery.name + '-cleared') as `balance-${string}-cleared`,
    value: null,
    query: balanceQuery.query.filter({ cleared: true }),
  });
  const lastSyncedBalance = account.balance_current;
  const format = useFormat();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const locale = useLocale();

  const [inputValue, setInputValue] = useState<string | null>();
  // useEffect is needed here. clearedBalance does not work as a default value for inputValue and
  // to use a button to update inputValue we can't use defaultValue in the input form below
  useEffect(() => {
    if (clearedBalance != null) {
      setInputValue(format(clearedBalance, 'financial'));
    }
  }, [clearedBalance, format]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (inputValue === '') {
      return;
    }

    const amount =
      inputValue != null
        ? format.fromEdit(inputValue, clearedBalance)
        : clearedBalance;

    onReconcile(amount);
    onClose();
  }

  return (
    <Form onSubmit={onSubmit}>
      <View style={{ padding: '5px 8px' }}>
        <Text>
          <Trans>
            Enter the current balance of your bank account that you want to
            reconcile with:
          </Trans>
        </Text>
        {inputValue != null && (
          <InitialFocus>
            <Input
              value={inputValue}
              onChangeValue={setInputValue}
              style={{ margin: '7px 0', textAlign: 'right' }}
            />
          </InitialFocus>
        )}
        {lastSyncedBalance != null && (
          <View>
            <Text style={{ margin: '0 6px 8px 0', textAlign: 'right' }}>
              <Trans>Last Balance from Bank: </Trans>
              {format(lastSyncedBalance, 'financial')}
            </Text>
            <Button
              onPress={() =>
                setInputValue(format(lastSyncedBalance, 'financial'))
              }
              style={{ marginBottom: 7 }}
            >
              <Trans>Use last synced total</Trans>
            </Button>
          </View>
        )}
        <Button type="submit" variant="primary">
          <Trans>Reconcile</Trans>
        </Button>
        <Text
          style={{
            color: theme.pageTextLight,
            marginTop: '8px',
            textAlign: 'center',
          }}
        >
          {account?.last_reconciled
            ? t('Reconciled {{ relativeTimeAgo }} ({{ absoluteDate }})', {
                relativeTimeAgo: tsToRelativeTime(
                  account.last_reconciled,
                  locale,
                ),
                absoluteDate: formatDate(
                  new Date(parseInt(account.last_reconciled ?? '0', 10)),
                  dateFormat,
                  { locale },
                ),
              })
            : t('Not yet reconciled')}
        </Text>
      </View>
    </Form>
  );
}
