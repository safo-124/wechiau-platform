import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  caseUrgency,
  cashWithPerson,
  countDifference,
  cratesInStore,
  currentVets,
  dosesLeft,
  eggFundBalance,
  eggMargin,
  farmsInRound,
  formatGhs,
  isColdChainSafe,
  latestCount,
  normalizeGhanaPhone,
  readSettings,
  saleBalances,
  settingsSchema,
  sortCases,
  type Actor,
  type AttentionItem,
  type FarmersPage,
  type HandoverRequest,
  type HealthPage,
  type InviteUserRequest,
  type LedgerRecordRequest,
  type MoneyPage,
  type OverviewPage,
  type ReminderResponse,
  type ScheduleRoundRequest,
  type SettingKey,
  type SettingsPage,
  type SettingsUpdate,
  type TableRow,
  type UpdateUserRequest,
  type VetView,
} from '@wechiau/shared';
import { hashPassword } from '../auth/password.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fromDbRow } from '../sync/row-codec.js';
import { SyncService } from '../sync/sync.service.js';
import { editDashboardRow, loadTable, newDashboardRow, saveThroughSync } from './records.js';

/** Founding farmers grow to 60 in the first year (v0.3). */
const FARMER_TARGET = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function monthRange(month?: string): { month: string; start: Date; end: Date } {
  const now = new Date();
  const [y, m] = month && /^\d{4}-\d{2}$/.test(month) ? month.split('-').map(Number) : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const start = new Date(Date.UTC(y!, m! - 1, 1));
  const end = new Date(Date.UTC(y!, m!, 1));
  return { month: `${y}-${String(m).padStart(2, '0')}`, start, end };
}

const within = (iso: string | null | undefined, start: Date, end: Date) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
  ) {}

  /** Everything the pages need, loaded once per request. Pilot-sized data fits in memory. */
  private async load() {
    const [users, farmers, assignments, visits, counts, collections, buyers, sales, payments, ledger, handovers, cashCounts, rounds, vaccinations, stock, readings, cases, notes, settingRows] =
      await Promise.all([
        loadTable(this.prisma, 'user'),
        loadTable(this.prisma, 'farmer'),
        loadTable(this.prisma, 'vet_assignment'),
        loadTable(this.prisma, 'visit'),
        loadTable(this.prisma, 'bird_count'),
        loadTable(this.prisma, 'collection'),
        loadTable(this.prisma, 'buyer'),
        loadTable(this.prisma, 'sale'),
        loadTable(this.prisma, 'sale_payment'),
        loadTable(this.prisma, 'ledger_entry'),
        loadTable(this.prisma, 'cash_handover'),
        loadTable(this.prisma, 'cash_count'),
        loadTable(this.prisma, 'vaccination_round'),
        loadTable(this.prisma, 'vaccination'),
        loadTable(this.prisma, 'vaccine_stock_entry'),
        loadTable(this.prisma, 'cold_chain_reading'),
        loadTable(this.prisma, 'health_case'),
        loadTable(this.prisma, 'case_note'),
        loadTable(this.prisma, 'setting'),
      ]);
    const settings = readSettings(settingRows).values;
    const vets = currentVets(assignments);
    const nameOf = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? null;
    const farmerName = (id: string | null | undefined) => farmers.find((f) => f.id === id)?.name ?? 'A farmer';
    const summaries = new Map<string, string>();
    for (const n of [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      if (n.kind === 'note' && !summaries.has(n.health_case_id)) summaries.set(n.health_case_id, n.body);
    }
    const activeFarmers = farmers.filter((f) => f.status !== 'inactive');
    const today = isoDay(new Date());
    const latestRound = [...rounds].sort((a, b) => a.number - b.number).reverse().find((r) => r.date <= today) ?? null;
    return {
      users, farmers, activeFarmers, assignments, visits, counts, collections, buyers, sales, payments, ledger, handovers, cashCounts,
      rounds, vaccinations, stock, readings, cases, settings, vets, nameOf, farmerName, summaries, latestRound, settingRows,
    };
  }

  private async lastSeen(): Promise<Map<string, string>> {
    const sessions = await this.prisma.session.groupBy({ by: ['user_id'], _max: { last_used_at: true } });
    return new Map(sessions.filter((s) => s._max.last_used_at).map((s) => [s.user_id, s._max.last_used_at!.toISOString()]));
  }

  private vetViews(d: Awaited<ReturnType<DashboardService['load']>>, seen: Map<string, string>): VetView[] {
    return d.users
      .filter((u) => u.role === 'vet' && u.status === 'active')
      .map((u) => ({
        id: u.id,
        name: u.name,
        farmers: [...d.vets.values()].filter((v) => v === u.id).length,
        openCases: d.cases.filter((c) => c.status === 'open' && c.assigned_vet_id === u.id).length,
        lastSeen: seen.get(u.id) ?? null,
      }));
  }

  // ── Overview ─────────────────────────────────────────────────────────

  async overview(month?: string): Promise<OverviewPage> {
    const d = await this.load();
    const range = monthRange(month);
    const monthCollections = d.collections.filter((c) => within(c.collected_at, range.start, range.end));
    const monthSales = d.sales.filter((s) => within(s.sold_at, range.start, range.end));
    const margin = eggMargin(monthCollections, monthSales);
    const balances = saleBalances(d.sales, d.payments);
    const owedSales = d.sales.filter((s) => (balances.get(s.id)?.owed ?? 0) > 0);
    const stock = dosesLeft(d.stock);
    const farms = d.latestRound ? farmsInRound(d.activeFarmers, d.vaccinations, d.vets, d.latestRound.id) : [];
    const open = d.cases.filter((c) => c.status === 'open');
    const urgent = sortCases(open).filter((c) => caseUrgency(c) === 'urgent');

    // Crates collected per week of the month (1 to 7, 8 to 14, ...).
    const weeks: { label: string; crates: number }[] = [];
    for (let w = 0; w * 7 < (range.end.getTime() - range.start.getTime()) / DAY_MS; w++) {
      const start = new Date(range.start.getTime() + w * 7 * DAY_MS);
      const end = new Date(Math.min(start.getTime() + 7 * DAY_MS, range.end.getTime()));
      weeks.push({ label: `Week ${w + 1}`, crates: monthCollections.filter((c) => within(c.collected_at, start, end)).reduce((n, c) => n + c.crates, 0) });
    }

    const attention: AttentionItem[] = [];
    for (const c of urgent) {
      const vet = d.nameOf(c.assigned_vet_id);
      attention.push({
        tone: 'problem',
        text: `Urgent: ${d.farmerName(c.farmer_id)}: ${d.summaries.get(c.id) ?? 'problem reported'}. ${vet ? `${vet} is handling it.` : 'No vet has it yet.'}`,
        page: 'health',
      });
    }
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    for (const r of d.readings.filter((r) => within(r.read_at, weekAgo, new Date(Date.now() + DAY_MS)) && !isColdChainSafe(r.temp_c, d.settings))) {
      attention.push({ tone: 'problem', text: `Cold box ${r.temp_c}°C (${d.nameOf(r.recorded_by) ?? 'a vet'}), ${shortDay(r.read_at)}. Vaccine should not be used.`, page: 'health' });
    }
    if (d.stock.length === 0) {
      attention.push({ tone: 'comingUp', text: 'No vaccine recorded yet. Vets add each batch in the vet app, under Stock.', page: 'health' });
    } else if (stock.total < d.settings.stock_alert_doses) {
      attention.push({ tone: 'problem', text: `Only ${stock.total} vaccine doses left. Order more.`, page: 'health' });
    }
    for (const person of d.users.filter((u) => u.role === 'admin' || u.role === 'field_agent')) {
      const count = latestCount(d.cashCounts, person.id);
      if (count && countDifference(count) !== 0) {
        const diff = countDifference(count);
        attention.push({ tone: 'problem', text: `${person.name}'s cash was ${formatGhs(Math.abs(diff))} ${diff < 0 ? 'short' : 'over'} on ${shortDay(count.counted_at)}.`, page: 'money' });
      }
    }
    const fundCash = eggFundBalance(d.ledger);
    if (fundCash < 0) {
      attention.push({
        tone: 'problem',
        text: `The egg fund is ${formatGhs(-fundCash)} below zero. Record the grant it started with, or a correction.`,
        page: 'money',
      });
    }
    for (const s of owedSales) {
      const buyer = d.buyers.find((b) => b.id === s.buyer_id);
      attention.push({ tone: 'comingUp', text: `${buyer?.name ?? 'A buyer'} owes ${formatGhs(balances.get(s.id)!.owed)}${s.due_on ? `, due ${shortDay(s.due_on)}` : ''}`, page: 'money' });
    }
    const noVet = d.activeFarmers.filter((f) => !d.vets.has(f.id));
    attention.push(
      d.activeFarmers.length === 0
        ? { tone: 'neutral', text: 'No farmers enrolled yet. Field agents register them in the field app.', page: 'farmers' }
        : noVet.length
          ? { tone: 'problem', text: `${noVet.length} farmer${noVet.length === 1 ? ' has' : 's have'} no vet: ${noVet.map((f) => f.name).join(', ')}`, page: 'farmers' }
          : { tone: 'good', text: 'Every farmer has a vet', page: 'farmers' },
    );
    for (const f of farms.filter((f) => !f.done).slice(0, 5)) {
      attention.push({ tone: 'comingUp', text: `${d.farmerName(f.farmerId)}: vaccine round ${d.latestRound!.number} not done`, page: 'health' });
    }
    for (const f of d.activeFarmers.filter((f) => !f.digital_address).slice(0, 5)) {
      attention.push({ tone: 'comingUp', text: `${f.name} has no digital address saved`, page: 'farmers' });
    }

    const last = await this.prisma.changeLog.findFirst({ orderBy: { seq: 'desc' } });
    return {
      month: range.month,
      lastChangeAt: last?.changed_at.toISOString() ?? null,
      farmers: { enrolled: d.activeFarmers.length, target: FARMER_TARGET },
      crates: {
        bought: monthCollections.reduce((n, c) => n + c.crates, 0),
        sold: monthSales.reduce((n, s) => n + s.crates, 0),
        inStore: cratesInStore(d.collections, d.sales),
      },
      margin: { pesewas: margin.margin, perCrate: margin.cratesSold ? Math.round(margin.margin / margin.cratesSold) : null, cratesSold: margin.cratesSold },
      fund: {
        cash: fundCash,
        owedByBuyers: owedSales.reduce((n, s) => n + balances.get(s.id)!.owed, 0),
        nextDue: owedSales.map((s) => s.due_on).filter((x): x is string => Boolean(x)).sort()[0] ?? null,
      },
      doses: {
        left: stock.total,
        received: d.stock.filter((e) => e.reason === 'received').reduce((n, e) => n + e.doses, 0),
        round: d.latestRound ? { number: d.latestRound.number, done: farms.filter((f) => f.done).length, total: farms.length } : null,
      },
      cases: { open: open.length, urgent: urgent.length },
      weeklyCrates: weeks,
      attention,
    };
  }

  // ── Farmers ──────────────────────────────────────────────────────────

  async farmersPage(): Promise<FarmersPage> {
    const d = await this.load();
    const seen = await this.lastSeen();
    const range = monthRange();
    const today = isoDay(new Date());
    return {
      farmers: [...d.activeFarmers]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((f) => {
          const latest = (kind: string) =>
            d.counts.filter((c) => c.farmer_id === f.id && c.kind === kind).sort((a, b) => b.counted_at.localeCompare(a.counted_at))[0]?.count ?? null;
          const month = d.collections.filter((c) => c.farmer_id === f.id && within(c.collected_at, range.start, range.end));
          const open = d.cases.filter((c) => c.farmer_id === f.id && c.status === 'open');
          const vaccinated = d.latestRound ? d.vaccinations.some((v) => v.farmer_id === f.id && v.round_id === d.latestRound!.id) : true;
          const vetId = d.vets.get(f.id) ?? null;
          const tag = !vetId
            ? { label: 'No vet', tone: 'problem' as const }
            : open.some((c) => caseUrgency(c) === 'urgent')
              ? { label: 'Urgent case', tone: 'problem' as const }
              : open.some((c) => c.follow_up_on && c.follow_up_on <= today)
                ? { label: 'Follow-up', tone: 'comingUp' as const }
                : open.length
                  ? { label: 'Open case', tone: 'comingUp' as const }
                  : !vaccinated
                    ? { label: 'Vaccine due', tone: 'comingUp' as const }
                    : { label: 'Healthy', tone: 'good' as const };
          return {
            id: f.id,
            name: f.name,
            language: f.language,
            phone: f.phone,
            verified: latest('verified'),
            reported: latest('reported'),
            vetId,
            digitalAddress: f.digital_address,
            landmark: f.landmark,
            monthCrates: month.reduce((n, c) => n + c.crates, 0),
            monthPaid: month.reduce((n, c) => n + c.amount_paid, 0),
            tag,
          };
        }),
      vets: this.vetViews(d, seen),
    };
  }

  async assignVet(actor: Actor, farmerId: string, vetId: string): Promise<void> {
    const [farmer, vet] = await Promise.all([
      this.prisma.farmer.findUnique({ where: { id: farmerId } }),
      this.prisma.user.findUnique({ where: { id: vetId } }),
    ]);
    if (!farmer || farmer.deleted_at) throw new NotFoundException('Farmer not found.');
    if (!vet || vet.role !== 'vet' || vet.status !== 'active') throw new BadRequestException('Choose an active vet.');
    await saveThroughSync(this.sync, actor, [
      { table: 'vet_assignment', row: newDashboardRow(actor, { farmer_id: farmerId, vet_id: vetId, assigned_at: new Date().toISOString() }) },
    ]);
  }

  // ── Health ───────────────────────────────────────────────────────────

  async healthPage(): Promise<HealthPage> {
    const d = await this.load();
    const [seen, batches] = await Promise.all([this.lastSeen(), loadTable(this.prisma, 'vaccine_batch')]);
    const rounds = [...d.rounds].sort((a, b) => a.number - b.number);
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    const stock = dosesLeft(d.stock);
    return {
      cases: sortCases(d.cases).map((c) => ({
        id: c.id,
        farmerName: d.farmerName(c.farmer_id),
        summary: d.summaries.get(c.id) ?? 'Problem reported',
        channel: c.channel,
        vetName: d.nameOf(c.assigned_vet_id),
        triage: c.triage,
        triageSuggested: c.triage_suggested,
        status: c.status,
        createdAt: c.created_at,
        followUpOn: c.follow_up_on,
      })),
      vets: this.vetViews(d, seen),
      rounds: rounds.map((r, i) => {
          const farms = farmsInRound(d.activeFarmers, d.vaccinations, d.vets, r.id);
          // Deaths found on visits from this round until the next one starts.
          const until = rounds[i + 1]?.date ?? null;
          const deaths = d.visits
            .filter((v) => r.date && v.visited_at.slice(0, 10) >= r.date && (!until || v.visited_at.slice(0, 10) < until))
            .reduce((n, v) => n + v.deaths, 0);
          return {
            id: r.id,
            number: r.number,
            date: r.date,
            isFree: r.is_free,
            pricePerDose: r.price_per_dose,
            done: farms.filter((f) => f.done).length,
            total: farms.length,
            doses: farms.reduce((n, f) => n + (f.done?.birds ?? 0), 0),
            deaths,
          };
        }),
      readings: d.readings
        .filter((r) => within(r.read_at, weekAgo, new Date(Date.now() + DAY_MS)))
        .sort((a, b) => b.read_at.localeCompare(a.read_at))
        .map((r) => ({
          id: r.id,
          tempC: r.temp_c,
          safe: isColdChainSafe(r.temp_c, d.settings),
          where: r.place === 'farm' ? `${d.farmerName(r.farmer_id)}'s farm` : r.place === 'pickup' ? 'Pickup' : 'Storage',
          vetName: d.nameOf(r.recorded_by),
          readAt: r.read_at,
        })),
      stock: {
        left: stock.total,
        received: d.stock.filter((e) => e.reason === 'received').reduce((n, e) => n + e.doses, 0),
        alertBelow: d.settings.stock_alert_doses,
      },
      stockHistory: [...d.stock]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 50)
        .map((e) => {
          const batch = batches.find((b) => b.id === e.batch_id);
          const vaccination = e.source_type === 'vaccination' ? d.vaccinations.find((v) => v.id === e.source_id) : undefined;
          return {
            id: e.id,
            at: e.created_at,
            batchNo: batch?.batch_no ?? 'Unknown batch',
            vaccineName: batch?.vaccine_name ?? '',
            reason: e.reason,
            doses: e.doses,
            by: d.nameOf(e.recorded_by),
            farmerName: vaccination ? d.farmerName(vaccination.farmer_id) : null,
          };
        }),
    };
  }

  async scheduleRound(actor: Actor, request: ScheduleRoundRequest): Promise<void> {
    const existing = await this.prisma.vaccinationRound.findFirst({ where: { number: request.number, deleted_at: null } });
    if (existing) throw new ConflictException(`Round ${request.number} is already scheduled.`);
    await saveThroughSync(this.sync, actor, [
      { table: 'vaccination_round', row: newDashboardRow(actor, { ...request, price_per_dose: request.is_free ? 0 : null }) },
    ]);
  }

  // ── Money ────────────────────────────────────────────────────────────

  async moneyPage(fromDay?: string, toDay?: string): Promise<MoneyPage> {
    const d = await this.load();
    const range = monthRange();
    const from = fromDay && /^\d{4}-\d{2}-\d{2}$/.test(fromDay) ? new Date(`${fromDay}T00:00:00.000Z`) : range.start;
    const to = toDay && /^\d{4}-\d{2}-\d{2}$/.test(toDay) ? new Date(new Date(`${toDay}T00:00:00.000Z`).getTime() + DAY_MS) : new Date(Date.now() + DAY_MS);
    const balances = saleBalances(d.sales, d.payments);
    const farmerOfCollection = new Map(
      (await this.prisma.collection.findMany({ select: { id: true, farmer_id: true } })).map((c) => [c.id, c.farmer_id]),
    );

    const describe = (e: TableRow<'ledger_entry'>): string => {
      if (e.source_type === 'collection') {
        const c = d.collections.find((x) => x.id === e.source_id);
        return c ? `Collection · ${d.farmerName(c.farmer_id)} · ${c.crates} crates` : 'Collection';
      }
      if (e.source_type === 'sale_payment') {
        const p = d.payments.find((x) => x.id === e.source_id);
        const s = d.sales.find((x) => x.id === p?.sale_id);
        const b = d.buyers.find((x) => x.id === s?.buyer_id);
        return `Payment · ${b?.name ?? 'buyer'}${s ? ` · ${s.crates} crates` : ''}`;
      }
      if (e.source_type === 'vaccine_payment') return 'Vaccine payment';
      return e.note ?? (e.source_type === 'grant' ? 'Grant' : e.source_type === 'adjustment' ? 'Correction' : 'Vaccine bought');
    };

    let balance = 0;
    const ledger = [...d.ledger]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => {
        if (e.fund === 'egg') balance += e.amount;
        // Collections, and corrections to them (removed collections too), belong to a farmer.
        const farmerId = (e.source_type === 'collection' || e.source_type === 'adjustment') && e.source_id ? (farmerOfCollection.get(e.source_id) ?? null) : null;
        return {
          id: e.id,
          at: e.created_at,
          fund: e.fund,
          source: e.source_type,
          entry: describe(e),
          amount: e.amount,
          balance: e.fund === 'egg' ? balance : null,
          by: d.nameOf(e.recorded_by),
          farmerId,
          farmerName: farmerId ? d.farmerName(farmerId) : null,
        };
      })
      .filter((row) => within(row.at, from, to));

    const periodCollections = d.collections.filter((c) => within(c.collected_at, from, to));
    const periodSales = d.sales.filter((s) => within(s.sold_at, from, to));
    const margin = eggMargin(periodCollections, periodSales);
    const inStore = cratesInStore(d.collections, d.sales);

    return {
      from: isoDay(from),
      to: isoDay(new Date(to.getTime() - DAY_MS)),
      summary: {
        cash: eggFundBalance(d.ledger),
        started: d.ledger.filter((e) => e.fund === 'egg' && e.source_type === 'grant').reduce((n, e) => n + e.amount, 0),
        owed: [...balances.values()].reduce((n, b) => n + b.owed, 0),
        inStore,
        inStoreWorth: Math.max(inStore, 0) * d.settings.sell_price_per_crate,
        margin: margin.margin,
        cratesSold: margin.cratesSold,
      },
      ledger,
      buyers: d.buyers.map((b) => {
        const theirs = d.sales.filter((s) => s.buyer_id === b.id);
        const owing = theirs.filter((s) => (balances.get(s.id)?.owed ?? 0) > 0).sort((x, y) => x.sold_at.localeCompare(y.sold_at));
        return {
          id: b.id,
          name: b.name,
          type: b.type,
          phone: b.phone,
          crates: theirs.filter((s) => within(s.sold_at, from, to)).reduce((n, s) => n + s.crates, 0),
          owed: owing.reduce((n, s) => n + balances.get(s.id)!.owed, 0),
          owedSaleId: owing[0]?.id ?? null,
          dueOn: owing[0]?.due_on ?? null,
        };
      }),
      people: d.users
        .filter((u) => (u.role === 'admin' || u.role === 'field_agent') && u.status !== 'disabled')
        .map((u) => {
          const count = latestCount(d.cashCounts, u.id);
          return {
            id: u.id,
            name: u.name,
            role: u.role,
            cash: cashWithPerson(u.id, d.ledger, d.handovers),
            lastCount: count ? { at: count.counted_at, expected: count.expected, counted: count.counted } : null,
          };
        }),
    };
  }

  async moneyCsv(fromDay?: string, toDay?: string): Promise<string> {
    const page = await this.moneyPage(fromDay, toDay);
    const quote = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const lines = [['Date', 'Fund', 'Entry', 'Amount (GHS)', 'Egg fund balance (GHS)', 'Recorded by'].join(',')];
    for (const row of page.ledger) {
      lines.push(
        [row.at.slice(0, 10), row.fund, quote(row.entry), (row.amount / 100).toFixed(2), row.balance === null ? '' : (row.balance / 100).toFixed(2), quote(row.by ?? '')].join(','),
      );
    }
    // The byte-order mark makes Excel read the file as UTF-8 (for "·" in entries and names with accents).
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  /** Queues an SMS reminder to a buyer who owes money. */
  async saleReminder(actor: Actor, saleId: string): Promise<ReminderResponse> {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId }, include: { buyer: true, payments: true } });
    if (!sale || sale.deleted_at) throw new NotFoundException('Sale not found.');
    const owed = sale.crates * sale.price_per_crate - sale.payments.filter((p) => !p.deleted_at).reduce((n, p) => n + p.amount, 0);
    if (owed <= 0) throw new BadRequestException('This sale is paid in full.');
    if (!sale.buyer.phone) throw new BadRequestException(`${sale.buyer.name} has no phone number saved.`);
    const when = sale.due_on ? `due on ${shortDay(sale.due_on.toISOString())}` : 'now due';
    const body = `Wechiau Poultry: a reminder that ${formatGhs(owed)} for ${sale.crates} crates of eggs is ${when}. Thank you.`;
    await saveThroughSync(this.sync, actor, [
      { table: 'sms_outbox', row: newDashboardRow(actor, { to_phone: sale.buyer.phone, body, status: 'queued', attempts: 0 }) },
    ]);
    return { to: sale.buyer.phone, body };
  }

  /** A grant or a correction, recorded by the admin. It counts as cash the admin holds until handed over. */
  async recordLedger(actor: Actor, request: LedgerRecordRequest): Promise<{ id: string }> {
    const row = newDashboardRow(actor, { fund: request.fund, amount: request.amount, source_type: request.kind, source_id: null, note: request.note || null });
    await saveThroughSync(this.sync, actor, [{ table: 'ledger_entry', row }]);
    return { id: row.id };
  }

  /** Cash given to a field agent to pay farmers, or handed back. Both people must have active accounts. */
  async recordHandover(actor: Actor, request: HandoverRequest): Promise<{ id: string }> {
    const people = await this.prisma.user.findMany({
      where: { id: { in: [request.from_user_id, request.to_user_id] }, deleted_at: null, status: 'active', role: { in: ['admin', 'field_agent'] } },
    });
    if (people.length !== 2) throw new BadRequestException('Cash moves between the admin and field agents with active accounts.');
    const row = newDashboardRow(actor, { ...request, handed_at: new Date().toISOString() });
    await saveThroughSync(this.sync, actor, [{ table: 'cash_handover', row }]);
    return { id: row.id };
  }

  // ── Settings and people ──────────────────────────────────────────────

  async settingsPage(): Promise<SettingsPage> {
    const [settingRows, users, seen, farmers] = await Promise.all([
      loadTable(this.prisma, 'setting'),
      this.prisma.user.findMany({ where: { deleted_at: null }, orderBy: [{ role: 'asc' }, { name: 'asc' }] }),
      this.lastSeen(),
      this.prisma.farmer.findMany({ where: { deleted_at: null, status: 'active' }, orderBy: { name: 'asc' } }),
    ]);
    const withLogin = new Set(users.filter((u) => u.role === 'farmer').map((u) => u.farmer_id));
    return {
      farmersWithoutLogin: farmers.filter((f) => !withLogin.has(f.id)).map((f) => ({ id: f.id, name: f.name, phone: f.phone })),
      values: readSettings(settingRows).values,
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        role: u.role,
        status: u.status,
        hasPassword: u.password_hash !== null,
        lastSeen: seen.get(u.id) ?? null,
        farmerId: u.farmer_id,
      })),
    };
  }

  async updateSettings(actor: Actor, update: SettingsUpdate): Promise<void> {
    const rows = await loadTable(this.prisma, 'setting');
    const current = readSettings(rows).values;
    const merged = { ...current, ...update };
    const check = settingsSchema.safeParse(merged);
    if (!check.success) throw new BadRequestException(check.error.issues[0]?.message ?? 'These settings are not valid.');
    const changes = (Object.keys(update) as SettingKey[])
      .filter((key) => JSON.stringify(update[key]) !== JSON.stringify(current[key]) || !rows.some((r) => r.key === key))
      .map((key) => {
        const row = rows.find((r) => r.key === key);
        return { table: 'setting' as const, row: row ? editDashboardRow(row, { value: update[key] ?? null }) : newDashboardRow(actor, { key, value: update[key] ?? null }) };
      });
    if (changes.length) await saveThroughSync(this.sync, actor, changes);
  }

  async inviteUser(actor: Actor, request: InviteUserRequest): Promise<{ id: string }> {
    const phone = normalizeGhanaPhone(request.phone);
    if (!phone) throw new BadRequestException('Enter a Ghana phone number, like 024 123 4567.');
    const email = request.email?.trim().toLowerCase() ?? null;
    if (await this.prisma.user.findUnique({ where: { phone } })) throw new ConflictException('Someone already has this phone number.');
    if (email && (await this.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } }))) {
      throw new ConflictException('Someone already has this email.');
    }
    const row = newDashboardRow(actor, { name: request.name, phone, email, role: request.role, farmer_id: null, status: 'invited' });
    await saveThroughSync(this.sync, actor, [{ table: 'user', row }]);
    return { id: row.id };
  }

  async updateUser(actor: Actor, id: string, request: UpdateUserRequest): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.deleted_at) throw new NotFoundException('Person not found.');
    // A farmer's name and phone come from their farmer profile; here they can only be turned off or on.
    if (existing.role === 'farmer' && (request.name !== undefined || request.phone !== undefined || request.email !== undefined || request.role !== undefined)) {
      throw new BadRequestException("Change a farmer's name or phone on their farmer profile, in the field app.");
    }
    if (id === actor.userId && (request.status === 'disabled' || (request.role && request.role !== 'admin'))) {
      throw new BadRequestException("You can't turn off or change your own admin account.");
    }
    const changes: Record<string, unknown> = {};
    if (request.name !== undefined) changes['name'] = request.name;
    if (request.phone !== undefined) changes['phone'] = request.phone;
    if (request.email !== undefined) changes['email'] = request.email?.toLowerCase() ?? null;
    if (request.role !== undefined) changes['role'] = request.role;
    if (request.status !== undefined) {
      if (request.status === 'active' && !existing.password_hash) throw new BadRequestException('Set a password first; that activates the account.');
      changes['status'] = request.status;
    }
    if (Object.keys(changes).length === 0) return;
    await saveThroughSync(this.sync, actor, [{ table: 'user', row: editDashboardRow(fromDbRow('user', existing), changes) }]);
    // A turned-off account is signed out everywhere at once.
    if (request.status === 'disabled') await this.prisma.session.updateMany({ where: { user_id: id, revoked_at: null }, data: { revoked_at: new Date() } });
  }

  /** Sets a staff member's password (Gloria gives it to them). Invited accounts become active; old sessions end. */
  async setPassword(actor: Actor, id: string, password: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing || existing.deleted_at) throw new NotFoundException('Person not found.');
    if (existing.role === 'farmer') throw new BadRequestException('Farmers sign in with a PIN. Give them a new PIN instead.');
    if (existing.status === 'disabled') throw new BadRequestException('Turn the account on before setting a password.');
    await this.prisma.user.update({ where: { id }, data: { password_hash: await hashPassword(password) } });
    if (existing.status === 'invited') {
      await saveThroughSync(this.sync, actor, [{ table: 'user', row: editDashboardRow(fromDbRow('user', existing), { status: 'active' }) }]);
    }
    if (id !== actor.userId) await this.prisma.session.updateMany({ where: { user_id: id, revoked_at: null }, data: { revoked_at: new Date() } });
  }
}
