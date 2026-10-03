// R1 · Prepare: check what the gateway sent and turn it into two files (the HTML for the renderer, the Excel as it will be attached).
// The gateway has already checked the token, chosen the recipient and screened the HTML; this re-checks the shape, because the
// webhook is the last door before a real email is sent.
const b = $json.body || {};
const str = (v, max) => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const to = str(b.to, 254), subject = str(b.subject, 200), summary = str(b.summary, 800), base = str(b.filenameBase, 120);
const html = str(b.html, 4500000), x = str(b.xlsxBase64, 1500000);
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('R1: no valid recipient');
if (!subject || /[\r\n]/.test(subject) || !summary || !base || !/^[A-Za-z0-9._-]+$/.test(base)) throw new Error('R1: the request is incomplete or malformed');
if (!html || !/^<!doctype html>/i.test(html)) throw new Error('R1: the report is not an HTML document');
if (!x || !/^[A-Za-z0-9+/]+={0,2}$/.test(x)) throw new Error('R1: the Excel is missing or malformed');
const xlsxMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
return {
  json: { to, subject, summary, filenameBase: base, requestedBy: String(b.requestedBy || '').slice(0, 64) },
  binary: {
    index_html: await this.helpers.prepareBinaryData(Buffer.from(html, 'utf8'), 'index.html', 'text/html'),   // Gotenberg wants the file named index.html
    xlsx: await this.helpers.prepareBinaryData(Buffer.from(x, 'base64'), base + '.xlsx', xlsxMime),
  },
};
