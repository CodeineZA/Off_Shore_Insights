// "Sources": a small button that opens the sources behind whatever the page is showing now (the entity, the tax years,
// the tax focus, the map layers). Each entry links to the page the figure was taken from, or names the report file we
// hold. Dated Wayback copies say so and also link the original page. A figure with no recorded source is listed as such.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dashboard } from '../data/types';
import { fmtDate } from '../data/insights';
import type { MoneyKey } from '../data/mapdata';
import { contextLabel, countSources, KIND_LABEL, safeUrl, sourcesFor, type SourceEntry } from '../data/sources';
import type { TaxFocus } from '../data/taxbars';

const SHOWN = 3;

function Entry({ e }: { e: SourceEntry }) {
  const rest = e.supports.slice(SHOWN);
  const original = e.archived ? safeUrl(e.archived.original) : null;
  return (
    <li className="source">
      <div className="source-head">
        {e.url ? <a href={e.url} target="_blank" rel="noreferrer">{e.name} ↗</a> : <span className="source-none">{e.name}</span>}
        {KIND_LABEL[e.kind] && <span className={'source-kind ' + e.kind}>{KIND_LABEL[e.kind]}</span>}
        {e.check && <span className="source-kind check">To verify</span>}
      </div>
      {(e.shown || e.file || e.verifiedOn) && (
        <div className="source-meta">
          {e.shown && <span title={e.url ?? undefined}>{e.archived ? `Dated copy of ${e.shown}` : e.shown}</span>}
          {e.archived && <span>taken {fmtDate(e.archived.on)}{original && <> · <a href={original} target="_blank" rel="noreferrer">original page ↗</a></>}</span>}
          {e.file && <span>File held locally: <code>{e.file}</code></span>}
          {e.verifiedOn && <span>Checked {fmtDate(e.verifiedOn)}</span>}
        </div>
      )}
      <div className="source-supports">
        {e.supports.slice(0, SHOWN).join(' · ')}
        {rest.length > 0 && <details className="source-more"><summary>+{rest.length} more</summary>{rest.join(' · ')}</details>}
      </div>
    </li>
  );
}

export default function SourcesButton({ d, code, years, taxFocus, metrics, treaty, money }: {
  d: Dashboard; code: string | null; years: number[]; taxFocus: TaxFocus; metrics: MoneyKey[]; treaty: boolean; money: boolean;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const ctx = useMemo(() => ({ code, years, taxFocus, metrics, treaty, money }), [code, years, taxFocus, metrics, treaty, money]);
  const groups = useMemo(() => sourcesFor(d, ctx), [d, ctx]);
  useEffect(() => {
    if (!open) return;
    // Esc closes this panel and nothing else: the map's own Esc ("back one step") must not also fire, so claim it in the capture phase.
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', key, true); document.addEventListener('mousedown', away);
    return () => { window.removeEventListener('keydown', key, true); document.removeEventListener('mousedown', away); };
  }, [open]);
  return (
    <div className="sources" ref={box}>
      <button className={'chip sources-btn' + (open ? ' on' : '')} aria-expanded={open} aria-controls="sources-panel" onClick={() => setOpen((o) => !o)}>
        Sources<span className="sources-n">{countSources(groups)}</span>
      </button>
      {open && (
        <div id="sources-panel" className="sources-panel" role="dialog" aria-label="Sources for this view">
          <header className="sources-head">
            <div><b>Sources</b><span>{contextLabel(d, ctx)}{taxFocus ? ' · tax focus on' : ''}</span></div>
            <button className="sources-close" onClick={() => setOpen(false)} aria-label="Close sources">✕</button>
          </header>
          <p className="sources-note">Every figure on this view, grouped by page. Links open the page it was taken from. A dated copy is a saved snapshot of that page from the date shown. Reports we hold as files are named, not linked.</p>
          {groups.length === 0 && <p className="sources-note">No sources to list for this view yet.</p>}
          {groups.map((g) => (
            <section key={g.id} className="sources-group">
              <h3>{g.title}<small>{g.entries.length}</small></h3>
              <ul>{g.entries.map((e) => <Entry key={e.key} e={e} />)}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
