// C5 · Treaty bridge: does the treaty handshake exist, and what is it worth? Structures are set up
// in Mauritius first and moved to Seychelles afterwards, so the Mauritius treaty is the one that
// counts for both hubs (TREATY_HUB). A region uses its country's treaty.
import type { Dashboard } from '../data/types';
import { TREATY_HUB, gateCells } from '../data/model';
import { countryOf, fmtDate, nameOf, pct, rateOf } from '../data/insights';
import { Card, GATE_COLOR, SourceLink, useCompact } from './common';

export default function C5TreatyBridge({ d, code }: { d: Dashboard; code: string }) {
  const compact = useCompact();
  const domDiv = rateOf(d, code, 'WHT_DIVIDEND'), domInt = rateOf(d, code, 'WHT_INTEREST');
  const country = countryOf(d, code), hubName = nameOf(d, TREATY_HUB);
  const t = d.treaties.find((x) => x.country_a === TREATY_HUB && x.country_b === country);
  const g = gateCells(d, code, TREATY_HUB)[0];
  const pill = <span className={'gate-pill ' + g.status} style={{ ['--gc' as string]: GATE_COLOR[g.status] }}>{g.label}</span>;
  return (
    <Card id="c5" title="Treaty bridge"
      metric={{ value: g.label, label: `treaty with ${hubName}`, sub: t?.in_force_on ? `since ${t.in_force_on.slice(0, 4)}` : undefined }}
      purpose={`Whether ${nameOf(d, country)} has a tax treaty with ${hubName}, the entry point for both hubs, and what it caps`}
      legend={<><em><b>Cap</b> = the most either side may withhold on cross-border dividends or interest under the treaty</em><em><b>Domestic</b> = what {nameOf(d, country)} charges non-residents without one</em>
        <em><b>Seychelles</b>: structures are set up in {hubName} first and moved afterwards, so its own treaty does not matter</em></>}>
      {compact ? (
        <div className="bridge-mini">
          <div><span>{hubName}</span>{pill}<small>{t?.in_force_on ? 'since ' + t.in_force_on.slice(0, 4) : ''}</small></div>
          <div><span>{nameOf(d, 'SC')}</span><span className="muted">via {hubName}</span><small /></div>
        </div>
      ) : (
        <div className="bridges">
          <div className="bridge">
            <div className="bridge-head"><span className="bridge-hub">{hubName}</span>{pill}</div>
            <dl className="facts">
              <div><dt>Signed</dt><dd>{t?.signed_on ? fmtDate(t.signed_on) : '—'}</dd></div>
              <div><dt>In force</dt><dd>{t?.in_force_on ? fmtDate(t.in_force_on) : '—'}</dd></div>
              <div><dt>Dividends</dt><dd>{t?.wht_dividend != null ? `cap ${pct(t.wht_dividend)}` : 'cap —'}<small> · domestic {domDiv ? pct(domDiv.headline_rate) : '?'}</small></dd></div>
              <div><dt>Interest</dt><dd>{t?.wht_interest != null ? `cap ${pct(t.wht_interest)}` : 'cap —'}<small> · domestic {domInt ? pct(domInt.headline_rate) : '?'}</small></dd></div>
            </dl>
            {t?.mli_note && <p className="bridge-note">{t.mli_note}</p>}
            <div className="bridge-src">{t ? <SourceLink url={t.source_url} /> : <span className="muted">No treaty data yet</span>}</div>
          </div>
          <div className="bridge">
            <div className="bridge-head"><span className="bridge-hub">{nameOf(d, 'SC')}</span><span className="muted">via {hubName}</span></div>
            <p className="bridge-note">Set up in {hubName} first, then moved to Seychelles: the {hubName} treaty is the one that applies.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
