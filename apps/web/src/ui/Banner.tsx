// The news-style banner at the deepest level you drill to: the treaty with each hub (status and date), the tax year
// beside when the data was last checked, and the red/green lists. Light gold, like a front-page item.
import type { Dashboard } from '../data/types';
import { bannerFacts } from '../data/banner';
import { HUB_PAINT } from '../data/mapdata';
import { SourceLink } from '../tiles/common';

export default function Banner({ d, code, years }: { d: Dashboard; code: string; years: number[] }) {
  const f = bannerFacts(d, code, years);
  if (!f) return null;
  return (
    <section className="banner" aria-label={`${f.name}: brief`}>
      <div className="banner-kicker">{f.isRegion ? `Region of ${f.countryName} · ` : ''}{f.kicker}</div>
      <h2 className="banner-head">{f.headline}</h2>
      <p className="banner-dek">{f.standfirst}</p>
      <div className="banner-treaties">
        {f.treaties.map((t) => (
          <div key={t.hub} className={'banner-treaty ' + t.status}>
            <span className="banner-dot" style={{ background: HUB_PAINT[t.hub] }} aria-hidden="true" />
            <div>
              <b>Treaty with {t.hubName}</b>
              <span>{t.text}</span>
              {t.status !== 'unknown' && <small><SourceLink url={t.sourceUrl} /></small>}
            </div>
          </div>
        ))}
      </div>
      <div className="banner-gates" aria-label="Lists">
        {f.gates.map((g) => (
          <span key={g.label} className={'banner-gate ' + g.status}><i />{g.label}: {g.detail}</span>
        ))}
      </div>
    </section>
  );
}
