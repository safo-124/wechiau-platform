/**
 * What saving a collection or a sale writes, and the sums screens show.
 * Rules: addendum section 5. Plain logic, tested in Node.
 */
import { formatGhs, lineTotal, sumPesewas, type Pesewas } from '../money.js';
import { shortDate } from './time.js';

/** A row being built or changed by these functions: any columns, plus its id. */
export type RecordRow = Record<string, unknown> & { id: string };
/** Makes a new row: adds the id and sync columns (newRow on the phone, a fixed factory in tests). */
export type RowFactory = (fields: Record<string, unknown>) => RecordRow;
/** Changes a saved row and stamps a new updated_at (editedRow on the phone). */
export type RowEditor = (row: RecordRow, changes: Record<string, unknown>) => RecordRow;

export interface CollectionRows {
  sms: RecordRow;
  collection: RecordRow;
  ledger: RecordRow;
}

export function collectionReceipt(crates: number, amount: Pesewas): string {
  return `Wechiau Poultry: we paid you ${formatGhs(amount)} for ${crates} crate${crates === 1 ? '' : 's'} of eggs today. Thank you.`;
}

/**
 * A collection takes cash out of the egg fund and sends the farmer a receipt.
 * Saved in this order (receipt, collection, ledger entry) so the server sees
 * the collection before the ledger entry that points at it.
 */
export function buildCollection(
  make: RowFactory,
  input: { farmerId: string; farmerPhone: string; crates: number; pricePerCrate: Pesewas; collectedAt: string },
): CollectionRows {
  const amount = lineTotal(input.crates, input.pricePerCrate);
  const sms = make({ to_phone: input.farmerPhone, body: collectionReceipt(input.crates, amount), status: 'queued', attempts: 0 });
  const collection = make({
    farmer_id: input.farmerId,
    collected_at: input.collectedAt,
    crates: input.crates,
    price_per_crate: input.pricePerCrate,
    amount_paid: amount,
    receipt_sms_id: sms.id,
  });
  const ledger = make({ fund: 'egg', amount: -amount, source_type: 'collection', source_id: collection.id, note: null });
  return { sms, collection, ledger };
}

export type CollectionChange = { crates: number } | { remove: true };

export interface CorrectionRows {
  collection: RecordRow;
  ledger: RecordRow;
  sms: RecordRow;
}

/**
 * Correcting a saved collection (addendum section 5, rule 5): the collection
 * changes, an adjustment entry puts the difference back into (or takes it out
 * of) the egg fund, and the farmer gets a corrected receipt.
 * Returns null when nothing would change.
 */
export function buildCollectionCorrection(
  make: RowFactory,
  edit: RowEditor,
  input: { collection: RecordRow; farmerPhone: string; change: CollectionChange; now: string },
): CorrectionRows | null {
  const { collection, change } = input;
  const oldCrates = collection['crates'] as number;
  const oldAmount = collection['amount_paid'] as number;
  const price = collection['price_per_crate'] as number;
  const day = shortDate(collection['collected_at'] as string);

  let edited: RecordRow;
  let delta: Pesewas;
  let note: string;
  let body: string;
  if ('remove' in change) {
    edited = edit(collection, { deleted_at: input.now });
    delta = oldAmount;
    note = `Collection removed: ${oldCrates} crates`;
    body = `Wechiau Poultry correction: please ignore our receipt for ${oldCrates} crates (${formatGhs(oldAmount)}) on ${day}. It was entered by mistake.`;
  } else {
    if (change.crates === oldCrates) return null;
    const newAmount = lineTotal(change.crates, price);
    edited = edit(collection, { crates: change.crates, amount_paid: newAmount });
    delta = oldAmount - newAmount;
    note = `Correction: ${oldCrates} to ${change.crates} crates`;
    body = `Wechiau Poultry correction: your eggs on ${day} were ${change.crates} crates, ${formatGhs(newAmount)} (not ${oldCrates} crates, ${formatGhs(oldAmount)}).`;
  }

  const ledger = make({ fund: 'egg', amount: delta, source_type: 'adjustment', source_id: collection.id, note });
  const sms = make({ to_phone: input.farmerPhone, body, status: 'queued', attempts: 0 });
  return { collection: edited, ledger, sms };
}

export interface SaleRows {
  sale: RecordRow;
  payment: RecordRow | null;
  ledger: RecordRow | null;
}

interface PaymentRowLike {
  id: string;
  sale_id: string | null;
  amount: number | null;
  recorded_by: string | null;
  deleted_at?: string | null;
}
interface LedgerRowLike {
  fund: string | null;
  amount: number | null;
  source_type: string | null;
  source_id: string | null;
  deleted_at?: string | null;
}

export type SaleRemoval = { ok: true; sale: RecordRow; ledger: RecordRow[] } | { ok: false; reason: string };

/**
 * Removing a sale entered by mistake (wrong buyer, wrong crates, or twice).
 * The sale is marked removed and its crates count as in store again. Payments
 * are never changed (append only): each payment's money comes back out of the
 * egg fund with an adjustment pointing at that payment, so the ledger keeps
 * the whole story and the cash total stays right. Only whoever recorded a
 * payment, or the admin, can undo it.
 */
export function buildSaleRemoval(
  make: RowFactory,
  edit: RowEditor,
  input: { sale: RecordRow; payments: readonly PaymentRowLike[]; ledger: readonly LedgerRowLike[]; userId: string; isAdmin: boolean; now: string },
): SaleRemoval {
  const payments = input.payments.filter((p) => p.sale_id === input.sale.id && !p.deleted_at);
  const others = payments.filter((p) => p.recorded_by !== input.userId);
  if (others.length && !input.isAdmin) {
    return { ok: false, reason: 'Someone else recorded a payment for this sale. Ask the admin to remove it.' };
  }
  const crates = input.sale['crates'] as number;
  const ledger: RecordRow[] = [];
  for (const payment of payments) {
    // What this payment still adds to the egg fund after any earlier corrections.
    const net = sumPesewas(
      input.ledger
        .filter((l) => !l.deleted_at && l.fund === 'egg' && l.source_id === payment.id && (l.source_type === 'sale_payment' || l.source_type === 'adjustment'))
        .map((l) => l.amount ?? 0),
    );
    if (net !== 0) ledger.push(make({ fund: 'egg', amount: -net, source_type: 'adjustment', source_id: payment.id, note: `Sale removed: ${crates} crates` }));
  }
  return { ok: true, sale: edit(input.sale, { deleted_at: input.now }), ledger };
}

/** Money received for a sale, now or later. */
export function buildSalePayment(make: RowFactory, input: { saleId: string; amount: Pesewas; receivedAt: string }) {
  const payment = make({ sale_id: input.saleId, amount: input.amount, received_at: input.receivedAt });
  const ledger = make({ fund: 'egg', amount: input.amount, source_type: 'sale_payment', source_id: payment.id, note: null });
  return { payment, ledger };
}

/** A Wa sale. Paid in full writes the payment and its ledger entry too; otherwise the amount is owed until paid. */
export function buildSale(
  make: RowFactory,
  input: { buyerId: string; crates: number; pricePerCrate: Pesewas; soldAt: string; paidInFull: boolean; dueOn: string | null },
): SaleRows {
  const sale = make({
    buyer_id: input.buyerId,
    sold_at: input.soldAt,
    crates: input.crates,
    price_per_crate: input.pricePerCrate,
    due_on: input.paidInFull ? null : input.dueOn,
  });
  if (!input.paidInFull) return { sale, payment: null, ledger: null };
  const { payment, ledger } = buildSalePayment(make, {
    saleId: sale.id,
    amount: lineTotal(input.crates, input.pricePerCrate),
    receivedAt: input.soldAt,
  });
  return { sale, payment, ledger };
}

interface Deletable {
  deleted_at?: string | null;
}
interface SaleLike extends Deletable {
  id: string;
  crates: number | null;
  price_per_crate: number | null;
}
interface PaymentLike extends Deletable {
  sale_id: string | null;
  amount: number | null;
}

export interface SaleBalance {
  total: Pesewas;
  received: Pesewas;
  owed: Pesewas;
}

/** What each sale was worth, what came in, and what is still owed. Never stored (addendum rule 1). */
export function saleBalances(sales: readonly SaleLike[], payments: readonly PaymentLike[]): Map<string, SaleBalance> {
  const received = new Map<string, Pesewas>();
  for (const payment of payments) {
    if (payment.deleted_at || !payment.sale_id) continue;
    received.set(payment.sale_id, (received.get(payment.sale_id) ?? 0) + (payment.amount ?? 0));
  }
  const balances = new Map<string, SaleBalance>();
  for (const sale of sales) {
    if (sale.deleted_at) continue;
    const total = lineTotal(sale.crates ?? 0, sale.price_per_crate ?? 0);
    const got = received.get(sale.id) ?? 0;
    balances.set(sale.id, { total, received: got, owed: Math.max(0, total - got) });
  }
  return balances;
}

type CrateRow = Deletable & { crates: number | null };

function crateTotal(rows: readonly CrateRow[]): number {
  return rows.reduce((total, row) => (row.deleted_at ? total : total + (row.crates ?? 0)), 0);
}

/** Crates bought from farmers and not yet sold. */
export function cratesInStore(collections: readonly CrateRow[], sales: readonly CrateRow[]): number {
  return crateTotal(collections) - crateTotal(sales);
}

/**
 * Gross margin on sold crates: what buyers pay minus what those crates cost,
 * at the average price paid to farmers (design: 22 crates × (52 − 40) = GHS 264).
 */
export function eggMargin(
  collections: readonly (CrateRow & { amount_paid: number | null })[],
  sales: readonly (CrateRow & { price_per_crate: number | null })[],
): { cratesSold: number; margin: Pesewas } {
  const bought = collections.filter((c) => !c.deleted_at);
  const sold = sales.filter((s) => !s.deleted_at);
  const cratesBought = crateTotal(bought);
  const cost = sumPesewas(bought.map((c) => c.amount_paid ?? 0));
  const cratesSold = crateTotal(sold);
  const revenue = sumPesewas(sold.map((s) => lineTotal(s.crates ?? 0, s.price_per_crate ?? 0)));
  const averageCost = cratesBought ? cost / cratesBought : 0;
  return { cratesSold, margin: Math.round(revenue - cratesSold * averageCost) };
}
