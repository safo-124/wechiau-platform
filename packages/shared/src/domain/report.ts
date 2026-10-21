/**
 * The monthly report for funders (v0.3 sections 1 and 10, phase 5): the
 * indicators promised to funders (farmers enrolled, doses given, crates
 * sold, margin and bird losses) plus the egg fund, health cases and a line
 * per farmer. Worked out from the records, never stored, so the dashboard,
 * the CSV and the written summary always agree.
 *
 * Months are calendar months in UTC, which is Ghana's time zone.
 */
import { formatGhs, lineTotal, sumPesewas, type Pesewas } from '../money.js';
import { eggMargin } from './eggs.js';

interface Deletable {
  deleted_at?: string | null;
}
interface FarmerLike extends Deletable {
  id: string;
  name: string | null;
  status: string | null;
  created_at: string | null;
}
interface VisitLike extends Deletable {
  farmer_id: string | null;
  visited_at: string | null;
  deaths: number | null;
}
interface CountLike extends Deletable {
  farmer_id: string | null;
  kind: string | null;
  count: number | null;
  counted_at: string | null;
}
interface CollectionLike extends Deletable {
  farmer_id: string | null;
  collected_at: string | null;
  crates: number | null;
  amount_paid: number | null;
}
interface SaleLike extends Deletable {
  id: string;
  sold_at: string | null;
  crates: number | null;
  price_per_crate: number | null;
}
interface SalePaymentLike extends Deletable {
  sale_id: string | null;
  amount: number | null;
  received_at: string | null;
}
interface VaccinationLike extends Deletable {
  farmer_id: string | null;
  birds_vaccinated: number | null;
  vaccinated_at: string | null;
}
interface VaccinePaymentLike extends Deletable {
  amount: number | null;
  paid_at: string | null;
}
interface CaseLike extends Deletable {
  created_at: string | null;
  closed_at: string | null;
  triage: string | null;
  triage_suggested: string | null;
}
interface LedgerLike extends Deletable {
  fund: string | null;
  amount: number | null;
  source_type: string | null;
  created_at: string | null;
}

export interface ReportInput {
  farmers: readonly FarmerLike[];
  visits: readonly VisitLike[];
  birdCounts: readonly CountLike[];
  collections: readonly CollectionLike[];
  sales: readonly SaleLike[];
  salePayments: readonly SalePaymentLike[];
  vaccinations: readonly VaccinationLike[];
  vaccinePayments: readonly VaccinePaymentLike[];
  cases: readonly CaseLike[];
  ledger: readonly LedgerLike[];
}

export interface FarmerMonth {
  farmerId: string;
  name: string;
  crates: number;
  paid: Pesewas;
  deaths: number;
  doses: number;
  /** Latest count at the end of the month: verified if there is one, else what the farmer reported. */
  birds: number | null;
}

export interface MonthlyFigures {
  month: string;
  /** "October 2026" */
  label: string;
  farmers: { enrolled: number; newThisMonth: number };
  eggs: {
    cratesBought: number;
    paidToFarmers: Pesewas;
    cratesSold: number;
    salesValue: Pesewas;
    margin: Pesewas;
    paymentsReceived: Pesewas;
  };
  /** Corrections (adjustment entries) are kept apart, so money in and out are what really moved. */
  eggFund: { opening: Pesewas; moneyIn: Pesewas; moneyOut: Pesewas; corrections: Pesewas; closing: Pesewas; grants: Pesewas };
  vaccination: { doses: number; farms: number; paymentsReceived: Pesewas };
  birds: { deaths: number; counted: number; lossPercent: number | null };
  cases: { opened: number; urgent: number; closed: number };
  perFarmer: FarmerMonth[];
}

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month's start and end (exclusive), in UTC. */
export function monthBounds(month: string): { start: string; end: string } {
  if (!MONTH_PATTERN.test(month)) throw new Error(`Month must look like 2026-10, got "${month}"`);
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { start: new Date(Date.UTC(y, m - 1, 1)).toISOString(), end: new Date(Date.UTC(y, m, 1)).toISOString() };
}

export function monthLabel(month: string): string {
  return new Date(monthBounds(month).start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Compares as instants, so "…Z" and "…+00:00" strings for the same moment agree. */
const at = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

export function monthlyFigures(month: string, input: ReportInput): MonthlyFigures {
  const { start, end } = monthBounds(month);
  const s = at(start);
  const e = at(end);
  const live = <T extends Deletable>(rows: readonly T[]) => rows.filter((r) => !r.deleted_at);
  const inMonth = (iso: string | null | undefined) => at(iso) >= s && at(iso) < e;
  const beforeEnd = (iso: string | null | undefined) => at(iso) < e;

  // Enrolled: registered by the end of the month and not marked inactive.
  const farmers = live(input.farmers).filter((f) => f.status !== 'inactive' && beforeEnd(f.created_at));
  const collections = live(input.collections).filter((c) => inMonth(c.collected_at));
  const sales = live(input.sales).filter((x) => inMonth(x.sold_at));
  const liveSales = new Set(live(input.sales).map((x) => x.id));
  const visits = live(input.visits).filter((v) => inMonth(v.visited_at));
  const vaccinations = live(input.vaccinations).filter((v) => inMonth(v.vaccinated_at));
  const egg = live(input.ledger).filter((l) => l.fund === 'egg');
  const eggThisMonth = egg.filter((l) => inMonth(l.created_at));
  const moved = eggThisMonth.filter((l) => l.source_type !== 'adjustment');

  const latestBirds = (farmerId: string): number | null => {
    const counts = live(input.birdCounts).filter((c) => c.farmer_id === farmerId && beforeEnd(c.counted_at));
    const newest = (kind: string) =>
      counts.filter((c) => c.kind === kind).sort((a, b) => at(b.counted_at) - at(a.counted_at))[0]?.count ?? null;
    return newest('verified') ?? newest('reported');
  };

  const perFarmer: FarmerMonth[] = [...farmers]
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    .map((f) => {
      const theirs = collections.filter((c) => c.farmer_id === f.id);
      return {
        farmerId: f.id,
        name: f.name ?? 'A farmer',
        crates: theirs.reduce((n, c) => n + (c.crates ?? 0), 0),
        paid: sumPesewas(theirs.map((c) => c.amount_paid ?? 0)),
        deaths: visits.filter((v) => v.farmer_id === f.id).reduce((n, v) => n + (v.deaths ?? 0), 0),
        doses: vaccinations.filter((v) => v.farmer_id === f.id).reduce((n, v) => n + (v.birds_vaccinated ?? 0), 0),
        birds: latestBirds(f.id),
      };
    });

  const deaths = visits.reduce((n, v) => n + (v.deaths ?? 0), 0);
  const counted = perFarmer.reduce((n, f) => n + (f.birds ?? 0), 0);
  const opening = sumPesewas(egg.filter((l) => at(l.created_at) < s).map((l) => l.amount ?? 0));
  const moneyIn = sumPesewas(moved.filter((l) => (l.amount ?? 0) > 0).map((l) => l.amount ?? 0));
  const moneyOut = -sumPesewas(moved.filter((l) => (l.amount ?? 0) < 0).map((l) => l.amount ?? 0));
  const corrections = sumPesewas(eggThisMonth.filter((l) => l.source_type === 'adjustment').map((l) => l.amount ?? 0));
  const cases = live(input.cases);

  return {
    month,
    label: monthLabel(month),
    farmers: { enrolled: farmers.length, newThisMonth: farmers.filter((f) => inMonth(f.created_at)).length },
    eggs: {
      cratesBought: collections.reduce((n, c) => n + (c.crates ?? 0), 0),
      paidToFarmers: sumPesewas(collections.map((c) => c.amount_paid ?? 0)),
      cratesSold: sales.reduce((n, x) => n + (x.crates ?? 0), 0),
      salesValue: sumPesewas(sales.map((x) => lineTotal(x.crates ?? 0, x.price_per_crate ?? 0))),
      margin: eggMargin(collections, sales).margin,
      // Payments on a removed sale were cancelled in the ledger, so they don't count.
      paymentsReceived: sumPesewas(
        live(input.salePayments)
          .filter((p) => inMonth(p.received_at) && liveSales.has(p.sale_id ?? ''))
          .map((p) => p.amount ?? 0),
      ),
    },
    eggFund: {
      opening,
      moneyIn,
      moneyOut,
      corrections,
      closing: opening + moneyIn - moneyOut + corrections,
      grants: sumPesewas(eggThisMonth.filter((l) => l.source_type === 'grant').map((l) => l.amount ?? 0)),
    },
    vaccination: {
      doses: vaccinations.reduce((n, v) => n + (v.birds_vaccinated ?? 0), 0),
      farms: new Set(vaccinations.map((v) => v.farmer_id)).size,
      paymentsReceived: sumPesewas(live(input.vaccinePayments).filter((p) => inMonth(p.paid_at)).map((p) => p.amount ?? 0)),
    },
    birds: { deaths, counted, lossPercent: counted ? Math.round((deaths / counted) * 1000) / 10 : null },
    cases: {
      opened: cases.filter((c) => inMonth(c.created_at)).length,
      urgent: cases.filter((c) => inMonth(c.created_at) && (c.triage ?? c.triage_suggested) === 'urgent').length,
      closed: cases.filter((c) => inMonth(c.closed_at)).length,
    },
    perFarmer,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * The server's first draft of the funder summary, in plain sentences, for
 * Gloria to edit and approve. (An AI-written draft replaces this in R3.)
 */
export function draftReportText(f: MonthlyFigures): string {
  const lines: string[] = [];
  const { enrolled, newThisMonth } = f.farmers;
  lines.push(
    `In ${f.label}, ${plural(enrolled, 'farmer was', 'farmers were')} enrolled` +
      (!newThisMonth
        ? '.'
        : newThisMonth < enrolled
          ? `, ${newThisMonth} of them new this month.`
          : enrolled === 1
            ? ', who joined this month.'
            : ', all of them new this month.'),
  );
  if (f.eggs.cratesBought || f.eggs.cratesSold) {
    lines.push(
      `We bought ${plural(f.eggs.cratesBought, 'crate')} of eggs from farmers for ${formatGhs(f.eggs.paidToFarmers)} ` +
        `and sold ${plural(f.eggs.cratesSold, 'crate')} in Wa for ${formatGhs(f.eggs.salesValue)}, ` +
        `a gross margin of ${formatGhs(f.eggs.margin)}.`,
    );
  } else {
    lines.push('No eggs were bought or sold this month.');
  }
  lines.push(
    f.vaccination.doses
      ? `Vets gave ${plural(f.vaccination.doses, 'vaccine dose')} on ${plural(f.vaccination.farms, 'farm')}.`
      : 'No vaccinations were recorded this month.',
  );
  const counted = f.birds.counted.toLocaleString('en-US');
  lines.push(
    f.birds.lossPercent === null
      ? `${plural(f.birds.deaths, 'bird death')} recorded; no bird counts yet to compare with.`
      : f.birds.deaths === 0
        ? `No birds died among the ${counted} birds counted.`
        : `${plural(f.birds.deaths, 'bird')} died, ${f.birds.lossPercent}% of the ${counted} birds counted.`,
  );
  lines.push(
    f.cases.opened || f.cases.closed
      ? `Farmers reported ${plural(f.cases.opened, 'health problem')}${f.cases.urgent ? ` (${f.cases.urgent} urgent)` : ''}, and vets closed ${plural(f.cases.closed, 'case')}.`
      : 'No health problems were reported.',
  );
  lines.push(`The egg fund held ${formatGhs(f.eggFund.opening)} at the start of the month and ${formatGhs(f.eggFund.closing)} at the end.`);
  return lines.join('\n\n');
}
