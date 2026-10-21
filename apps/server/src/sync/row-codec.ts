import { dateColumns, PERMISSIONS, tableSchemas, timestampColumns, type TableName } from '@wechiau/shared';
import { Prisma } from '../generated/prisma/client.js';
import type { DbRow } from './tables.js';

interface ColumnInfo {
  all: string[];
  timestamps: Set<string>;
  dates: Set<string>;
}

const columnCache = new Map<TableName, ColumnInfo>();

function columns(table: TableName): ColumnInfo {
  let info = columnCache.get(table);
  if (!info) {
    info = {
      all: Object.keys(tableSchemas[table].shape),
      timestamps: new Set(timestampColumns(table)),
      dates: new Set(dateColumns(table)),
    };
    columnCache.set(table, info);
  }
  return info;
}

/** JSON row (ISO strings) → values Prisma accepts (Date objects, JSON null). */
export function toDbRow(table: TableName, row: DbRow): DbRow {
  const { all, timestamps, dates } = columns(table);
  const out: DbRow = {};
  for (const column of all) {
    const value = row[column];
    if (value === undefined || value === null) out[column] = null;
    else if (timestamps.has(column)) out[column] = new Date(value as string);
    else if (dates.has(column)) out[column] = new Date(`${value as string}T00:00:00.000Z`);
    else out[column] = value;
  }
  if (table === 'setting' && out['value'] === null) out['value'] = Prisma.JsonNull;
  return out;
}

/**
 * Database row → JSON row in the shared shape. Only columns in the shared
 * schema are kept, so server-only columns (like password_hash) never leave.
 */
export function fromDbRow(table: TableName, row: DbRow): DbRow {
  const { all, timestamps, dates } = columns(table);
  const out: DbRow = {};
  for (const column of all) {
    const value = row[column];
    if (value instanceof Date) {
      out[column] = dates.has(column) ? value.toISOString().slice(0, 10) : value.toISOString();
    } else {
      out[column] = value === undefined ? null : value;
    }
    if (timestamps.has(column) && typeof out[column] === 'string') out[column] = new Date(out[column] as string).toISOString();
  }
  return out;
}

/** Writes every timestamp the same way (2026-10-20T08:00:00.000Z), whatever the phone sent. */
export function normalizeTimestamps(table: TableName, row: DbRow): DbRow {
  const out: DbRow = { ...row };
  for (const column of columns(table).timestamps) {
    if (typeof out[column] === 'string') out[column] = new Date(out[column] as string).toISOString();
  }
  return out;
}

/** Whether two JSON rows hold the same values, ignoring server-filled columns and timestamp formatting. */
export function sameRow(table: TableName, a: DbRow, b: DbRow): boolean {
  const { all, timestamps } = columns(table);
  const ignore = new Set(PERMISSIONS[table].serverFields ?? []);
  for (const column of all) {
    if (ignore.has(column)) continue;
    let x = a[column] ?? null;
    let y = b[column] ?? null;
    if (timestamps.has(column) && x !== null && y !== null) {
      x = new Date(x as string).getTime();
      y = new Date(y as string).getTime();
    }
    if (JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}
