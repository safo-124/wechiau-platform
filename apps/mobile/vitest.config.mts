import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests for plain logic only (sync engine, uploads, money rules, local schema). Screens are checked on a phone.
export default defineConfig({
  tsconfig: './tsconfig.test.json',
  resolve: {
    // The same "@/..." alias the app uses (tsconfig.json paths).
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
