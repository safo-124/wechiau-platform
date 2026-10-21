import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../config.js';
import { PrismaClient } from '../generated/prisma/client.js';

/** The one database client for the whole server process. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: AppConfig) {
    super({
      adapter: new PrismaPg({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5000 }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
