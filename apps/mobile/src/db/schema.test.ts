import { TABLES, tableSchemas } from '@wechiau/shared';
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { syncedTables } from './schema';

describe('the phone database', () => {
  it('keeps every shared table', () => {
    expect(Object.keys(syncedTables).sort()).toEqual([...TABLES].sort());
  });

  it('has exactly the shared columns in each table, under the shared names', () => {
    for (const name of TABLES) {
      const table = syncedTables[name];
      expect(getTableName(table), name).toBe(name);
      const local = Object.values(getTableColumns(table)).map((column) => column.name).sort();
      const shared = Object.keys(tableSchemas[name].shape).sort();
      expect(local, name).toEqual(shared);
    }
  });
});
