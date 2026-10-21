import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { FarmersModule } from './farmers/farmers.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SyncModule } from './sync/sync.module.js';
import { UploadsModule } from './uploads/uploads.module.js';

@Module({
  imports: [PrismaModule, AuthModule, SyncModule, UploadsModule, DashboardModule, FarmersModule],
  controllers: [HealthController],
})
export class AppModule {}
