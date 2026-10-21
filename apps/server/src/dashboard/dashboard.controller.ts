import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import {
  assignVetRequestSchema,
  handoverRequestSchema,
  inviteUserRequestSchema,
  ledgerRecordRequestSchema,
  scheduleRoundRequestSchema,
  setPasswordRequestSchema,
  settingsUpdateSchema,
  updateUserRequestSchema,
  uuid,
  type Actor,
  type AssignVetRequest,
  type FarmersPage,
  type HandoverRequest,
  type HealthPage,
  type InviteUserRequest,
  type LedgerRecordRequest,
  type MoneyPage,
  type OverviewPage,
  type ReminderResponse,
  type ScheduleRoundRequest,
  type SetPasswordRequest,
  type SettingsPage,
  type SettingsUpdate,
  type UpdateUserRequest,
} from '@wechiau/shared';
import type { Response } from 'express';
import { CurrentActor } from '../auth/auth.decorators.js';
import { ZodPipe } from '../common/zod.pipe.js';
import { DashboardService } from './dashboard.service.js';

export function adminOnly(actor: Actor): Actor {
  if (actor.role !== 'admin') throw new ForbiddenException('The dashboard is for the admin.');
  return actor;
}

const idPipe = new ZodPipe(uuid);

/** /api/dashboard/...: what the dashboard pages read, and the changes they make. Admins only. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  overview(@CurrentActor() actor: Actor, @Query('month') month?: string): Promise<OverviewPage> {
    adminOnly(actor);
    return this.dashboard.overview(month);
  }

  @Get('farmers')
  farmers(@CurrentActor() actor: Actor): Promise<FarmersPage> {
    adminOnly(actor);
    return this.dashboard.farmersPage();
  }

  @Post('farmers/:id/vet')
  @HttpCode(204)
  assignVet(
    @CurrentActor() actor: Actor,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(assignVetRequestSchema)) body: AssignVetRequest,
  ): Promise<void> {
    return this.dashboard.assignVet(adminOnly(actor), id, body.vet_id);
  }

  @Get('health')
  health(@CurrentActor() actor: Actor): Promise<HealthPage> {
    adminOnly(actor);
    return this.dashboard.healthPage();
  }

  @Post('rounds')
  @HttpCode(204)
  scheduleRound(@CurrentActor() actor: Actor, @Body(new ZodPipe(scheduleRoundRequestSchema)) body: ScheduleRoundRequest): Promise<void> {
    return this.dashboard.scheduleRound(adminOnly(actor), body);
  }

  @Get('money')
  money(@CurrentActor() actor: Actor, @Query('from') from?: string, @Query('to') to?: string): Promise<MoneyPage> {
    adminOnly(actor);
    return this.dashboard.moneyPage(from, to);
  }

  /** The ledger as a spreadsheet file (v0.3 Phase 4 step 3). */
  @Get('money.csv')
  async moneyCsv(
    @CurrentActor() actor: Actor,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<void> {
    adminOnly(actor);
    const csv = await this.dashboard.moneyCsv(from, to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="wechiau-ledger-${from ?? 'month'}-to-${to ?? 'today'}.csv"`);
    res.send(csv);
  }

  @Post('sales/:id/reminder')
  reminder(@CurrentActor() actor: Actor, @Param('id', idPipe) id: string): Promise<ReminderResponse> {
    return this.dashboard.saleReminder(adminOnly(actor), id);
  }

  @Post('ledger')
  recordLedger(@CurrentActor() actor: Actor, @Body(new ZodPipe(ledgerRecordRequestSchema)) body: LedgerRecordRequest): Promise<{ id: string }> {
    return this.dashboard.recordLedger(adminOnly(actor), body);
  }

  @Post('handovers')
  recordHandover(@CurrentActor() actor: Actor, @Body(new ZodPipe(handoverRequestSchema)) body: HandoverRequest): Promise<{ id: string }> {
    return this.dashboard.recordHandover(adminOnly(actor), body);
  }

  @Get('settings')
  settings(@CurrentActor() actor: Actor): Promise<SettingsPage> {
    adminOnly(actor);
    return this.dashboard.settingsPage();
  }

  @Put('settings')
  @HttpCode(204)
  updateSettings(@CurrentActor() actor: Actor, @Body(new ZodPipe(settingsUpdateSchema)) body: SettingsUpdate): Promise<void> {
    return this.dashboard.updateSettings(adminOnly(actor), body);
  }

  @Post('users')
  invite(@CurrentActor() actor: Actor, @Body(new ZodPipe(inviteUserRequestSchema)) body: InviteUserRequest): Promise<{ id: string }> {
    return this.dashboard.inviteUser(adminOnly(actor), body);
  }

  @Put('users/:id')
  @HttpCode(204)
  updateUser(
    @CurrentActor() actor: Actor,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateUserRequestSchema)) body: UpdateUserRequest,
  ): Promise<void> {
    return this.dashboard.updateUser(adminOnly(actor), id, body);
  }

  @Post('users/:id/password')
  @HttpCode(204)
  setPassword(
    @CurrentActor() actor: Actor,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(setPasswordRequestSchema)) body: SetPasswordRequest,
  ): Promise<void> {
    return this.dashboard.setPassword(adminOnly(actor), id, body.password);
  }
}
