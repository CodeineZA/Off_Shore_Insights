import { readFileSync, existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Dev only: GET /__fixture serves apps/web/.fixture.json (a gitignored copy of a real
// dashboard() payload) so the UI can be checked without signing in. Not part of builds.
const fixture = (): Plugin => ({
  name: 'osi-fixture',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__fixture', (_req, res) => {
      const f = new URL('./.fixture.json', import.meta.url);
      res.setHeader('Content-Type', 'application/json');
      res.end(existsSync(f) ? readFileSync(f) : '{}');
    });
  },
});

// In dev, /api (the login gateway) is proxied to the live site so login works locally.
export default defineConfig({
  plugins: [react(), fixture()],
  server: {
    port: 5190,
    proxy: { '/api': { target: 'https://insights.codeine.cloud', changeOrigin: true } },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 600 },
});
