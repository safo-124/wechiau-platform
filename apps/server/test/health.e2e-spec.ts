import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@wechiau/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfig } from '../src/config.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('GET /api/health (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AppConfig)
      .useValue({ port: 0, host: '127.0.0.1', databaseUrl: 'postgresql://unused' })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: async () => [{ '?column?': 1 }], $disconnect: async () => {} })
      .compile();

    app = configureApp(moduleRef.createNestApplication()) as INestApplication<App>;
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('answers under the /api prefix with the shared health shape', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(healthResponseSchema.parse(response.body).database).toBe('ok');
  });
});
