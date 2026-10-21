import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';

export const SERVER_VERSION = '0.1.0';

export interface ServerSettings {
  port: number;
  /** 0.0.0.0 in development so phones on the same Wi-Fi can reach it; 127.0.0.1 on the VPS behind Caddy. */
  host: string;
  databaseUrl: string;
  /** Where uploaded files are kept. Back this folder up with the database. */
  uploadsDir: string;
  /** Send the dashboard cookie over HTTPS only. True on the VPS; false on a laptop without HTTPS. */
  cookieSecure: boolean;
}

export function readServerSettings(env: NodeJS.ProcessEnv = process.env): ServerSettings {
  const databaseUrl = env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Run `npm run db:setup` from the repo root, or copy apps/server/.env.example to .env.');
  }
  const port = Number(env['PORT'] ?? 3000);
  if (!Number.isInteger(port) || port <= 0) throw new Error(`PORT must be a number, got ${env['PORT']}`);
  return {
    port,
    host: env['HOST'] ?? '127.0.0.1',
    databaseUrl,
    uploadsDir: resolve(env['UPLOADS_DIR'] ?? 'uploads'),
    cookieSecure: env['COOKIE_SECURE'] === 'true',
  };
}

/** Server settings from environment variables, read once at startup. */
@Injectable()
export class AppConfig implements ServerSettings {
  readonly port: number;
  readonly host: string;
  readonly databaseUrl: string;
  readonly uploadsDir: string;
  readonly cookieSecure: boolean;

  constructor() {
    const settings = readServerSettings();
    this.port = settings.port;
    this.host = settings.host;
    this.databaseUrl = settings.databaseUrl;
    this.uploadsDir = settings.uploadsDir;
    this.cookieSecure = settings.cookieSecure;
  }
}
