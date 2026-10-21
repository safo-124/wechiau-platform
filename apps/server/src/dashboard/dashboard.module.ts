import { Module } from '@nestjs/common';
import { SyncModule } from '../sync/sync.module.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardService } from './dashboard.service.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  imports: [SyncModule],
  controllers: [DashboardController, ReportsController, MessagesController],
  providers: [DashboardService, ReportsService, MessagesService],
})
export class DashboardModule {}
