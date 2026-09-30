#!/usr/bin/env node
// Upload the workflow JSON files to n8n (create, or update by name), activate them,
// and record their IDs in .env. The error-alert workflow goes first so the others
// can point settings.errorWorkflow at it.
//   node n8n/push.mjs [file-prefix ...]     e.g. node n8n/push.mjs W1 W2
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '.env');
let envText = readFileSync(envPath, 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const API = `${env.N8N_LOCAL_URL}/api/v1`;
const H = { 'X-N8N-API-KEY': env.N8N_API_KEY, 'Content-Type': 'application/json' };

// file prefix → .env key, activation
const FILES = [
  ['ERR-error-alert', 'N8N_WF_ERROR_ALERT', true], // n8n 2.x only runs an error workflow if it is ACTIVE
  ['W0-gitsync', 'N8N_WF_GITSYNC', true],
  ['W1-recheck', 'N8N_WF_RECHECK', true],
  ['W2-telegram-callback', 'N8N_WF_TELEGRAM_CB', true],
  ['W3-monthly', 'N8N_WF_MONTHLY', true],
  ['W4-budget', 'N8N_WF_BUDGET', true],
  ['E1-eurostat', 'N8N_WF_EUROSTAT', true],
];

async function api(method, path, body) {
  const res = await fetch(API + path, { method, headers: H, body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}
function setEnv(key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  envText = re.test(envText) ? envText.replace(re, `${key}=${value}`) : `${envText.trimEnd()}\n${key}=${value}\n`;
}

const only = process.argv.slice(2);
const present = new Set(readdirSync(here).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
let errorId = env.N8N_WF_ERROR_ALERT || null;

for (const [file, envKey, activate] of FILES) {
  if (!present.has(file)) continue;
  if (only.length && !only.some((p) => file.startsWith(p)) && file !== 'ERR-error-alert') continue;
  const wf = JSON.parse(readFileSync(join(here, `${file}.json`), 'utf8'));
  if (wf.settings?.errorWorkflow === '__ERROR_WORKFLOW_ID__') wf.settings.errorWorkflow = errorId;
  if (file === 'W0-gitsync' && errorId) wf.settings = { ...wf.settings, errorWorkflow: errorId };
  const payload = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings };

  const found = (await api('GET', `/workflows?name=${encodeURIComponent(wf.name)}&limit=5`)).data
    .filter((w) => w.name === wf.name);
  let id, saved;
  if (found.length) { id = found[0].id; saved = await api('PUT', `/workflows/${id}`, payload); }
  else { saved = await api('POST', '/workflows', payload); id = saved.id; }
  // Activating re-registers trigger webhooks (Telegram rate-limits setWebhook), so only
  // activate when needed, and retry briefly on "Too Many Requests".
  for (let attempt = 1; activate && !saved.active; attempt++) {
    try { saved = await api('POST', `/workflows/${id}/activate`); }
    catch (e) {
      if (attempt >= 5 || !/Too Many Requests/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  if (file === 'ERR-error-alert') errorId = id;
  setEnv(envKey, id);
  console.log(`${found.length ? 'updated' : 'created'} ${id}  ${wf.name}${activate ? '  (active)' : ''}`);
}
writeFileSync(envPath, envText);
