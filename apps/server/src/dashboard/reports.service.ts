import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { draftReportText, MONTH_PATTERN, monthlyFigures, type Actor, type MonthlyFigures, type ReportPage, type ReportView } from '@wechiau/shared';
import type { MonthlyReport } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { fromDbRow } from '../sync/row-codec.js';
import { SyncService } from '../sync/sync.service.js';
import { editDashboardRow, loadTable, saveThroughSync } from './records.js';

const ghs = (pesewas: number) => (pesewas / 100).toFixed(2);
/** A spreadsheet cell: text with a comma, quote or line break goes in quotes. */
const cell = (v: string | number) => (typeof v === 'string' && /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : String(v));

/**
 * The monthly report for funders (v0.3 phase 5; addendum 4.2, MonthlyReport).
 * The figures are always worked out from the records. Only the summary text is
 * stored: the server writes the draft (a server field, so nobody else can
 * change it), Gloria edits and approves the final text.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: SyncService,
  ) {}

  private checkMonth(month: string): string {
    if (!MONTH_PATTERN.test(month)) throw new BadRequestException('Month must look like 2026-10.');
    return month;
  }

  async figures(month: string): Promise<MonthlyFigures> {
    this.checkMonth(month);
    const [farmers, visits, birdCounts, collections, sales, salePayments, vaccinations, vaccinePayments, cases, ledger] = await Promise.all([
      loadTable(this.prisma, 'farmer'),
      loadTable(this.prisma, 'visit'),
      loadTable(this.prisma, 'bird_count'),
      loadTable(this.prisma, 'collection'),
      loadTable(this.prisma, 'sale'),
      loadTable(this.prisma, 'sale_payment'),
      loadTable(this.prisma, 'vaccination'),
      loadTable(this.prisma, 'vaccine_payment'),
      loadTable(this.prisma, 'health_case'),
      loadTable(this.prisma, 'ledger_entry'),
    ]);
    return monthlyFigures(month, { farmers, visits, birdCounts, collections, sales, salePayments, vaccinations, vaccinePayments, cases, ledger });
  }

  private async view(report: MonthlyReport | null): Promise<ReportView | null> {
    if (!report || report.deleted_at) return null;
    const approver = report.approved_by ? await this.prisma.user.findUnique({ where: { id: report.approved_by } }) : null;
    return {
      id: report.id,
      status: report.status,
      draftText: report.draft_text,
      finalText: report.final_text,
      approvedBy: approver?.name ?? null,
      approvedAt: report.approved_at?.toISOString() ?? null,
      updatedAt: report.updated_at.toISOString(),
    };
  }

  private async find(month: string): Promise<MonthlyReport | null> {
    return this.prisma.monthlyReport.findUnique({ where: { month: this.checkMonth(month) } });
  }

  async page(month: string): Promise<ReportPage> {
    const [figures, report] = await Promise.all([this.figures(month), this.find(month)]);
    return { figures, report: await this.view(report) };
  }

  /**
   * Writes (or rewrites) the draft from the latest figures. Gloria's own text
   * is kept. The server writes this row itself, like the seed: dashboards and
   * phones can't create reports or change the draft (permissions map).
   */
  async writeDraft(month: string): Promise<ReportView> {
    const text = draftReportText(await this.figures(month));
    const now = new Date();
    const report = await this.prisma.$transaction(async (tx) => {
      // Same lock as a sync push, so the change gets its place in change_log in order.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${7_301_001})`;
      const saved = await tx.monthlyReport.upsert({
        where: { month },
        create: {
          id: randomUUID(), month, draft_text: text, final_text: null, status: 'draft', approved_by: null, approved_at: null,
          created_at: now, updated_at: now, deleted_at: null, device_id: 'server', recorded_by: null,
        },
        update: { draft_text: text, updated_at: now, device_id: 'server' },
      });
      await tx.changeLog.create({ data: { table_name: 'monthly_report', row_id: saved.id, op: 'upsert', device_id: 'server' } });
      return saved;
    });
    return (await this.view(report))!;
  }

  private async edit(actor: Actor, month: string, changes: Record<string, unknown>): Promise<void> {
    const existing = await this.find(month);
    if (!existing || existing.deleted_at) throw new NotFoundException('Write the draft for this month first.');
    await saveThroughSync(this.sync, actor, [{ table: 'monthly_report', row: editDashboardRow(fromDbRow('monthly_report', existing), changes) }]);
  }

  /** Saving new text makes it a draft again: changed text needs approving again. */
  async saveText(actor: Actor, month: string, finalText: string): Promise<void> {
    await this.edit(actor, month, { final_text: finalText, status: 'draft', approved_by: null, approved_at: null });
  }

  async approve(actor: Actor, month: string, finalText: string): Promise<void> {
    await this.edit(actor, month, { final_text: finalText, status: 'approved', approved_by: actor.userId, approved_at: new Date().toISOString() });
  }

  async markSent(actor: Actor, month: string): Promise<void> {
    const existing = await this.find(month);
    if (existing?.status !== 'approved') throw new BadRequestException('Approve the summary before marking it as sent.');
    await this.edit(actor, month, { status: 'sent' });
  }

  /** The month as a spreadsheet: the indicators, a line per farmer, and the summary. */
  async csv(month: string): Promise<string> {
    const { figures: f, report } = await this.page(month);
    const rows: (string | number)[][] = [
      ['Wechiau Poultry monthly report', f.label],
      [],
      ['Indicator', 'Value'],
      ['Farmers enrolled', f.farmers.enrolled],
      ['New farmers this month', f.farmers.newThisMonth],
      ['Crates bought from farmers', f.eggs.cratesBought],
      ['Paid to farmers (GHS)', ghs(f.eggs.paidToFarmers)],
      ['Crates sold in Wa', f.eggs.cratesSold],
      ['Sales value (GHS)', ghs(f.eggs.salesValue)],
      ['Gross margin (GHS)', ghs(f.eggs.margin)],
      ['Payments received from buyers (GHS)', ghs(f.eggs.paymentsReceived)],
      ['Vaccine doses given', f.vaccination.doses],
      ['Farms vaccinated', f.vaccination.farms],
      ['Vaccine payments received (GHS)', ghs(f.vaccination.paymentsReceived)],
      ['Bird deaths', f.birds.deaths],
      ['Birds counted', f.birds.counted],
      ['Bird losses (%)', f.birds.lossPercent ?? ''],
      ['Health problems reported', f.cases.opened],
      ['Urgent health problems', f.cases.urgent],
      ['Health cases closed', f.cases.closed],
      ['Egg fund at the start (GHS)', ghs(f.eggFund.opening)],
      ['Money in (GHS)', ghs(f.eggFund.moneyIn)],
      ['Money out (GHS)', ghs(f.eggFund.moneyOut)],
      ['Corrections (GHS)', ghs(f.eggFund.corrections)],
      ['Egg fund at the end (GHS)', ghs(f.eggFund.closing)],
      ['Grants this month (GHS)', ghs(f.eggFund.grants)],
      [],
      ['Farmer', 'Crates sold to the venture', 'Paid (GHS)', 'Bird deaths', 'Vaccine doses', 'Birds (latest count)'],
      ...f.perFarmer.map((p) => [p.name, p.crates, ghs(p.paid), p.deaths, p.doses, p.birds ?? '']),
    ];
    if (report) {
      rows.push([], ['Summary', report.finalText ?? report.draftText], ['Status', report.status]);
    }
    // The byte-order mark makes Excel read the file as UTF-8 (for "·", "−" and names with accents).
    return `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`;
  }
}
