import { Controller, Get, Res } from '@nestjs/common';
import type { HealthResponse } from '@wechiau/shared';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators.js';
import { SERVER_VERSION } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /api/health. 200 when the database answers, 503 when it doesn't. */
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const database = await this.pingDatabase();
    if (database !== 'ok') res.status(503);
    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      service: 'wechiau-server',
      version: SERVER_VERSION,
      time: new Date().toISOString(),
      database,
    };
  }

  private async pingDatabase(): Promise<HealthResponse['database']> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'unreachable';
    }
  }
}
