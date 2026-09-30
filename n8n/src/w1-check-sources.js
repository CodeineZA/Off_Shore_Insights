// n8n Code node (Run Once for All Items) — W1 "Check sources".
// Input: rows from rpc/due_checks. Output: one item per review_flag to raise,
// or a single { noop: true } item when nothing is due.
// Never writes rates. `crypto` is blocked in n8n's sandbox, so SHA-256 is inlined.
const MAX_FLAGS = 25; // per run; the rest stay due and are picked up tomorrow

function sha256(str) {
  const bytes = unescape(encodeURIComponent(str)); // UTF-8 as a byte string
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const l = bytes.length;
  const words = [];
  for (let i = 0; i < l; i++) words[i >> 2] |= bytes.charCodeAt(i) << (24 - (i % 4) * 8);
  words[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
  const nWords = (((l + 8) >> 6) + 1) * 16;
  for (let i = words.length; i < nWords; i++) words[i] = words[i] | 0;
  words[nWords - 1] = l * 8;
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const W = new Array(64);
  for (let j = 0; j < nWords; j += 16) {
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      if (i < 16) W[i] = words[j + i] | 0;
      else {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

// Main text only: drop scripts, styles and site chrome so cosmetic changes don't flag.
function mainText(html) {
  let h = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|nav|header|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
  const m = h.match(/<main\b[\s\S]*?<\/main>/i) || h.match(/<article\b[\s\S]*?<\/article>/i);
  if (m) h = m[0];
  return h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const REASON = { due: 'periodic re-check', page_changed: 'SOURCE PAGE CHANGED', fetch_failed: 'source could not be fetched' };

const rows = $input.all().map((i) => i.json).filter((r) => r && r.target_table);
const cache = new Map(); // url → { hash } | { error } (many treaties share one MRA page)
const out = [];

for (const r of rows.slice(0, MAX_FLAGS)) {
  let reason, detail, hash = null;
  if (!r.source_url) {
    reason = 'due'; detail = 'No source URL on this row yet.';
  } else {
    if (!cache.has(r.source_url)) {
      try {
        const res = await this.helpers.httpRequest({
          url: r.source_url, timeout: 20000, returnFullResponse: true,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OffShoreInsights/1.0; source re-check)' },
        });
        cache.set(r.source_url, { hash: sha256(mainText(res.body)) });
      } catch (e) {
        cache.set(r.source_url, { error: String(e.message || e).slice(0, 200) });
      }
    }
    const c = cache.get(r.source_url);
    if (c.error) { reason = 'fetch_failed'; detail = c.error; }
    else {
      hash = c.hash;
      if (!r.source_hash) { reason = 'due'; detail = 'First check: no stored page fingerprint yet.'; }
      else if (hash !== r.source_hash) { reason = 'page_changed'; detail = 'The source page text changed since the last confirmation.'; }
      else { reason = 'due'; detail = 'Source page unchanged; periodic re-check (an unchanged page does not prove an unchanged rate).'; }
    }
  }
  const msg = [
    `🔎 <b>${esc(r.label)}</b>`,
    `Now: <b>${esc(r.current_value)}</b>`,
    `Reason: ${esc(REASON[reason])}`,
    esc(detail),
    r.source_url ? `<a href="${esc(r.source_url)}">Open source</a>` : '',
  ].filter(Boolean).join('\n');
  out.push({ json: { target_table: r.target_table, target_id: r.target_id, reason, detail, observed_hash: hash, msg } });
}

if (!out.length) return [{ json: { noop: true, due: rows.length } }];
return out;
