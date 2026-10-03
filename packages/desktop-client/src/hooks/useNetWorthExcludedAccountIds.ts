import type { AccountEntity } from '@actual-app/core/types/models';

import { useAccounts } from '#hooks/useAccounts';
import { useSelector } from '#redux';

// ktn: ids of the accounts flagged with the per-account `exclude-from-net-worth`
// synced pref. Both sidebars feed this into the net-worth balance bindings.
export function useNetWorthExcludedAccountIds(): AccountEntity['id'][] {
  const { data: accounts = [] } = useAccounts();
  const syncedPrefs = useSelector(state => state.prefs.synced);

  return accounts
    .filter(
      account => syncedPrefs[`exclude-from-net-worth-${account.id}`] === 'true',
    )
    .map(account => account.id);
}
