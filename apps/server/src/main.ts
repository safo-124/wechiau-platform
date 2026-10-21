import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { AppConfig } from './config.js';

// Local development reads apps/server/.env. On the VPS, systemd sets the variables.
if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule));
  const config = app.get(AppConfig);
  await app.listen(config.port, config.host);
  console.log(`Wechiau server listening on http://${config.host}:${config.port}/api`);
}
await bootstrap();
