// G6 · Where the wealth is: each selected country's share of the chosen wealth measure.
import { useState } from 'react';
import type { Dashboard } from '../data/types';
import { WEALTH_LABEL, latestWealth, type WealthMetric } from '../data/model';
import { nameOf } from '../data/insights';
import { Donut } from '../ui/charts';
import { Card, Seg } from './common';

const METRICS: WealthMetric[] = ['hnwi_count', 'millionaires', 'business_owners'];

export default function G6WealthShare({ d, cc }: { d: Dashboard; cc: string[] }) {
  const available = METRICS.filter((m) => d.wealth.some((w) => w[m] != null));
  const [metric, setMetric] = useState<WealthMetric>(available[0] ?? 'hnwi_count');
  const [hover, setHover] = useState<number | null>(null);
  const items = cc.map((code) => ({ code, name: nameOf(d, code), w: latestWealth(d, code, metric) }))
    .filter((x) => x.w).map((x) => ({ code: x.code, name: x.name, value: x.w!.value, year: x.w!.year, source: x.w!.source }));
  const missing = cc.filter((c) => !latestWealth(d, c, metric)).map((c) => nameOf(d, c));
  const years = [...new Set(items.map((i) => i.year))].sort();
  return (
    <Card id="g6" title="Where the wealth is" purpose="Which of the selected countries holds most of the prospects"
      controls={<Seg label="Measure" opts={METRICS.map((m) => [m, WEALTH_LABEL[m]] as [WealthMetric, string])} cur={metric} on={(m) => { setMetric(m); setHover(null); }} />}
      foot={<>
        {items.length > 0 && <div>{WEALTH_LABEL[metric]}, latest year {years.join('/')}, source {items[0].source}.</div>}
        {missing.length > 0 && <div>No figure yet: {missing.join(', ')}.</div>}
      </>}>
      {items.length
        ? <Donut items={items} caption={WEALTH_LABEL[metric]} replay={0} hover={hover} onHover={setHover} key={metric + cc.join()} />
        : <div className="empty">No {WEALTH_LABEL[metric].toLowerCase()} figures yet. They come from the wealth reports (manual recipe).</div>}
    </Card>
  );
}
