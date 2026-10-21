import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { Actor, TableName, TableRow } from '@wechiau/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import { fromDbRow } from '../sync/row-codec.js';
import type { SyncService } from '../sync/sync.service.js';
import { tableDelegate, type DbRow } from '../sync/tables.js';

/** Every row of a table that hasn't been deleted, in the shared JSON shape. */
export async function loadTable<T extends TableName>(prisma: PrismaService, table: T): Promise<TableRow<T>[]> {
  const rows = await tableDelegate(prisma, table).findMany({ where: { deleted_at: null } });
  return rows.map((row) => fromDbRow(table, row) as unknown as TableRow<T>);
}

/** A new row made on the dashboard, by the signed-in admin. */
export function newDashboardRow(actor: Actor, fields: Record<string, unknown>): DbRow & { id: string; updated_at: string } {
  const now = new Date().toISOString();
  return { id: randomUUID(), created_at: now, updated_at: now, deleted_at: null, device_id: 'dashboard', recorded_by: actor.userId, ...fields };
}

export function editDashboardRow(row: DbRow, changes: Record<string, unknown>): DbRow & { id: string; updated_at: string } {
  return { ...row, ...changes, id: row['id'] as string, device_id: 'dashboard', updated_at: new Date().toISOString() };
}

/**
 * Saves dashboard changes through the same path as a phone's push: the same
 * permission checks, the same change log, so phones receive them at their next sync.
 */
export async function saveThroughSync(
  sync: SyncService,
  actor: Actor,
  changes: { table: TableName; row: DbRow & { id: string; updated_at: string } }[],
): Promise<void> {
  const response = await sync.push(actor, {
    deviceId: 'dashboard',
    changes: changes.map(({ table, row }) => ({
      table,
      id: row.id,
      op: row['deleted_at'] ? 'delete' : 'upsert',
      data: row,
      updatedAt: row.updated_at,
    })),
  });
  const rejected = response.rejected[0];
  if (rejected) throw new BadRequestException(rejected.reason);
}
