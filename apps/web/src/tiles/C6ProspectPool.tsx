// C6 · Prospect pool: how many potential clients the country has, by wealth tier.
// Tiers overlap (every HNWI is also a millionaire), so they are shown side by side, not summed.
import type { Dashboard } from '../data/types';
import { WEALTH_LABEL, latestWealth, type WealthMetric } from '../data/model';
import { fmtCount, nameOf } from '../data/insights';
import { Card, useGrown } from './common';

const TIERS: { m: WealthMetric; what: string }[] = [
  { m: 'business_owners', what: 'self-employed with employees (Eurostat)' },
  { m: 'millionaires', what: 'net worth over US$1m (UBS)' },
  { m: 'hnwi_count', what: 'investable assets over US$1m (Capgemini)' },
  { m: 'uhnwi_count', what: 'over US$30m (Knight Frank)' },
];

export default function C6ProspectPool({ d, code }: { d: Dashboard; code: string }) {
  const rows = TIERS.map((t) => ({ ...t, w: latestWealth(d, code, t.m) }));
  const max = Math.max(1, ...rows.map((r) => r.w?.value ?? 0));
  const known = rows.filter((r) => r.w);
  const grown = useGrown([code]);
  return (
    <Card id="c6" title="Prospect pool"
      metric={known[0] ? { value: fmtCount(known[0].w!.value), label: WEALTH_LABEL[known[0].m].toLowerCase(), sub: `${known.length} of ${TIERS.length} tiers known` } : { value: '?', label: 'no wealth figures yet' }} purpose={`How many potential clients ${nameOf(d, code)} has, by wealth tier`}
      foot={<div>Tiers overlap and come from different reports, so they are not added up. Missing tiers are entered from the wealth reports (manual recipes).</div>}>
      <div className="pool">
        {rows.map((r) => (
          <div className="pool-row" key={r.m}>
            <div className="pool-label"><b>{WEALTH_LABEL[r.m]}</b><small>{r.what}</small></div>
            <div className="pool-bar">{r.w
              ? <div className="h2h-bar" style={{ width: grown ? `${Math.max(1, (r.w.value / max) * 100)}%` : 0, background: '#d8b07a' }} />
              : <div className="h2h-bar unknown" style={{ width: grown ? '8%' : 0 }} />}</div>
            <div className="pool-val">{r.w ? `${Math.round(r.w.value).toLocaleString('en')}` : '?'}<small>{r.w ? ` (${r.w.year})` : ''}</small></div>
          </div>
        ))}
      </div>
    </Card>
  );
}
