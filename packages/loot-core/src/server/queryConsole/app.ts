import { v4 as uuidv4 } from 'uuid';

import { createApp } from '#server/app';
import { aqlQuery } from '#server/aql';
import * as db from '#server/db';
import { mutator } from '#server/mutators';
import { undoable } from '#server/undo';
import { q } from '#shared/query';
import { normalizeFolder } from '#shared/savedQueries';
import type { SavedQueryEntity } from '#types/models';

type SavedQueryRow = {
  id: string;
  name: string;
  folder: string;
  query: string;
};

function sort(items: SavedQueryEntity[]) {
  return items.sort((a, b) => {
    const byFolder = (a.folder ?? '').localeCompare(b.folder ?? '', undefined, {
      ignorePunctuation: true,
    });
    if (byFolder !== 0) {
      return byFolder;
    }
    return a.name.localeCompare(b.name, undefined, { ignorePunctuation: true });
  });
}

async function getSavedQueries(): Promise<SavedQueryEntity[]> {
  const { data }: { data: SavedQueryRow[] } = await aqlQuery(
    q('saved_queries').select('*'),
  );
  return sort(
    data.map(row => ({
      id: row.id,
      name: row.name ?? '',
      folder: row.folder ?? '',
      query: row.query ?? '',
    })),
  );
}

// A (folder, name) pair must be unique among non-tombstoned rows.
async function nameExists(folder: string, name: string, id: string | null) {
  const row = await db.first<Pick<db.DbSavedQuery, 'id'>>(
    `SELECT id FROM saved_queries
       WHERE tombstone = 0 AND IFNULL(folder, '') = ? AND name = ?`,
    [folder, name],
  );
  if (row == null) {
    return false;
  }
  return row.id !== id;
}

type CreateInput = { name: string; folder: string; query: string };

async function createSavedQuery(input: CreateInput) {
  const name = input.name?.trim();
  if (!name) {
    throw new Error('Query name is required');
  }
  if (!input.query?.trim()) {
    throw new Error('Query text is required');
  }
  const folder = normalizeFolder(input.folder);
  if (await nameExists(folder, name, null)) {
    throw new Error(`There is already a query named "${name}" in this folder`);
  }

  const id = uuidv4();
  await db.insertWithSchema('saved_queries', {
    id,
    name,
    folder,
    query: input.query,
  });
  return id;
}

async function updateSavedQuery(input: SavedQueryEntity) {
  if (!input.id) {
    throw new Error('Query id is required');
  }
  const name = input.name?.trim();
  if (!name) {
    throw new Error('Query name is required');
  }
  if (!input.query?.trim()) {
    throw new Error('Query text is required');
  }
  const folder = normalizeFolder(input.folder);
  if (await nameExists(folder, name, input.id)) {
    throw new Error(`There is already a query named "${name}" in this folder`);
  }

  await db.updateWithSchema('saved_queries', {
    id: input.id,
    name,
    folder,
    query: input.query,
  });
}

async function deleteSavedQuery(id: SavedQueryEntity['id']) {
  await db.delete_('saved_queries', id);
}

// Bulk-move a virtual folder: rewrite the folder prefix on every query in it
// and in its subfolders. Used by the manager's "rename folder" action.
async function moveFolder({ from, to }: { from: string; to: string }) {
  const fromFolder = normalizeFolder(from);
  const toFolder = normalizeFolder(to);
  if (fromFolder === toFolder) {
    return;
  }

  const { data }: { data: SavedQueryRow[] } = await aqlQuery(
    q('saved_queries').select('*'),
  );
  for (const row of data) {
    const folder = row.folder ?? '';
    let nextFolder: string | null = null;
    if (folder === fromFolder) {
      nextFolder = toFolder;
    } else if (fromFolder !== '' && folder.startsWith(fromFolder + '/')) {
      nextFolder = toFolder + folder.slice(fromFolder.length);
    }
    if (nextFolder != null) {
      await db.updateWithSchema('saved_queries', {
        id: row.id,
        name: row.name,
        folder: nextFolder,
        query: row.query,
      });
    }
  }
}

export type SavedQueryHandlers = {
  'saved-query/get': typeof getSavedQueries;
  'saved-query/create': typeof createSavedQuery;
  'saved-query/update': typeof updateSavedQuery;
  'saved-query/delete': typeof deleteSavedQuery;
  'saved-query/move-folder': typeof moveFolder;
};

export const app = createApp<SavedQueryHandlers>();

app.method('saved-query/get', getSavedQueries);
app.method('saved-query/create', mutator(undoable(createSavedQuery)));
app.method('saved-query/update', mutator(undoable(updateSavedQuery)));
app.method('saved-query/delete', mutator(undoable(deleteSavedQuery)));
app.method('saved-query/move-folder', mutator(undoable(moveFolder)));
