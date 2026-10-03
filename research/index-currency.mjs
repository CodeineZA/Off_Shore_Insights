// Turn an index's US-dollar return into the return an investor holding another currency would have had.
// An investor in currency C converts C to dollars at the start of the year, holds the index, and converts back at the end:
//     return_C = (1 + return_USD) x (C per USD at the end / C per USD at the start) - 1
// The exchange rates are the ECB euro foreign exchange reference rates (units of currency per 1 EUR), taken on the last day
// they were published on or before 31 December. Pure functions; research/derive-index-currency.mjs does the fetching.

/** Units of `ccy` per 1 USD, from ECB rates (units per EUR). EUR itself is 1 per EUR. */
export const unitsPerUsd = (rates, ccy) => (ccy === 'EUR' ? 1 : rates[ccy]) / rates.USD;

/** The return, in percent (2 decimals, like the MSCI factsheet), for an investor in `ccy`. */
export function convertReturn(usdReturnPct, ratesStart, ratesEnd, ccy) {
  const f = unitsPerUsd(ratesEnd, ccy) / unitsPerUsd(ratesStart, ccy);
  return Math.round(((1 + usdReturnPct / 100) * f - 1) * 10000) / 100;
}

/** The latest observation on or before `date` (YYYY-MM-DD) from [{date, value}] sorted or not; null if there is none. */
export function lastOnOrBefore(obs, date) {
  let best = null;
  for (const o of obs) if (o.date <= date && (!best || o.date > best.date)) best = o;
  return best;
}

/** Parse the ECB SDMX csvdata response into { USD: [{date, value}], ZAR: [...] }. */
export function parseEcbCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(',');
  const col = (n) => head.indexOf(n);
  const [c, t, v] = [col('CURRENCY'), col('TIME_PERIOD'), col('OBS_VALUE')];
  if (c < 0 || t < 0 || v < 0) throw new Error('unexpected ECB csv header: ' + lines[0].slice(0, 120));
  const out = {};
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    const value = Number(f[v]);
    if (!Number.isFinite(value) || !(value > 0)) continue;
    (out[f[c]] ??= []).push({ date: f[t], value });
  }
  return out;
}
