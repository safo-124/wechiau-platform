import { execSync } from 'node:child_process';

/** Brings the test database up to the latest migration before any test runs. */
export default function setup(): void {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) throw new Error('TEST_DATABASE_URL is not set. Run npm run db:setup, or see apps/server/.env.example.');
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) throw new Error(`Refusing to run tests against "${name}": the database name must end in _test.`);
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });
}
