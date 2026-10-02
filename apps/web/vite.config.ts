import { readFileSync, existsSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Dev only: GET /__fixture serves apps/web/.fixture.json (a gitignored copy of a real
// dashboard() payload) so the UI can be checked without signing in. Not part of builds.
const fixture = (): Plugin => ({
  name: 'osi-fixture',
  apply: 'serve',
  configureServer(server) {
    // The fixture viewer is the administrator, so User management shows. Its API is an
    // in-memory mock of the gateway's /api/admin/users (fake users; nothing leaves the machine).
    const now = new Date().toISOString();
    let users = [
      { user_id: '00000000-0000-4000-8000-000000000001', username: 'hentus', display_name: 'Hentus', email: 'hentus@example.com', cell: null,
        disabled: false, is_admin: true, created_here: false, created_at: now, auth_email: 'hentus@example.com', last_sign_in_at: now, password: null, password_set_at: null },
      { user_id: '00000000-0000-4000-8000-000000000002', username: 'demo', display_name: 'Demo user', email: null, cell: '+27 82 000 0000',
        disabled: false, is_admin: false, created_here: true, created_at: now, auth_email: 'demo@users.example', last_sign_in_at: null, password: 'fixture-pass-1', password_set_at: now },
    ];
    server.middlewares.use('/__fixture-admin/users', (req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const f = raw ? JSON.parse(raw) : {}, id = (req.url || '').replace(/^\//, '');
        const out = (status: number, j: unknown) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(j)); };
        if ('password' in f) f.password_set_at = new Date().toISOString();
        if ('email' in f) f.email = f.email || null;
        if (req.method === 'GET') return out(200, users);
        if (req.method === 'POST') {
          if (users.some((u) => u.username === f.username)) return out(409, { message: 'That username is taken.' });
          const u = { ...users[1], ...f, user_id: crypto.randomUUID(), created_here: true, is_admin: false, disabled: false,
            created_at: new Date().toISOString(), last_sign_in_at: null, auth_email: f.email || f.username + '@users.example' };
          users = [...users, u].sort((a, b) => a.username.localeCompare(b.username));
          return out(201, { user_id: u.user_id });
        }
        if (req.method === 'PATCH') { users = users.map((u) => (u.user_id === id ? { ...u, ...f } : u)); return out(200, { ok: true }); }
        if (req.method === 'DELETE') { users = users.filter((u) => u.user_id !== id); return out(200, { ok: true }); }
        out(405, {});
      });
    });
    server.middlewares.use('/__fixture', (_req, res) => {
      const f = new URL('./.fixture.json', import.meta.url);
      res.setHeader('Content-Type', 'application/json');
      if (!existsSync(f)) return void res.end('{}');
      const d = JSON.parse(readFileSync(f, 'utf8'));
      if (d.me) d.me.is_admin = true;
      res.end(JSON.stringify(d));
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
  // The world map (src/map/world.ts, ~300 kB gzipped) is its own lazily loaded chunk by design.
  build: { sourcemap: false, chunkSizeWarningLimit: 1200 },
});
