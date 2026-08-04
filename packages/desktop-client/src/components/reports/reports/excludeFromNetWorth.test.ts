import type { AccountEntity } from '@actual-app/core/types/models';

import { selectNetWorthAccounts } from './excludeFromNetWorth';

const acct = (id: string): AccountEntity => ({ id, name: id }) as AccountEntity;

describe('selectNetWorthAccounts', () => {
  it('drops accounts flagged exclude-from-net-worth', () => {
    const accounts = [acct('a1'), acct('a2'), acct('a3')];
    const result = selectNetWorthAccounts(accounts, {
      'exclude-from-net-worth-a2': 'true',
    });
    expect(result.map(a => a.id)).toEqual(['a1', 'a3']);
  });

  it('keeps every account when none are flagged', () => {
    const accounts = [acct('a1'), acct('a2')];
    expect(selectNetWorthAccounts(accounts, {}).map(a => a.id)).toEqual([
      'a1',
      'a2',
    ]);
  });

  it('treats any non-"true" value as included', () => {
    const accounts = [acct('a1')];
    expect(
      selectNetWorthAccounts(accounts, {
        'exclude-from-net-worth-a1': 'false',
      }).map(a => a.id),
    ).toEqual(['a1']);
  });
});
