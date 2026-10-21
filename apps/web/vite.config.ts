import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the dashboard calls /api on the same address, and Vite passes
// those requests to the NestJS server. On the VPS, Caddy does the same job.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
