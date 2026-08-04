// Folders are virtual: a folder exists only as a `folder` value on a query.
// Root is represented by the empty string. This normalizes a user-entered
// path: trim each segment, drop empty segments, collapse repeated slashes.
export function normalizeFolder(folder: string | null | undefined): string {
  if (folder == null) {
    return '';
  }
  return folder
    .split('/')
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0)
    .join('/');
}

export type SavedQueryFolderGroup<T> = {
  folder: string;
  queries: T[];
};

// Group queries by their exact folder path, sorting folders alphabetically
// (root — empty string — sorts first) and queries by name within each folder.
// Generic over the query shape so this stays decoupled from the entity type.
export function groupByFolder<T extends { name: string; folder: string }>(
  queries: T[],
): SavedQueryFolderGroup<T>[] {
  const byFolder = new Map<string, T[]>();
  for (const query of queries) {
    const folder = query.folder ?? '';
    const list = byFolder.get(folder) ?? [];
    list.push(query);
    byFolder.set(folder, list);
  }

  return [...byFolder.entries()]
    .sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { ignorePunctuation: true }),
    )
    .map(([folder, list]) => ({
      folder,
      queries: list.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { ignorePunctuation: true }),
      ),
    }));
}
