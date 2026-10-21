import type { Actor, Decision } from '@wechiau/shared';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { DbRow } from './tables.js';

type Client = Pick<PrismaService, 'collection' | 'sale' | 'salePayment' | 'vaccinePayment' | 'ledgerEntry'>;

const deny = (reason: string): Decision => ({ ok: false, reason });
const allow: Decision = { ok: true };

/**
 * Field agents never write ledger rows on their own (addendum section 5, rule 4):
 * each entry must come with its own collection or payment, pushed earlier in
 * the same batch or already on the server, and the amount must match.
 *
 * A correction to their own collection (rule 5) is an `adjustment` pointing at
 * the collection. It must bring that collection's ledger total to exactly what
 * the collection now says: −amount paid, or 0 if it was removed.
 *
 * Removing a sale entered by mistake is an `adjustment` pointing at each of
 * its payments, cancelling the payment exactly, once the sale is removed.
 */
export async function checkLedgerSource(client: Client, actor: Actor, entry: DbRow): Promise<Decision> {
  const sourceId = entry['source_id'] as string | null;
  const amount = entry['amount'] as number;
  if (!sourceId) return deny('Field agents can only add ledger entries that come with a collection or payment.');

  switch (entry['source_type']) {
    case 'collection': {
      const source = await client.collection.findUnique({ where: { id: sourceId } });
      if (!source || source.recorded_by !== actor.userId) return deny('This ledger entry must come with your own egg collection.');
      if (entry['fund'] !== 'egg' || amount !== -source.amount_paid) return deny('The ledger amount must match the collection.');
      return allow;
    }
    case 'sale_payment': {
      const source = await client.salePayment.findUnique({ where: { id: sourceId } });
      if (!source || source.recorded_by !== actor.userId) return deny('This ledger entry must come with your own sale payment.');
      if (entry['fund'] !== 'egg' || amount !== source.amount) return deny('The ledger amount must match the payment.');
      return allow;
    }
    case 'vaccine_payment': {
      const source = await client.vaccinePayment.findUnique({ where: { id: sourceId } });
      if (!source || source.recorded_by !== actor.userId) return deny('This ledger entry must come with your own vaccine payment.');
      if (entry['fund'] !== 'vaccine' || amount !== source.amount) return deny('The ledger amount must match the payment.');
      return allow;
    }
    case 'adjustment': {
      const source = await client.collection.findUnique({ where: { id: sourceId } });
      if (!source) return checkPaymentUndo(client, actor, entry, sourceId);
      if (source.recorded_by !== actor.userId) return deny('Field agents can only correct their own egg collections.');
      if (entry['fund'] !== 'egg') return deny('A collection correction belongs to the egg fund.');
      const sofar = await client.ledgerEntry.aggregate({
        where: { source_id: sourceId, source_type: { in: ['collection', 'adjustment'] }, deleted_at: null },
        _sum: { amount: true },
      });
      const target = source.deleted_at ? 0 : -source.amount_paid;
      if ((sofar._sum.amount ?? 0) + amount !== target) return deny('The correction must match the change to the collection.');
      return allow;
    }
    default:
      // Grants and purchases are for the admin.
      return deny('Only the admin can add this kind of ledger entry.');
  }
}

/**
 * A removed sale's payment coming back out of the egg fund (buildSaleRemoval):
 * the agent's own payment, its sale already removed, and the adjustment
 * cancelling exactly what the payment still adds to the fund.
 */
async function checkPaymentUndo(client: Client, actor: Actor, entry: DbRow, paymentId: string): Promise<Decision> {
  const payment = await client.salePayment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.recorded_by !== actor.userId) return deny('Field agents can only correct their own collections and payments.');
  const sale = await client.sale.findUnique({ where: { id: payment.sale_id } });
  if (!sale?.deleted_at) return deny('A payment can only be undone when its sale is removed.');
  if (entry['fund'] !== 'egg') return deny('A sale payment belongs to the egg fund.');
  const sofar = await client.ledgerEntry.aggregate({
    where: { source_id: paymentId, source_type: { in: ['sale_payment', 'adjustment'] }, deleted_at: null },
    _sum: { amount: true },
  });
  if ((sofar._sum.amount ?? 0) + (entry['amount'] as number) !== 0) return deny('The correction must cancel the payment exactly.');
  return allow;
}
