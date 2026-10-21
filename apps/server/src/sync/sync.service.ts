import { Injectable, Logger } from '@nestjs/common';
import {
  canRead,
  canSeeTable,
  checkCreate,
  checkUpdate,
  isTableName,
  keepServerFields,
  PERMISSIONS,
  projectRow,
  tableSchemas,
  type Actor,
  type Decision,
  type PullChange,
  type PullResponse,
  type PushChange,
  type PushRequest,
  type PushResponse,
  type SyncOp,
  type TableName,
} from '@wechiau/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { checkLedgerSource } from './ledger-source.js';
import { fromDbRow, normalizeTimestamps, sameRow, toDbRow } from './row-codec.js';
import { tableDelegate, type DbRow } from './tables.js';

/** Every write to synced tables takes this lock, so change_log rows commit in seq order. */
const SYNC_WRITE_LOCK = 7_301_001;

/** A Prisma interactive-transaction client. */
type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

type Outcome = { kind: 'applied'; op: SyncOp } | { kind: 'unchanged' } | { kind: 'rejected'; reason: string };

const reject = (reason: string): Outcome => ({ kind: 'rejected', reason });

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Applies a phone's queued changes in order, in one transaction. Each change
   * is accepted or rejected on its own (with a savepoint), so one bad row never
   * blocks the rest of the outbox.
   */
  async push(actor: Actor, request: PushRequest): Promise<PushResponse> {
    const response: PushResponse = { accepted: [], rejected: [] };

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SYNC_WRITE_LOCK})`;
        for (const change of request.changes) {
          await tx.$executeRawUnsafe('SAVEPOINT sync_change');
          let outcome: Outcome;
          try {
            outcome = await this.applyChange(tx, actor, request.deviceId, change);
          } catch (error) {
            this.logger.error(`Push of ${change.table} ${change.id} failed`, error instanceof Error ? error.stack : error);
            outcome = reject(friendlyDbError(error));
          }
          if (outcome.kind === 'rejected') {
            await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sync_change');
            response.rejected.push({ id: change.id, table: change.table, reason: outcome.reason });
          } else {
            await tx.$executeRawUnsafe('RELEASE SAVEPOINT sync_change');
            response.accepted.push(change.id);
          }
        }
      },
      { maxWait: 15_000, timeout: 60_000 },
    );

    return response;
  }

  private async applyChange(tx: Tx, actor: Actor, deviceId: string, change: PushChange): Promise<Outcome> {
    if (!isTableName(change.table)) return reject(`Unknown kind of record: ${change.table}.`);
    const table = change.table;
    if (change.data['id'] !== change.id) return reject('The record id does not match the change.');

    const parsed = tableSchemas[table].safeParse(change.data);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return reject(`Not saved: ${issue?.message ?? 'invalid'}${issue?.path.length ? ` (${issue.path.join('.')})` : ''}.`);
    }
    let row = normalizeTimestamps(table, parsed.data as DbRow);
    if (change.op === 'delete' && row['deleted_at'] === null) return reject('A delete must set deleted_at.');

    const delegate = tableDelegate(tx, table);
    const existingDb = await delegate.findUnique({ where: { id: change.id } });
    const existing = existingDb ? fromDbRow(table, existingDb) : null;

    // The same change pushed again (a retry after a lost reply) is accepted without writing.
    if (existing && sameRow(table, existing, row)) return { kind: 'unchanged' };

    const decision: Decision = existing ? checkUpdate(actor, table, existing, row) : checkCreate(actor, table, row);
    if (!decision.ok) return reject(decision.reason);

    // Latest updated_at wins; an older change is dropped from the phone's outbox without writing.
    if (existing && Date.parse(row['updated_at'] as string) < Date.parse(existing['updated_at'] as string)) {
      return { kind: 'unchanged' };
    }

    if (PERMISSIONS[table].sourceRequired?.includes(actor.role)) {
      const source = await checkLedgerSource(tx, actor, row);
      if (!source.ok) return reject(source.reason);
    }

    row = keepServerFields(table, row, existing);
    if (!existing) row = await this.fillOnCreate(tx, table, row);

    const op: SyncOp = row['deleted_at'] ? 'delete' : 'upsert';
    const data = toDbRow(table, row);
    await delegate.upsert({ where: { id: change.id }, create: data, update: data });
    await tx.changeLog.create({ data: { table_name: table, row_id: change.id, op, device_id: deviceId } });
    if (table === 'vet_assignment') {
      // The farmer's phone needs its new vet's name and phone, which it may never have received.
      await tx.changeLog.create({ data: { table_name: 'user', row_id: row['vet_id'] as string, op: 'upsert', device_id: deviceId } });
    }
    return { kind: 'applied', op };
  }

  /** Server-filled values on new rows (addendum section 3 notes). */
  private async fillOnCreate(tx: Tx, table: TableName, row: DbRow): Promise<DbRow> {
    if (table === 'vaccination_round') {
      // Vets never see prices; copy today's price from Settings.
      if (row['is_free']) return { ...row, price_per_dose: 0 };
      const setting = await tx.setting.findUnique({ where: { key: 'price_per_dose' } });
      const price = typeof setting?.value === 'number' ? setting.value : null;
      return { ...row, price_per_dose: price };
    }
    if (table === 'health_case' && row['assigned_vet_id'] === null) {
      // A farmer's report goes to the farmer's current vet.
      const assignment = await tx.vetAssignment.findFirst({
        where: { farmer_id: row['farmer_id'] as string, deleted_at: null },
        orderBy: { assigned_at: 'desc' },
      });
      return { ...row, assigned_vet_id: assignment?.vet_id ?? null };
    }
    return row;
  }

  /**
   * Changes since `since`, scoped to what this person may see (v0.3 section 7).
   * The cursor advances past changes they can't see, so they are never re-read.
   */
  async pull(actor: Actor, since: number, limit: number): Promise<PullResponse> {
    const logs = await this.prisma.changeLog.findMany({
      where: { seq: { gt: BigInt(since) } },
      orderBy: { seq: 'asc' },
      take: limit + 1,
    });
    const hasMore = logs.length > limit;
    const page = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = page.length ? Number(page[page.length - 1]!.seq) : since;

    // A row changed several times in this page is sent once, at its latest position.
    const latest = new Map<string, { table: TableName; id: string; seq: number }>();
    for (const log of page) {
      if (!isTableName(log.table_name) || !canSeeTable(actor.role, log.table_name)) continue;
      latest.set(`${log.table_name}:${log.row_id}`, { table: log.table_name, id: log.row_id, seq: Number(log.seq) });
    }

    const idsByTable = new Map<TableName, string[]>();
    for (const { table, id } of latest.values()) idsByTable.set(table, [...(idsByTable.get(table) ?? []), id]);

    const rows = new Map<string, DbRow>();
    for (const [table, ids] of idsByTable) {
      for (const dbRow of await tableDelegate(this.prisma, table).findMany({ where: { id: { in: ids } } })) {
        rows.set(`${table}:${dbRow['id'] as string}`, fromDbRow(table, dbRow));
      }
    }

    // A farmer sees only the vet currently assigned to their farm.
    const myVet = actor.role === 'farmer' && actor.farmerId ? await this.currentVet(actor.farmerId) : null;

    const changes: PullChange[] = [];
    for (const [key, { table, id, seq }] of [...latest.entries()].sort((a, b) => a[1].seq - b[1].seq)) {
      const row = rows.get(key);
      if (!row || !this.visibleTo(actor, table, row, myVet)) continue;
      changes.push({ table, id, op: row['deleted_at'] ? 'delete' : 'upsert', data: projectRow(actor.role, table, row), seq });
    }

    return { changes, nextCursor, hasMore };
  }

  private visibleTo(actor: Actor, table: TableName, row: DbRow, myVet: string | null): boolean {
    if (!canRead(actor, table, row)) return false;
    // Farmers receive only their own login and their own vet (for "My vet" and calling them).
    if (table === 'user' && actor.role === 'farmer') return row['id'] === actor.userId || (myVet !== null && row['id'] === myVet);
    return true;
  }

  /** The vet a farm is assigned to now: its latest assignment (addendum section 4.2). */
  private async currentVet(farmerId: string): Promise<string | null> {
    const latest = await this.prisma.vetAssignment.findFirst({
      where: { farmer_id: farmerId, deleted_at: null },
      orderBy: { assigned_at: 'desc' },
    });
    return latest?.vet_id ?? null;
  }
}

function friendlyDbError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'P2003') return 'It refers to a record the server does not have.';
  if (code === 'P2002') return 'Another record already uses one of these values.';
  return 'The server could not save this change.';
}
