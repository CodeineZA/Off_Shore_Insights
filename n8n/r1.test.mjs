// Tests the two Code-node scripts of workflow R1 (n8n/src/r1-*.js) with a fake of the n8n context they run in.
//   node --test n8n/r1.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const script = (f) => readFileSync(join(here, 'src', f), 'utf8');
// $json / $input / $ : what n8n hands a "run once for each item" Code node. prepareBinaryData keeps what it was given.
const ctx = ({ json = {}, binary = {}, nodes = {} } = {}) => ({
  helpers: { prepareBinaryData: async (buf, fileName, mimeType) => ({ buf, fileName, mimeType, data: buf.toString('base64') }) },
  $json: json, $input: { item: { json, binary } },
  $: (name) => ({ item: nodes[name] }),
});
const run = (f, c) => new AsyncFunction('$json', '$input', '$', script(f)).call({ helpers: c.helpers }, c.$json, c.$input, c.$);

const HTML = '<!doctype html><html><body>hi</body></html>';
const good = { body: { to: 'a@example.com', subject: 'Subject', summary: 'If you had put it in <b>', filenameBase: 'OffShore-Insights_NL', html: HTML, xlsxBase64: 'UEsDBA==', requestedBy: 'hentus' } };

test('Prepare turns the request into index.html (named as the renderer needs) and the Excel', async () => {
  const out = await run('r1-prepare.js', ctx({ json: good }));
  assert.deepEqual(out.json, { to: 'a@example.com', subject: 'Subject', summary: 'If you had put it in <b>', filenameBase: 'OffShore-Insights_NL', requestedBy: 'hentus' });
  assert.equal(out.binary.index_html.fileName, 'index.html');
  assert.equal(out.binary.index_html.mimeType, 'text/html');
  assert.equal(out.binary.index_html.buf.toString('utf8'), HTML);
  assert.equal(out.binary.xlsx.fileName, 'OffShore-Insights_NL.xlsx');
  assert.match(out.binary.xlsx.mimeType, /spreadsheetml\.sheet$/);
  assert.deepEqual([...out.binary.xlsx.buf], [0x50, 0x4b, 0x03, 0x04]);
});

test('Prepare refuses anything incomplete or malformed, so no mail is sent', async () => {
  const bad = [
    { ...good.body, to: 'not-an-email' }, { ...good.body, to: undefined }, { ...good.body, subject: 'a\r\nBcc: x@y.z' }, { ...good.body, filenameBase: '../x' },
    { ...good.body, html: '<html>no doctype</html>' }, { ...good.body, xlsxBase64: 'not base64!' }, { ...good.body, xlsxBase64: '' }, { ...good.body, summary: '' },
  ];
  for (const body of bad) await assert.rejects(run('r1-prepare.js', ctx({ json: { body } })), /R1:/, JSON.stringify(body).slice(0, 60));
  await assert.rejects(run('r1-prepare.js', ctx({ json: {} })), /R1:/);
});

test('Name the files names the PDF, keeps the Excel, escapes the summary, and addresses the mail to the prepared recipient', async () => {
  const prepared = await run('r1-prepare.js', ctx({ json: good }));
  const rendered = { pdf: { fileName: 'data', mimeType: 'application/octet-stream', data: 'JVBERi0=' } };
  const out = await run('r1-name.js', ctx({ json: {}, binary: rendered, nodes: { Prepare: { json: prepared.json, binary: prepared.binary } } }));
  assert.equal(out.json.to, 'a@example.com');
  assert.equal(out.json.subject, 'Subject');
  assert.equal(out.binary.pdf.fileName, 'OffShore-Insights_NL.pdf');
  assert.equal(out.binary.pdf.mimeType, 'application/pdf');
  assert.equal(out.binary.xlsx.fileName, 'OffShore-Insights_NL.xlsx');
  assert.ok(out.json.html.includes('If you had put it in &lt;b&gt;'));
  assert.ok(!out.json.html.includes('<b>'));
  assert.ok(out.json.html.includes('Indicative only, not tax advice'));
});

test('Name the files stops if the renderer returned nothing', async () => {
  const prepared = await run('r1-prepare.js', ctx({ json: good }));
  await assert.rejects(run('r1-name.js', ctx({ json: {}, binary: {}, nodes: { Prepare: { json: prepared.json, binary: prepared.binary } } })), /PDF or the Excel is missing/);
});
