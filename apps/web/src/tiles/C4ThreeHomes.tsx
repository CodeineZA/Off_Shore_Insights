// C4 · Same client, three homes: the sample-client bill if the client lived in the chosen
// country, in Mauritius, or in Seychelles.
import { useState } from 'react';
import type { Dashboard } from '../data/types';
import { SAMPLE, SAMPLE_ASSUMPTIONS, sampleBill, type Basis } from '../data/model';
import { nameOf } from '../data/insights';
import BillBars, { PART_COLOR } from './BillBars';
import { Card, Seg, fmtEur } from './common';
import { trio } from './C1HeadToHead';

export default function C4ThreeHomes({ d, code }: { d: Dashboard; code: string }) {
  const [basis, setBasis] = useState<Basis>('top');
  const client = { ...SAMPLE, basis };
  const bills = trio(code).map((c) => sampleBill(d, c, client));
  const saving = bills[0].total - Math.min(bills[1].total, bills[2].total);
  return (
    <Card id="c4" title="Same client, three homes" purpose={`One number each: what the €2m client pays living in ${nameOf(d, code)}, Mauritius or Seychelles`}
      controls={<Seg label="Rate basis" opts={[['top', 'Top band'], ['entry', 'Entry band']]} cur={basis} on={setBasis} />}
      foot={<>
        <div className="legend"><span><i style={{ background: PART_COLOR.cgt }} />Capital gains</span><span><i style={{ background: PART_COLOR.wealth }} />Wealth taxes</span><span><i style={{ background: PART_COLOR.inheritance }} />Inheritance</span></div>
        {saving > 0 && <div>Difference against the cheaper hub: <b>{fmtEur(saving)}</b> over 20 years and inheritance.</div>}
        <div>Model: {SAMPLE_ASSUMPTIONS(client).join(' · ')}.</div>
      </>}>
      <BillBars bills={bills} show={['cgt', 'wealth', 'inheritance']} sortDesc={false} depKey={code + basis} />
    </Card>
  );
}
