// Above the map: pick a country from the list (Belgium is a speck on a world map), choose the layers, and read the legend.
import type { Dashboard } from '../data/types';
import { HUB_PAINT, MONEY, type Focus, type MoneyKey, zoomTo } from '../data/mapdata';

const swatch = (bg: string, extra: React.CSSProperties = {}) => <i style={{ background: bg, ...extra }} />;

export default function MapControls({ d, focus, onFocus, treaty, setTreaty, money, setMoney, metrics, setMetrics, year }: {
  d: Dashboard; focus: Focus; onFocus: (f: Focus) => void; treaty: boolean; setTreaty: (v: boolean) => void; money: boolean; setMoney: (v: boolean) => void;
  metrics: MoneyKey[]; setMetrics: (m: MoneyKey[]) => void; year: number;
}) {
  const countries = d.jurisdictions.filter((j) => j.kind === 'country' && !j.is_offshore_hub)
    .sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99) || a.name.localeCompare(b.name));
  const toggle = (k: MoneyKey) => setMetrics(metrics.includes(k) ? metrics.filter((x) => x !== k) : [...metrics, k]);
  const usable = MONEY.filter((m) => d.wealth.some((w) => (w as unknown as Record<string, unknown>)[m.key] != null));
  return (
    <section className="filters map-controls" aria-label="Map">
      <div className="filter-row">
        <span className="filter-k">Country</span>
        <div className="chips">
          {countries.map((c) => (
            <button key={c.code} className={'chip' + (focus.country === c.code ? ' on' : '')} aria-pressed={focus.country === c.code} onClick={() => onFocus(zoomTo(d, focus, c.code))}>{c.name}</button>
          ))}
        </div>
      </div>
      <div className="filter-row">
        <span className="filter-k">Layers</span>
        <div className="chips">
          <button className={'chip' + (treaty ? ' on' : '')} aria-pressed={treaty} onClick={() => setTreaty(!treaty)}>Treaties</button>
          <button className={'chip' + (money ? ' on' : '')} aria-pressed={money} onClick={() => setMoney(!money)}>Money</button>
        </div>
      </div>
      {treaty && (
        <div className="legend map-legend" aria-label="Treaty colours">
          <span>{swatch(HUB_PAINT.MU)}Treaty with Mauritius in force</span>
          <span>{swatch(HUB_PAINT.SC)}Treaty with Seychelles in force</span>
          <span>{swatch(`repeating-linear-gradient(45deg, ${HUB_PAINT.MU} 0 3px, ${HUB_PAINT.SC} 3px 6px)`, { borderRadius: 2 })}Both</span>
          <span>{swatch('transparent', { border: `2px solid ${HUB_PAINT.MU}`, borderRadius: 2 })}{swatch('transparent', { border: `2px solid ${HUB_PAINT.SC}`, borderRadius: 2 })}Outline: signed or negotiating</span>
          <span>{swatch('#2b2927', { borderRadius: 2, border: '1px solid rgba(255,236,210,.2)' })}No treaty</span>
          <span>{swatch('repeating-linear-gradient(45deg, #22211f 0 3px, rgba(255,255,255,.18) 3px 5px)', { borderRadius: 2 })}Not known yet</span>
        </div>
      )}
      {money && (
        <>
          <div className="filter-row">
            <span className="filter-k">Money</span>
            <div className="chips">
              {MONEY.map((m) => (
                <button key={m.key} className={'chip metric' + (metrics.includes(m.key) ? ' on' : '') + (usable.includes(m) ? '' : ' nodata')} aria-pressed={metrics.includes(m.key)} onClick={() => toggle(m.key)}
                  title={usable.includes(m) ? m.what : `${m.what}: no figures loaded yet`}>
                  <i style={{ background: m.color }} />{m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="legend map-legend" aria-label="Money bars">
            <span><em>One bar per measure at each capital, tax year {year} (newest figure up to it). Each measure is scaled to its own highest country, so you compare countries within a colour.</em></span>
            <span>{swatch('rgba(236,230,220,.5)', { borderRadius: 2 })}Paler bar: an earlier year's figure</span>
            <span>{swatch('transparent', { border: '1px dashed rgba(236,230,220,.7)', borderRadius: 2 })}Dashed: no figure published</span>
          </div>
        </>
      )}
    </section>
  );
}
