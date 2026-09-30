// C7 · Country brief: the "why" and the caveats: gate badges for both hubs, the notes
// (warnings first), and which of this country's figures still need verifying.
import type { Dashboard } from '../data/types';
import { GATES, gateCells } from '../data/model';
import { countryOf, nameOf, shortLabel } from '../data/insights';
import { Card, GATE_COLOR, SourceLink } from './common';

const TOPIC_ORDER = ['warning', 'anti_avoidance', 'residency', 'crs', 'sales_angle'];

export default function C7CountryBrief({ d, code }: { d: Dashboard; code: string }) {
  const country = countryOf(d, code);   // a region shows its own notes and its country's
  const notes = d.notes.filter((n) => n.jurisdiction_code === code || n.jurisdiction_code === country)
    .sort((a, b) => (TOPIC_ORDER.indexOf(a.topic) + 99) % 99 - (TOPIC_ORDER.indexOf(b.topic) + 99) % 99 || a.sort_order - b.sort_order);
  const toCheck = d.rates.filter((r) => r.jurisdiction_code === code && r.needs_verification && !r.inherited);
  return (
    <Card id="c7" title="Country brief" purpose={`What to know before pitching to ${nameOf(d, code)}`}>
      <div className="brief">
        <div className="brief-gates">
          {['MU', 'SC'].map((hub) => (
            <div key={hub} className="brief-hub">
              <div className="brief-k">Via {nameOf(d, hub)}</div>
              <div className="brief-badges">
                {gateCells(d, code, hub).map((g) => (
                  <span key={g.key} className={'gate-pill ' + g.status + (g.check ? ' check' : '')} style={{ ['--gc' as string]: GATE_COLOR[g.status] }} title={g.note ?? ''}>
                    {GATES.find((x) => x.key === g.key)!.label}: {g.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="brief-notes">
          {notes.length ? notes.map((n) => (
            <div key={n.id} className={'brief-note ' + n.topic}>
              <span className="tag">{n.topic.replace(/_/g, ' ')}</span>
              <p>{n.text}</p>
              {n.source_url && <SourceLink url={n.source_url} />}
            </div>
          )) : <p className="muted">No notes for {nameOf(d, code)} yet.</p>}
        </div>
        {toCheck.length > 0 && (
          <div className="brief-check">To verify: {toCheck.map((r) => shortLabel(d.tax_types.find((t) => t.code === r.tax_type_code)!)).join(', ')}.</div>
        )}
      </div>
    </Card>
  );
}
