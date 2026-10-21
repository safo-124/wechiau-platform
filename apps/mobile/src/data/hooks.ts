/**
 * Live reads from the phone's database. Screens re-render when a save or a
 * sync changes the rows. Pilot-sized data (tens of farmers, thousands of
 * rows a year) is small enough to read whole tables and sum in JavaScript.
 */
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback, useMemo } from 'react';
import { useSignedIn } from '@/auth/session';
import { db } from '@/db/client';
import { newRow } from '@/db/records';
import {
  bird_count,
  buyer,
  case_note,
  cash_count,
  cash_handover,
  cold_chain_reading,
  collection,
  farmer,
  health_case,
  ledger_entry,
  message,
  sale,
  sale_payment,
  setting,
  sms_outbox,
  sync_outbox,
  user,
  vaccination,
  vaccination_round,
  vaccine_batch,
  vaccine_payment,
  vaccine_stock_entry,
  vet_assignment,
  visit,
} from '@/db/schema';
import { type PhoneSettings, readSettings, type RowFactory } from '@wechiau/shared';

export const useFarmers = () =>
  useLiveQuery(db.select().from(farmer).where(isNull(farmer.deleted_at)).orderBy(asc(farmer.name))).data;
export const useCollections = () =>
  useLiveQuery(db.select().from(collection).where(isNull(collection.deleted_at)).orderBy(desc(collection.collected_at))).data;
export const useSales = () =>
  useLiveQuery(db.select().from(sale).where(isNull(sale.deleted_at)).orderBy(desc(sale.sold_at))).data;
export const useSalePayments = () => useLiveQuery(db.select().from(sale_payment).where(isNull(sale_payment.deleted_at))).data;
export const useBuyers = () =>
  useLiveQuery(db.select().from(buyer).where(isNull(buyer.deleted_at)).orderBy(asc(buyer.name))).data;
export const useLedger = () => useLiveQuery(db.select().from(ledger_entry).where(isNull(ledger_entry.deleted_at))).data;
export const useHandovers = () =>
  useLiveQuery(db.select().from(cash_handover).where(isNull(cash_handover.deleted_at)).orderBy(desc(cash_handover.handed_at))).data;
export const useCashCounts = () =>
  useLiveQuery(db.select().from(cash_count).where(isNull(cash_count.deleted_at)).orderBy(desc(cash_count.counted_at))).data;
export const useUsers = () => useLiveQuery(db.select().from(user).where(isNull(user.deleted_at)).orderBy(asc(user.name))).data;

export const useRounds = () =>
  useLiveQuery(db.select().from(vaccination_round).where(isNull(vaccination_round.deleted_at)).orderBy(asc(vaccination_round.number))).data;
export const useBatches = () =>
  useLiveQuery(db.select().from(vaccine_batch).where(isNull(vaccine_batch.deleted_at)).orderBy(asc(vaccine_batch.expiry_on))).data;
export const useStockEntries = () => useLiveQuery(db.select().from(vaccine_stock_entry).where(isNull(vaccine_stock_entry.deleted_at))).data;
export const useReadings = () =>
  useLiveQuery(db.select().from(cold_chain_reading).where(isNull(cold_chain_reading.deleted_at)).orderBy(desc(cold_chain_reading.read_at))).data;
export const useVaccinations = () => useLiveQuery(db.select().from(vaccination).where(isNull(vaccination.deleted_at))).data;
export const useHealthCases = () =>
  useLiveQuery(db.select().from(health_case).where(isNull(health_case.deleted_at)).orderBy(desc(health_case.created_at))).data;
export const useVetAssignments = () => useLiveQuery(db.select().from(vet_assignment).where(isNull(vet_assignment.deleted_at))).data;
export const useCaseNotes = (caseId: string) =>
  useLiveQuery(
    db
      .select()
      .from(case_note)
      .where(and(eq(case_note.health_case_id, caseId), isNull(case_note.deleted_at)))
      .orderBy(asc(case_note.created_at)),
    [caseId],
  ).data;

/** All case notes, for case summaries in lists. */
export const useAllCaseNotes = () =>
  useLiveQuery(db.select().from(case_note).where(isNull(case_note.deleted_at)).orderBy(asc(case_note.created_at))).data;

/** The first thing written about each case (the problem), for lists. */
export function useCaseSummaries(): Map<string, string> {
  const notes = useAllCaseNotes();
  return useMemo(() => {
    const first = new Map<string, string>();
    for (const n of notes) if (n.health_case_id && n.kind === 'note' && n.body && !first.has(n.health_case_id)) first.set(n.health_case_id, n.body);
    return first;
  }, [notes]);
}

/** Active vets, for handing over cases and assigning farmers. */
export function useVets() {
  const users = useUsers();
  return useMemo(() => users.filter((u) => u.role === 'vet' && u.status === 'active'), [users]);
}

export function useSettings(): PhoneSettings {
  const { data } = useLiveQuery(db.select().from(setting));
  return useMemo(() => readSettings(data), [data]);
}

export const useFarmerCounts = (farmerId: string) =>
  useLiveQuery(
    db
      .select()
      .from(bird_count)
      .where(and(eq(bird_count.farmer_id, farmerId), isNull(bird_count.deleted_at)))
      .orderBy(desc(bird_count.counted_at)),
    [farmerId],
  ).data;

export const useFarmerCases = (farmerId: string) =>
  useLiveQuery(
    db
      .select()
      .from(health_case)
      .where(and(eq(health_case.farmer_id, farmerId), isNull(health_case.deleted_at)))
      .orderBy(desc(health_case.created_at)),
    [farmerId],
  ).data;

export const useFarmerVaccinations = (farmerId: string) =>
  useLiveQuery(
    db.select().from(vaccination).where(and(eq(vaccination.farmer_id, farmerId), isNull(vaccination.deleted_at))),
    [farmerId],
  ).data;

export const useFarmerVisits = (farmerId: string) =>
  useLiveQuery(
    db
      .select()
      .from(visit)
      .where(and(eq(visit.farmer_id, farmerId), isNull(visit.deleted_at)))
      .orderBy(desc(visit.visited_at)),
    [farmerId],
  ).data;

/** Messages between farmers and the vets, oldest first like a chat. */
export const useMessages = () =>
  useLiveQuery(db.select().from(message).where(isNull(message.deleted_at)).orderBy(asc(message.created_at))).data;
export const useFarmerMessages = (farmerId: string) =>
  useLiveQuery(
    db
      .select()
      .from(message)
      .where(and(eq(message.farmer_id, farmerId), isNull(message.deleted_at)))
      .orderBy(asc(message.created_at)),
    [farmerId],
  ).data;
export const useVaccinePayments = () => useLiveQuery(db.select().from(vaccine_payment).where(isNull(vaccine_payment.deleted_at))).data;

/** Rows of a table saved on this phone but not on the server yet ("waiting for network"). */
export function useWaitingIds(table: string): Set<string> {
  const { data } = useLiveQuery(db.select({ id: sync_outbox.row_id }).from(sync_outbox).where(eq(sync_outbox.table_name, table)), [table]);
  return useMemo(() => new Set(data.map((r) => r.id)), [data]);
}

export const useSmsRow = (id: string | null) =>
  useLiveQuery(db.select().from(sms_outbox).where(eq(sms_outbox.id, id ?? '')), [id]).data[0] ?? null;

/** Makes new rows as the signed-in person on this phone. */
export function useRowFactory(): RowFactory {
  const { user: me, deviceId } = useSignedIn();
  return useCallback(
    (fields) => newRow({ userId: me.id, deviceId }, fields) as ReturnType<RowFactory>,
    [me.id, deviceId],
  );
}
