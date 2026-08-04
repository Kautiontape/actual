// @ts-strict-ignore
import * as db from '#server/db';

import {
  getAppliedMigrations,
  getMigrationList,
  getPending,
  migrate,
  withMigrationsDir,
} from './migrations';

beforeEach(global.emptyDatabase(true));

describe('Migrations', () => {
  test('gets the latest migrations', async () => {
    const applied = await getAppliedMigrations(db.getDatabase());
    const available = await getMigrationList(
      __dirname + '/../../mocks/migrations',
    );

    expect(applied.length).toBe(0);
    expect(available).toMatchSnapshot();
    expect(getPending(applied, available)).toMatchSnapshot();
  });

  test('applied migrations are returned in order', async () => {
    return withMigrationsDir(
      __dirname + '/../../mocks/migrations',
      async () => {
        await migrate(db.getDatabase());

        const migrations = await getAppliedMigrations(db.getDatabase());
        const last = 0;
        for (const migration of migrations) {
          if (migration <= last) {
            throw new Error('Found older migration out of order');
          }
        }
      },
    );
  });

  test('checks if there are unknown migrations', async () => {
    return withMigrationsDir(
      __dirname + '/../../mocks/migrations',
      async () => {
        // Insert a random migration id
        db.runQuery('INSERT INTO __migrations__ (id) VALUES (1000)');

        try {
          await migrate(db.getDatabase());
        } catch (e) {
          expect(e.message).toBe('out-of-sync-migrations');
          return;
        }
        expect('should never reach here').toBe(null);
      },
    );
  });

  test('applies a migration whose id sorts before an already-applied one', async () => {
    return withMigrationsDir(
      __dirname + '/../../mocks/migrations',
      async () => {
        // Mirrors an upstream migration arriving with an id that sorts before
        // a migration this database has already applied, which happens when a
        // fork carries its own migration and then merges upstream.
        db.runQuery('INSERT INTO __migrations__ (id) VALUES (1508727787513)');

        await migrate(db.getDatabase());

        expect(await getAppliedMigrations(db.getDatabase())).toEqual([
          1508717984291, 1508718036311, 1508727787513,
        ]);
      },
    );
  });

  test('app runs database migrations', async () => {
    return withMigrationsDir(
      __dirname + '/../../mocks/migrations',
      async () => {
        let desc = await db.first<{ sql: string }>(
          "SELECT * FROM sqlite_master WHERE name = 'poop'",
        );
        expect(desc).toBe(null);

        await migrate(db.getDatabase());

        desc = await db.first<{ sql: string }>(
          "SELECT * FROM sqlite_master WHERE name = 'poop'",
        );
        expect(desc).toBeDefined();
        expect(desc.sql.indexOf('is_income')).toBe(-1);
        expect(desc.sql.indexOf('is_expense')).not.toBe(-1);
      },
    );
  });
});
