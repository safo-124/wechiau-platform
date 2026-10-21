import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { LoginThrottle } from '../../src/auth/login-throttle.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

export interface TestApp {
  app: INestApplication<App>;
  prisma: PrismaService;
  auth: AuthService;
  http: () => ReturnType<typeof request>;
}

/** The real server, wired to the test database. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication()) as INestApplication<App>;
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    auth: app.get(AuthService),
    http: () => request(app.getHttpServer()),
  };
}

/** Forgets wrong-password counts, so one test's tries don't block the next test's sign-in. */
export function resetThrottle(t: TestApp): void {
  t.app.get(LoginThrottle).reset();
}

/** Empties every table except Prisma's migration history. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}
