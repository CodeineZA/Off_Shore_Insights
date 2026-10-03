#!/usr/bin/env node
// Generates the n8n workflow JSON files (W1–W4, E1, error alert) from code, so the
// workflows are reviewable and reproducible. Code-node logic lives in n8n/src/*.js.
//   node n8n/build.mjs && node n8n/push.mjs
// W0 (n8n/W0-gitsync.json) predates this builder and is edited directly.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(here, 'src', f), 'utf8');

const SB = 'http://192.168.0.50:8000/rest/v1';
const CRED_SB = { httpCustomAuth: { id: 'T99Hh92H20OWbJov', name: 'Offshore Insights - Supabase service_role' } };
const CRED_TG = { telegramApi: { id: '8TArObNpJNKLfwlM', name: 'Telegram account' } };
const CHAT = '6688393980';
const ERROR_WF = '__ERROR_WORKFLOW_ID__'; // substituted by push.mjs
const settings = (extra = {}) => ({ executionOrder: 'v1', timezone: 'Europe/Madrid', errorWorkflow: ERROR_WF, ...extra });

let seq = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) =>
  ({ id: `n${++seq}`, name, type, typeVersion, position, parameters, ...extra });

const schedule = (cron, pos = [0, 0]) => node('Schedule', 'n8n-nodes-base.scheduleTrigger', 1.2, pos,
  { rule: { interval: [{ field: 'cronExpression', expression: cron }] } });

const start = (pos = [200, 0]) => node('Start', 'n8n-nodes-base.set', 3.4, pos,
  { assignments: { assignments: [{ id: 'st', name: 'StartedAt', type: 'string', value: '={{ $now.toISO() }}' }] }, options: {} });

// Supabase REST call with the service_role credential (headers incl. schema profile).
function sb(name, method, path, pos, { body, prefer, extra = {} } = {}) {
  const url = `${SB}/${path}`;
  const p = { method, url: path.includes('{{') ? `=${url}` : url, authentication: 'genericCredentialType', genericAuthType: 'httpCustomAuth', options: {} };
  if (prefer) Object.assign(p, { sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: prefer }] } });
  if (body) Object.assign(p, { sendBody: true, specifyBody: 'json', jsonBody: body });
  return node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, p, { credentials: CRED_SB, ...extra });
}

const code = (name, file, pos, mode = 'runOnceForAllItems') =>
  node(name, 'n8n-nodes-base.code', 2, pos, { mode, jsCode: src(file) });

const telegram = (name, text, pos, extraParams = {}) => node(name, 'n8n-nodes-base.telegram', 1.2, pos,
  { chatId: CHAT, text, additionalFields: { appendAttribution: false, parse_mode: 'HTML' }, ...extraParams },
  { credentials: CRED_TG });

// One sync_run row per run (executeOnce, so it fires once however many items arrive).
const record = (workflow, rowsExpr, pos) => sb('Record sync_run', 'POST', 'sync_run', pos, {
  body: `={{ JSON.stringify({ workflow: '${workflow}', started_at: $('Start').first().json.StartedAt, finished_at: $now.toISO(), status: 'ok', rows: ${rowsExpr} }) }}`,
  extra: { executeOnce: true },
});

const ifTrue = (name, leftValue, pos) => node(name, 'n8n-nodes-base.if', 2.2, pos, {
  conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{ id: `c${seq}`, leftValue, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
    combinator: 'and' }, options: {} });

const note = (content, pos = [0, -240], width = 640) =>
  node('Note', 'n8n-nodes-base.stickyNote', 1, pos, { content, width, height: 200, color: 4 });

const link = (...names) => {
  const c = {};
  for (let i = 0; i < names.length - 1; i++) {
    const [from, out = 0] = [].concat(names[i]);
    const to = [].concat(names[i + 1])[0];
    c[from] ??= { main: [] };
    while (c[from].main.length <= out) c[from].main.push([]);
    c[from].main[out].push({ node: to, type: 'main', index: 0 });
  }
  return c;
};
const merge = (...cs) => {
  const out = {};
  for (const c of cs) for (const [k, v] of Object.entries(c)) {
    out[k] ??= { main: [] };
    v.main.forEach((arr, i) => { while (out[k].main.length <= i) out[k].main.push([]); out[k].main[i].push(...arr); });
  }
  return out;
};

const workflows = {};

// ── Error alert: any failing node in the other workflows lands here ──────────
seq = 0;
workflows['ERR-error-alert'] = {
  name: 'Off_Shore_Insights - Error alert',
  settings: { executionOrder: 'v1', timezone: 'Europe/Madrid' },
  nodes: [
    node('Error Trigger', 'n8n-nodes-base.errorTrigger', 1, [0, 0], {}),
    node('Summarize', 'n8n-nodes-base.set', 3.4, [220, 0], { assignments: { assignments: [
      { id: 'e1', name: 'workflow', type: 'string', value: '={{ $json.workflow.name }}' },
      { id: 'e2', name: 'error', type: 'string', value: "={{ [$json.execution.lastNodeExecuted, $json.execution.error && $json.execution.error.message].filter(Boolean).join(': ').slice(0, 800) }}" },
      { id: 'e3', name: 'url', type: 'string', value: '={{ $json.execution.url || "" }}' },
    ] }, options: {} }),
    sb('Record sync_run', 'POST', 'sync_run', [440, 0], {
      body: "={{ JSON.stringify({ workflow: $json.workflow, finished_at: $now.toISO(), status: 'error', error: $json.error }) }}",
      extra: { onError: 'continueRegularOutput' } }),
    telegram('Telegram alert',
      "=⚠️ <b>{{ $('Summarize').item.json.workflow.replace(/&/g, '&amp;').replace(/</g, '&lt;') }} FAILED</b>\n\n<pre>{{ $('Summarize').item.json.error.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }}</pre>\n{{ $('Summarize').item.json.url }}",
      [660, 0]),
  ],
  connections: link('Error Trigger', 'Summarize', 'Record sync_run', 'Telegram alert'),
};

// ── W1: daily re-check of sources ────────────────────────────────────────────
seq = 0;
workflows['W1-recheck'] = {
  name: 'Off_Shore_Insights - W1 Daily re-check',
  settings: settings(),
  nodes: [
    note('## W1 Daily re-check (06:00 Madrid)\nrpc/due_checks → fetch each source page, fingerprint its main text → raise review_flag (due / page_changed / fetch_failed) → one Telegram message per flag with ✅ / ✏️ buttons (handled by W2). **Never writes rates.** Max 25 flags per run.'),
    schedule('0 6 * * *'),
    start(),
    sb('Due checks', 'POST', 'rpc/due_checks', [400, 0], { body: '{}', extra: { alwaysOutputData: true } }),
    code('Check sources', 'w1-check-sources.js', [600, 0]),
    ifTrue('Any flags?', '={{ !$json.noop }}', [800, 0]),
    sb('Insert flag', 'POST', 'review_flag', [1000, -100], { prefer: 'return=representation',
      body: '={{ JSON.stringify({ target_table: $json.target_table, target_id: $json.target_id, reason: $json.reason, detail: $json.detail, observed_hash: $json.observed_hash }) }}' }),
    telegram('Send to Telegram', "={{ $('Check sources').item.json.msg }}", [1200, -100], {
      replyMarkup: 'inlineKeyboard',
      inlineKeyboard: { rows: [{ row: { buttons: [
        { text: '✅ Still correct', additionalFields: { callback_data: "=ok:{{ $('Insert flag').item.json.id }}" } },
        { text: '✏️ Needs update', additionalFields: { callback_data: "=upd:{{ $('Insert flag').item.json.id }}" } },
      ] } }] },
    }),
    sb('Save message id', 'PATCH', "review_flag?id=eq.{{ $('Insert flag').item.json.id }}", [1400, -100], {
      body: '={{ JSON.stringify({ telegram_msg_id: $json.result.message_id }) }}' }),
    record('W1_recheck', "$('Check sources').all().filter(i => !i.json.noop).length", [1600, 0]),
  ],
  connections: merge(
    link('Schedule', 'Start', 'Due checks', 'Check sources', 'Any flags?'),
    link(['Any flags?', 0], 'Insert flag', 'Send to Telegram', 'Save message id', 'Record sync_run'),
    link(['Any flags?', 1], 'Record sync_run'),
  ),
};

// ── W2: Telegram ✅ / ✏️ buttons ─────────────────────────────────────────────
seq = 0;
workflows['W2-telegram-callback'] = {
  name: 'Off_Shore_Insights - W2 Telegram buttons',
  settings: settings(),
  nodes: [
    note('## W2 Telegram buttons\n✅ → rpc/confirm_flag (verified_on = today, next_check_on = next budget cycle, source_hash updated). ✏️ → rpc/flag_needs_update (a human edits the rate in Studio, then resolves the flag). Only whitelisted Telegram user IDs; both RPCs are idempotent.'),
    node('Telegram Trigger', 'n8n-nodes-base.telegramTrigger', 1.2, [0, 0],
      { updates: ['callback_query'], additionalFields: { userIds: CHAT } },
      { credentials: CRED_TG, webhookId: 'a3c1f0e2-7b44-4d0c-9a51-0ff5b0e1a0f2' }),
    code('Parse button press', 'w2-parse-callback.js', [220, 0], 'runOnceForEachItem'),
    ifTrue('Allowed?', '={{ $json.allowed }}', [440, 0]),
    sb('Apply decision', 'POST', "rpc/{{ $json.fn }}", [660, -100], {
      body: "={{ JSON.stringify({ p_flag_id: $json.flag_id, p_reviewer: $json.reviewer }) }}" }),
    node('Answer button', 'n8n-nodes-base.telegram', 1.2, [880, -100], {
      resource: 'callback', operation: 'answerQuery',
      queryId: "={{ $('Parse button press').item.json.callback_id }}",
      additionalFields: { text: "={{ String($json.data ?? $json) }}" } }, { credentials: CRED_TG }),
    node('Update message', 'n8n-nodes-base.telegram', 1.2, [1100, -100], {
      resource: 'message', operation: 'editMessageText', messageType: 'message',
      chatId: "={{ $('Parse button press').item.json.chat_id }}",
      messageId: "={{ $('Parse button press').item.json.message_id }}",
      text: "={{ $('Parse button press').item.json.original_html }}\n\n→ <b>{{ String($('Apply decision').item.json.data ?? $('Apply decision').item.json).replace(/&/g, '&amp;').replace(/</g, '&lt;') }}</b> ({{ $('Parse button press').item.json.reviewer }})",
      additionalFields: { parse_mode: 'HTML' } }, { credentials: CRED_TG }),
    node('Refuse', 'n8n-nodes-base.telegram', 1.2, [660, 120], {
      resource: 'callback', operation: 'answerQuery', queryId: '={{ $json.callback_id }}',
      additionalFields: { text: 'Not allowed.', show_alert: true } }, { credentials: CRED_TG }),
  ],
  connections: merge(
    link('Telegram Trigger', 'Parse button press', 'Allowed?'),
    link(['Allowed?', 0], 'Apply decision', 'Answer button', 'Update message'),
    link(['Allowed?', 1], 'Refuse'),
  ),
};

// ── W3: monthly summary ──────────────────────────────────────────────────────
seq = 0;
workflows['W3-monthly'] = {
  name: 'Off_Shore_Insights - W3 Monthly summary',
  settings: settings(),
  nodes: [
    note('## W3 Monthly summary (1st, 08:00 Madrid)\nrpc/monthly_summary → Telegram: flags raised/confirmed/pending, rows due this month, rows with conflicting sources, workflow errors.'),
    schedule('0 8 1 * *'),
    start(),
    sb('Monthly numbers', 'POST', 'rpc/monthly_summary', [400, 0], { body: '{}' }),
    code('Format', 'w3-format-summary.js', [600, 0], 'runOnceForEachItem'),
    telegram('Send summary', '={{ $json.text }}', [800, 0]),
    record('W3_monthly', '1', [1000, 0]),
  ],
  connections: link('Schedule', 'Start', 'Monthly numbers', 'Format', 'Send summary', 'Record sync_run'),
};

// ── W4: budget-date watcher ──────────────────────────────────────────────────
seq = 0;
workflows['W4-budget'] = {
  name: 'Off_Shore_Insights - W4 Budget watcher',
  settings: settings(),
  nodes: [
    note('## W4 Budget watcher (05:30 Madrid, before W1)\nrpc/apply_budget_dates: once a jurisdiction\'s budget date has passed, its rows verified on/before that date get next_check_on = today, so W1 flags them at 06:00. Does not repeat once re-verified.'),
    schedule('30 5 * * *'),
    start(),
    sb('Apply budget dates', 'POST', 'rpc/apply_budget_dates', [400, 0], { body: '{}' }),
    record('W4_budget', "Number($('Apply budget dates').first().json.data ?? 0)", [600, 0]),
  ],
  connections: link('Schedule', 'Start', 'Apply budget dates', 'Record sync_run'),
};

// ── E1: Eurostat business owners ─────────────────────────────────────────────
seq = 0;
workflows['E1-eurostat'] = {
  name: 'Off_Shore_Insights - E1 Eurostat business owners',
  settings: settings(),
  nodes: [
    note('## E1 Eurostat (2nd of month, 05:00 Madrid)\nlfsa_egaps, SELF_S = self-employed with employees (employers), last ~6 years → upsert wealth_market.business_owners (unique jurisdiction+year+source). Other wealth figures stay manual.'),
    schedule('0 5 2 * *'),
    start(),
    sb('Countries', 'GET', 'jurisdiction?kind=eq.country&is_offshore_hub=eq.false&select=code', [400, 0]),
    code('Fetch Eurostat', 'e1-fetch-eurostat.js', [600, 0]),
    sb('Upsert wealth_market', 'POST', 'wealth_market?on_conflict=jurisdiction_code,year,source', [800, 0], {
      prefer: 'resolution=merge-duplicates,return=minimal', body: '={{ JSON.stringify($json.rows) }}' }),
    record('E1_eurostat', "$('Fetch Eurostat').first().json.count", [1000, 0]),
  ],
  connections: link('Schedule', 'Start', 'Countries', 'Fetch Eurostat', 'Upsert wealth_market', 'Record sync_run'),
};

// ── R1: the emailed report ───────────────────────────────────────────────────
// The browser builds the report (HTML + Excel) and sends it to the login gateway, which checks the token, picks the signed-in
// user's own address and calls this webhook with a shared secret. Here: Gotenberg renders the HTML to a PDF, then the PDF and
// the Excel go out through the Pi's SMTP (Mailpit -> DKIM-signing Postfix, sender info@codeine.cloud).
// Credentials are created by push.mjs; the placeholders below are replaced with their ids.
const CRED_HOOK = { httpHeaderAuth: { id: '__CRED_REPORT_HEADER__', name: 'Off_Shore_Insights report webhook' } };
const CRED_SMTP = { smtp: { id: '__CRED_SMTP__', name: 'Pi SMTP (Mailpit, info@codeine.cloud)' } };
seq = 0;
workflows['R1-report-mail'] = {
  name: 'Off_Shore_Insights - R1 Report mail',
  settings: settings(),
  nodes: [
    note('## R1 Report mail\nWebhook (header secret, called only by the login gateway) → check the payload → Gotenberg renders the HTML to a PDF (container offshore-insights-render on the n8n network; no network access, no JavaScript) → name the files → send from info@codeine.cloud through the Pi SMTP (host.docker.internal:1025) with the PDF and the Excel attached → answer {ok:true}. Any failure raises the Error alert. The recipient comes from the gateway, which takes it from the signed-in user, never from the request.', [0, -260], 760),
    node('Webhook', 'n8n-nodes-base.webhook', 2, [0, 0], { httpMethod: 'POST', path: 'offshore-report-mail', authentication: 'headerAuth', responseMode: 'responseNode', options: {} },
      { credentials: CRED_HOOK, webhookId: 'c91f5a64-3d0e-4b52-8c1a-7e2f40b9d6a3' }),
    code('Prepare', 'r1-prepare.js', [240, 0], 'runOnceForEachItem'),
    node('Render PDF', 'n8n-nodes-base.httpRequest', 4.2, [480, 0], {
      method: 'POST', url: 'http://offshore-insights-render:3000/forms/chromium/convert/html', sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: { parameters: [
        { parameterType: 'formBinaryData', name: 'files', inputDataFieldName: 'index_html' },
        { name: 'paperWidth', value: '8.27' }, { name: 'paperHeight', value: '11.7' },
        { name: 'marginTop', value: '0' }, { name: 'marginBottom', value: '0' }, { name: 'marginLeft', value: '0' }, { name: 'marginRight', value: '0' },
        { name: 'printBackground', value: 'true' }, { name: 'preferCssPageSize', value: 'true' }, { name: 'emulatedMediaType', value: 'print' },
      ] },
      options: { timeout: 60000, response: { response: { responseFormat: 'file', outputPropertyName: 'pdf' } } } }),
    code('Name the files', 'r1-name.js', [720, 0], 'runOnceForEachItem'),
    node('Send email', 'n8n-nodes-base.emailSend', 2.1, [960, 0], {
      fromEmail: 'Off_Shore_Insights <info@codeine.cloud>', toEmail: '={{ $json.to }}', subject: '={{ $json.subject }}', emailFormat: 'html', html: '={{ $json.html }}',
      options: { attachments: 'pdf,xlsx', appendAttribution: false, allowUnauthorizedCerts: true } }, { credentials: CRED_SMTP }),
    node('Answer', 'n8n-nodes-base.respondToWebhook', 1.1, [1200, 0], { respondWith: 'json', responseBody: '={{ JSON.stringify({ ok: true }) }}', options: {} }),
  ],
  connections: link('Webhook', 'Prepare', 'Render PDF', 'Name the files', 'Send email', 'Answer'),
};

for (const [file, wf] of Object.entries(workflows)) {
  writeFileSync(join(here, `${file}.json`), JSON.stringify(wf, null, 2) + '\n');
  console.log(`wrote n8n/${file}.json  (${wf.nodes.length} nodes)`);
}
