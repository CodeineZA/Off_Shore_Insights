// G5 · Sample client bill: many rates → one euro figure per country.
import { useState } from 'react';
import type { Dashboard } from '../data/types';
import { SAMPLE, SAMPLE_ASSUMPTIONS, sampleBill, type Basis, type BillPart } from '../data/model';
import BillBars, { PART_COLOR } from './BillBars';
import { Card, Seg, fmtEur, useCompact } from './common';

/** Which bill parts each tax-category toggle controls. */
const PART_CAT: Record<BillPart['key'], string> = { cgt: 'investment', wealth: 'wealth', inheritance: 'estate' };

export default function G5ClientBill({ d, cc, cats }: { d: Dashboard; cc: string[]; cats: string[] }) {
  const compact = useCompact();
  const [basis, setBasis] = useState<Basis>('top');
  const client = { ...SAMPLE, basis };
  const bills = cc.map((code) => sampleBill(d, code, client));
  const show = (Object.keys(PART_CAT) as BillPart['key'][]).filter((k) => cats.includes(PART_CAT[k]));
  const byTotal = [...bills].sort((a, b) => b.total - a.total);
  return (
    <Card id="g5" full title="Sample client bill"
      metric={byTotal[0] ? { value: fmtEur(byTotal[0].total), label: `${byTotal[0].name} pays most`, sub: `least ${byTotal[byTotal.length - 1].name} ${fmtEur(byTotal[byTotal.length - 1].total)}` } : undefined} purpose="What the same €2m portfolio pays in tax over 20 years, and when it passes to the children"
      controls={<Seg label="Rate basis" opts={[['top', 'Top band'], ['entry', 'Entry band']]} cur={basis} on={setBasis} />}
      foot={<>
        <div className="legend">
          <span><i style={{ background: PART_COLOR.cgt }} />Capital gains</span><span><i style={{ background: PART_COLOR.wealth }} />Wealth taxes</span>
          <span><i style={{ background: PART_COLOR.inheritance }} />Inheritance</span><span><i className="hatch-dot" />Unknown part</span>
        </div>
        <div>Model: {SAMPLE_ASSUMPTIONS(client).join(' · ')}.</div>
      </>}>
      {!cc.length || !show.length ? <div className="empty">Select countries and at least one of Investment, Wealth or Estate.</div>
        : <BillBars bills={bills} show={show} depKey={cc.join() + basis + show.join()} limit={compact ? 5 : undefined} />}
    </Card>
  );
}
