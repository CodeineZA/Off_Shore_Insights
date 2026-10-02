// The country brief: the news-style item for the entity you drilled to. A light gold front-page block that states the
// treaty with each hub (status and date), the tax year beside when the data was last checked, and the red/green lists,
// then what to know before pitching (warnings first) and which of this entity's figures still need verifying.
import type { Dashboard } from '../data/types';
import { bannerFacts, briefNotes } from '../data/banner';
import { HUB_PAINT } from '../data/mapdata';
import SourceLink from './SourceLink';

export default function CountryBrief({ d, code, years }: { d: Dashboard; code: string; years: number[] }) {
  const f = bannerFacts(d, code, years);
  if (!f) return null;
  const { notes, toCheck } = briefNotes(d, code);
  return (
    <section className="banner" aria-label={`${f.name}: country brief`}>
      <div className="banner-kicker">Country brief · {f.isRegion ? `Region of ${f.countryName} · ` : ''}{f.kicker}</div>
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
      <div className="banner-notes" aria-label="What to know">
        <div className="banner-notes-k">What to know before pitching to {f.name}</div>
        {notes.length ? notes.map((n) => (
          <div key={n.id} className={'banner-note ' + n.topic}>
            <span className="banner-tag">{n.topic.replace(/_/g, ' ')}</span>
            <p>{n.text}</p>
            {n.source_url && <small><SourceLink url={n.source_url} /></small>}
          </div>
        )) : <p className="banner-none">No notes for {f.name} yet.</p>}
        {toCheck.length > 0 && <p className="banner-check">To verify: {toCheck.join(', ')}.</p>}
      </div>
    </section>
  );
}
