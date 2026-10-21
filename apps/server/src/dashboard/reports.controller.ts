import { Body, Controller, Get, HttpCode, Param, Post, Put, Res } from '@nestjs/common';
import { reportTextRequestSchema, type Actor, type ReportPage, type ReportTextRequest, type ReportView } from '@wechiau/shared';
import type { Response } from 'express';
import { CurrentActor } from '../auth/auth.decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { adminOnly } from './dashboard.controller.js';
import { ReportsService } from './reports.service.js';

/** /api/dashboard/reports/:month (2026-10): the monthly report for funders. Admins only. */
@Controller('dashboard/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get(':month')
  page(@CurrentActor() actor: Actor, @Param('month') month: string): Promise<ReportPage> {
    adminOnly(actor);
    return this.reports.page(month);
  }

  @Get(':month/csv')
  async csv(@CurrentActor() actor: Actor, @Param('month') month: string, @Res() res: Response): Promise<void> {
    adminOnly(actor);
    const csv = await this.reports.csv(month);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wechiau-report-${month}.csv"`);
    res.send(csv);
  }

  /** Writes the draft from the latest figures, or rewrites it. Gloria's own text is kept. */
  @Post(':month/draft')
  draft(@CurrentActor() actor: Actor, @Param('month') month: string): Promise<ReportView> {
    adminOnly(actor);
    return this.reports.writeDraft(month);
  }

  @Put(':month')
  @HttpCode(204)
  save(@CurrentActor() actor: Actor, @Param('month') month: string, @Body(new ZodPipe(reportTextRequestSchema)) body: ReportTextRequest): Promise<void> {
    return this.reports.saveText(adminOnly(actor), month, body.final_text);
  }

  @Post(':month/approve')
  @HttpCode(204)
  approve(@CurrentActor() actor: Actor, @Param('month') month: string, @Body(new ZodPipe(reportTextRequestSchema)) body: ReportTextRequest): Promise<void> {
    return this.reports.approve(adminOnly(actor), month, body.final_text);
  }

  @Post(':month/sent')
  @HttpCode(204)
  sent(@CurrentActor() actor: Actor, @Param('month') month: string): Promise<void> {
    return this.reports.markSent(adminOnly(actor), month);
  }
}
