import type { AccountEntity } from '@actual-app/core/types/models';
import type { SyncedPrefs } from '@actual-app/core/types/prefs';

// ktn: accounts the user has flagged with the per-account `exclude-from-net-worth`
// synced pref are dropped before the Net Worth report sums balances. Pure so the
// selection can be unit-tested without rendering the report.
export function selectNetWorthAccounts(
  accounts: AccountEntity[],
  syncedPrefs: SyncedPrefs,
): AccountEntity[] {
  return accounts.filter(
    account => syncedPrefs[`exclude-from-net-worth-${account.id}`] !== 'true',
  );
}
