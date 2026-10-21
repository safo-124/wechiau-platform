/**
 * Cash a person should be holding (addendum section 4.2, CashHandover):
 * the egg-fund ledger entries they recorded, plus cash handed to them, minus
 * cash they handed on. Never stored; always summed from rows.
 */
import { sumPesewas, type Pesewas } from '../money.js';

interface LedgerLike {
  fund: string | null;
  amount: number | null;
  recorded_by: string | null;
  deleted_at?: string | null;
}
interface HandoverLike {
  from_user_id: string | null;
  to_user_id: string | null;
  amount: number | null;
  deleted_at?: string | null;
}

export function cashWithPerson(userId: string, ledger: readonly LedgerLike[], handovers: readonly HandoverLike[]): Pesewas {
  const fromLedger = ledger
    .filter((e) => !e.deleted_at && e.fund === 'egg' && e.recorded_by === userId)
    .map((e) => e.amount ?? 0);
  const handedIn = handovers.filter((h) => !h.deleted_at && h.to_user_id === userId).map((h) => h.amount ?? 0);
  const handedOut = handovers.filter((h) => !h.deleted_at && h.from_user_id === userId).map((h) => -(h.amount ?? 0));
  return sumPesewas([...fromLedger, ...handedIn, ...handedOut]);
}

interface CountLike {
  expected: number | null;
  counted: number | null;
  counted_at: string | null;
  recorded_by: string | null;
  deleted_at?: string | null;
}

/** The person's most recent cash count, if any. */
export function latestCount<T extends CountLike>(counts: readonly T[], userId: string): T | null {
  let latest: T | null = null;
  for (const count of counts) {
    if (count.deleted_at || count.recorded_by !== userId || !count.counted_at) continue;
    if (!latest || count.counted_at > (latest.counted_at ?? '')) latest = count;
  }
  return latest;
}

/** Counted minus expected: below 0 means cash is missing. */
export function countDifference(count: Pick<CountLike, 'expected' | 'counted'>): Pesewas {
  return (count.counted ?? 0) - (count.expected ?? 0);
}

/** The whole egg fund. Only meaningful for the admin: field agents' phones hold only their own entries. */
export function eggFundBalance(ledger: readonly LedgerLike[]): Pesewas {
  return sumPesewas(ledger.filter((e) => !e.deleted_at && e.fund === 'egg').map((e) => e.amount ?? 0));
}
