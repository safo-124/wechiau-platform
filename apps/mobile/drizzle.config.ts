import { defineConfig } from 'drizzle-kit';

// `npm run db:generate` in apps/mobile writes a new migration after a schema change.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  driver: 'expo',
});
