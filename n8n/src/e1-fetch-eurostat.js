// n8n Code node (Run Once for All Items) — E1 "Fetch Eurostat".
// Input: jurisdiction rows {code} (countries, not hubs). Output: one item {rows:[...]} for a
// single bulk upsert into wealth_market. Only business_owners comes from here; the other
// wealth figures are entered by hand from the UBS / Capgemini / Knight Frank reports.
const DATASET = 'lfsa_egaps'; // Employed persons by professional status; SELF_S = employers
const SOURCE = 'Eurostat lfsa_egaps (SELF_S)';
const TO_EUROSTAT = { GB: 'UK', GR: 'EL' };
const codes = $input.all().map((i) => i.json.code).filter((c) => /^[A-Z]{2}$/.test(c));
const geo = codes.map((c) => TO_EUROSTAT[c] || c);
const back = Object.fromEntries(codes.map((c) => [TO_EUROSTAT[c] || c, c]));
const since = new Date().getFullYear() - 6;
const url = `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${DATASET}?format=JSON&lang=EN` +
  `&wstatus=SELF_S&sex=T&age=Y15-74&unit=THS_PER&sinceTimePeriod=${since}` + geo.map((g) => `&geo=${g}`).join('');
const j = await this.helpers.httpRequest({ url, json: true, timeout: 30000 });
if (!j || !j.dimension) throw new Error('Unexpected Eurostat response: ' + JSON.stringify(j).slice(0, 300));
const dims = j.id, size = j.size;
const idx = (dim, key) => j.dimension[dim].category.index[key];
const today = new Date().toISOString().slice(0, 10);
const rows = [];
for (const g of Object.keys(j.dimension.geo.category.index)) {
  for (const t of Object.keys(j.dimension.time.category.index)) {
    // Flat index over all dimensions (every dimension except geo/time has size 1 here).
    let flat = 0;
    for (let d = 0; d < dims.length; d++) {
      const pos = dims[d] === 'geo' ? idx('geo', g) : dims[d] === 'time' ? idx('time', t) : 0;
      flat = flat * size[d] + pos;
    }
    const v = j.value[flat];
    if (v === undefined || v === null || !back[g]) continue;
    rows.push({ jurisdiction_code: back[g], year: Number(t), business_owners: Math.round(v * 1000),
      source: SOURCE, source_url: `https://ec.europa.eu/eurostat/databrowser/view/${DATASET}/default/table`,
      verified_on: today });
  }
}
if (!rows.length) throw new Error('Eurostat returned no values for ' + geo.join(','));
return [{ json: { rows, count: rows.length } }];
