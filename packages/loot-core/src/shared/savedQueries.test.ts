import { describe, expect, it } from 'vitest';

import { groupByFolder, normalizeFolder } from './savedQueries';

describe('normalizeFolder', () => {
  it('returns empty string for null/undefined/blank', () => {
    expect(normalizeFolder(null)).toBe('');
    expect(normalizeFolder(undefined)).toBe('');
    expect(normalizeFolder('   ')).toBe('');
  });

  it('trims segments and drops empties / collapses slashes', () => {
    expect(normalizeFolder('/Spending/2024/')).toBe('Spending/2024');
    expect(normalizeFolder(' Spending //  2024 ')).toBe('Spending/2024');
    expect(normalizeFolder('Examples')).toBe('Examples');
  });
});

describe('groupByFolder', () => {
  const q = (id: string, name: string, folder: string) => ({
    id,
    name,
    folder,
    query: '',
  });

  it('groups by folder and sorts folders then names', () => {
    const groups = groupByFolder([
      q('3', 'Zebra', 'Spending'),
      q('1', 'apple', 'Spending'),
      q('2', 'Root item', ''),
    ]);

    expect(groups.map(g => g.folder)).toEqual(['', 'Spending']);
    expect(groups[1].queries.map(x => x.name)).toEqual(['apple', 'Zebra']);
  });
});
