import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@wechiau/shared';
import type { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

function fakeResponse() {
  const res = { statusCode: 200, status: vi.fn() };
  res.status.mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  return res;
}

async function controllerWith(queryRaw: () => Promise<unknown>) {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: { $queryRaw: vi.fn(queryRaw) } }],
  }).compile();
  return module.get(HealthController);
}

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const controller = await controllerWith(async () => [{ '?column?': 1 }]);
    const res = fakeResponse();
    const body = await controller.check(res as unknown as Response);

    expect(healthResponseSchema.parse(body)).toMatchObject({ status: 'ok', database: 'ok' });
    expect(res.statusCode).toBe(200);
  });

  it('reports degraded with 503 when the database is unreachable', async () => {
    const controller = await controllerWith(async () => {
      throw new Error('connect ECONNREFUSED 127.0.0.1:5432');
    });
    const res = fakeResponse();
    const body = await controller.check(res as unknown as Response);

    expect(body).toMatchObject({ status: 'degraded', database: 'unreachable' });
    expect(res.statusCode).toBe(503);
  });
});
