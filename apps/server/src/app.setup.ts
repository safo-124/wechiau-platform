import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** Settings shared by the real server and the end-to-end tests. */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const express = app as NestExpressApplication;
  // A full push batch (500 rows) is bigger than Express's 100 kB default.
  express.useBodyParser('json', { limit: '5mb' });
  // Behind Caddy, take the caller's address from X-Forwarded-For (used to slow down password guessing).
  express.set('trust proxy', 'loopback');
  return app;
}
