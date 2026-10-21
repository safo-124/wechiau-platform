import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Load apps/server/.env when it exists (local development). On the VPS the
// variables come from the systemd service instead.
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
