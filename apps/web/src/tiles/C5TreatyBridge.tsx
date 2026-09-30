// C5 · Treaty bridge: does the handshake with each hub exist, and what is it worth?
import type { Dashboard } from '../data/types';
import { gateCells } from '../data/model';
import { fmtDate, nameOf, pct, rateOf } from '../data/insights';
import { Card, GATE_COLOR, SourceLink, useCompact } from './common';

export default function C5TreatyBridge({ d, code }: { d: Dashboard; code: string }) {
  const compact = useCompact();
  const domDiv = rateOf(d, code, 'WHT_DIVIDEND'), domInt = rateOf(d, code, 'WHT_INTEREST');
  const inForce = ['MU', 'SC'].filter((h) => d.treaties.find((x) => x.country_a === h && x.country_b === code)?.status === 'in_force');
  return (
    <Card id="c5" title="Treaty bridge"
      metric={{ value: `${inForce.length}/2`, label: 'treaties in force', sub: inForce.map((h) => nameOf(d, h)).join(', ') || 'none' }} purpose={`Whether ${nameOf(d, code)} has a tax treaty with each hub, and what it caps`}
      foot={<div>Treaty caps are the maximum withholding either side may charge on cross-border dividends and interest. Domestic = what {nameOf(d, code)} charges non-residents without a treaty.</div>}>
      {compact ? (
        <div className="bridge-mini">{['MU', 'SC'].map((hub) => { const g = gateCells(d, code, hub)[0]; const t = d.treaties.find((x) => x.country_a === hub && x.country_b === code); return (
          <div key={hub}><span>{nameOf(d, hub)}</span><span className={'gate-pill ' + g.status} style={{ ['--gc' as string]: GATE_COLOR[g.status] }}>{g.label}</span><small>{t?.in_force_on ? 'since ' + t.in_force_on.slice(0, 4) : ''}</small></div>); })}</div>
      ) : <div className="bridges">
        {['MU', 'SC'].map((hub) => {
          const t = d.treaties.find((x) => x.country_a === hub && x.country_b === code);
          const g = gateCells(d, code, hub)[0];
          return (
            <div className="bridge" key={hub}>
              <div className="bridge-head"><span className="bridge-hub">{nameOf(d, hub)}</span>
                <span className={'gate-pill ' + g.status} style={{ ['--gc' as string]: GATE_COLOR[g.status] }}>{g.label}</span></div>
              <dl className="facts">
                <div><dt>Signed</dt><dd>{t?.signed_on ? fmtDate(t.signed_on) : '—'}</dd></div>
                <div><dt>In force</dt><dd>{t?.in_force_on ? fmtDate(t.in_force_on) : '—'}</dd></div>
                <div><dt>Dividends</dt><dd>{t?.wht_dividend != null ? `cap ${pct(t.wht_dividend)}` : 'cap —'}<small> · domestic {domDiv ? pct(domDiv.headline_rate) : '?'}</small></dd></div>
                <div><dt>Interest</dt><dd>{t?.wht_interest != null ? `cap ${pct(t.wht_interest)}` : 'cap —'}<small> · domestic {domInt ? pct(domInt.headline_rate) : '?'}</small></dd></div>
              </dl>
              {t?.mli_note && <p className="bridge-note">{t.mli_note}</p>}
              <div className="bridge-src">{t ? <SourceLink url={t.source_url} /> : <span className="muted">No treaty data yet</span>}</div>
            </div>
          );
        })}
      </div>}
    </Card>
  );
}
