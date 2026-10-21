import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

// End-to-end tests run against the real test database (wechiau_test),
// never the development one.
if (existsSync('.env')) process.loadEnvFile('.env');
const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    // The first Nest test module can take several seconds to load on a cold start.
    testTimeout: 20000,
    hookTimeout: 60000,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Uploaded test files go to a temporary folder, never the real uploads folder.
    env: { ...(testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {}), UPLOADS_DIR: join(tmpdir(), 'wechiau-e2e-uploads') },
    // The files share one database, so they run one at a time.
    fileParallelism: false,
  },
});
