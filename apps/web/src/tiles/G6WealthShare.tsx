// G6 · Where the wealth is: each selected country's share of the chosen wealth measure.
import { useState } from 'react';
import type { Dashboard } from '../data/types';
import { WEALTH_LABEL, latestWealth, type WealthMetric } from '../data/model';
import { fmtCount, nameOf } from '../data/insights';
import { Donut } from '../ui/charts';
import { Card, Seg } from './common';

const METRICS: WealthMetric[] = ['millionaires', 'uhnwi_count', 'business_owners', 'hnwi_count'];

export default function G6WealthShare({ d, cc }: { d: Dashboard; cc: string[] }) {
  const available = METRICS.filter((m) => d.wealth.some((w) => w[m] != null));
  const [metric, setMetric] = useState<WealthMetric>(available[0] ?? 'millionaires');
  const [hover, setHover] = useState<number | null>(null);
  const items = cc.map((code) => ({ code, name: nameOf(d, code), w: latestWealth(d, code, metric) }))
    .filter((x) => x.w).map((x) => ({ code: x.code, name: x.name, value: x.w!.value, year: x.w!.year, source: x.w!.source }));
  const missing = cc.filter((c) => !latestWealth(d, c, metric)).map((c) => nameOf(d, c));
  const years = [...new Set(items.map((i) => i.year))].sort();
  const total = items.reduce((s, i) => s + i.value, 0), lead = [...items].sort((a, b) => b.value - a.value)[0];
  return (
    <Card id="g6" title="Where the wealth is"
      metric={lead ? { value: `${Math.round((lead.value / total) * 100)}%`, label: `in ${lead.name}`, sub: `of ${fmtCount(total)} ${WEALTH_LABEL[metric].toLowerCase()}` } : undefined} purpose="Which of the selected countries holds most of the prospects"
      controls={<Seg label="Measure" opts={METRICS.map((m) => [m, WEALTH_LABEL[m]] as [WealthMetric, string])} cur={metric} on={(m) => { setMetric(m); setHover(null); }} />}
      legend={items.length > 0 ? <em>Share of {WEALTH_LABEL[metric].toLowerCase()} across the selected countries · {years.join('/')} · {items[0].source}</em> : undefined}
      foot={<>
        {missing.length > 0 && <div>No figure yet: {missing.join(', ')}.</div>}
      </>}>
      {items.length
        ? <Donut items={items} caption={WEALTH_LABEL[metric]} replay={0} hover={hover} onHover={setHover} key={metric + cc.join()} />
        : <div className="empty">No {WEALTH_LABEL[metric].toLowerCase()} figures yet. They come from the wealth reports (manual recipe).</div>}
    </Card>
  );
}
