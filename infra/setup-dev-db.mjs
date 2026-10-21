#!/usr/bin/env node
// One-time local database setup: `npm run db:setup` from the repo root.
//
// 1. Writes apps/server/.env with a new random password for the `wechiau`
//    database user (only if .env doesn't exist yet).
// 2. Runs infra/dev-db.sql as the postgres superuser. psql asks for the
//    postgres password in your terminal; it is never stored.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, 'apps', 'server', '.env');
const sqlPath = join(root, 'infra', 'dev-db.sql');

function findPsql() {
  if (process.env.PSQL_PATH) return process.env.PSQL_PATH;
  const onPath = spawnSync('psql', ['--version'], { stdio: 'ignore', shell: false });
  if (onPath.status === 0) return 'psql';
  if (process.platform === 'win32') {
    for (const version of [18, 17, 16, 15, 14]) {
      const candidate = `C:\\Program Files\\PostgreSQL\\${version}\\bin\\psql.exe`;
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function ensureEnvFile() {
  if (existsSync(envPath)) {
    const match = readFileSync(envPath, 'utf8').match(/^DATABASE_URL="?postgresql:\/\/wechiau:([^@]+)@/m);
    if (!match) {
      console.error(`${envPath} exists but its DATABASE_URL is not for the "wechiau" user. Fix or delete it, then run again.`);
      process.exit(1);
    }
    console.log('Using the password already in apps/server/.env');
    return decodeURIComponent(match[1]);
  }
  const password = randomBytes(18).toString('base64url');
  const example = readFileSync(join(root, 'apps', 'server', '.env.example'), 'utf8');
  writeFileSync(envPath, example.replaceAll('CHANGE_ME', password));
  console.log('Wrote apps/server/.env with a new password for the wechiau database user.');
  return password;
}

const psql = findPsql();
if (!psql) {
  console.error('Could not find psql. Set PSQL_PATH to your psql.exe, for example:');
  console.error('  set PSQL_PATH=C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe');
  process.exit(1);
}

// The superuser created by the PostgreSQL installer is "postgres". Set PG_SUPERUSER if yours differs.
const superuser = process.env.PG_SUPERUSER || 'postgres';
const password = ensureEnvFile();
console.log(`Connecting as the PostgreSQL superuser "${superuser}". Enter its password when psql asks.`);
console.log('Nothing appears on screen while you type the password; that is normal.\n');

const result = spawnSync(
  psql,
  ['-h', 'localhost', '-p', '5432', '-U', superuser, '-d', 'postgres', '-v', `app_password=${password}`, '-f', sqlPath],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error('\nDatabase setup did not finish. See the psql message above.');
  console.error(`If it says "password authentication failed", the password for "${superuser}" was not right.`);
  console.error('It is the password chosen when PostgreSQL was installed. You can run this again as many times as needed.');
  process.exit(result.status ?? 1);
}
console.log('\nNext: npm run db:migrate');
