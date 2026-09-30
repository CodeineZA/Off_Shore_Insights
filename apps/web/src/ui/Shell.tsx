// App shell: a sidebar that separates the two modes (PLAN.md §9).
import { useEffect, useState, type ReactNode } from 'react';
import type { Dashboard } from '../data/types';
import { fmtDate } from '../data/insights';
import Global from '../pages/Global';
import Country from '../pages/Country';

type PageId = 'global' | 'country';
interface PageDef { id: PageId; label: string; title: string; lead: string; icon: ReactNode }

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const PAGES: PageDef[] = [
  { id: 'global', label: 'Global', title: 'Global comparison', lead: 'Which countries to target first, and why.',
    icon: <Icon d="M3 17h14M5 17V9M9 17V4M13 17v-6M17 17V7" /> },
  { id: 'country', label: 'Country vs hubs', title: 'Country vs Mauritius & Seychelles', lead: 'One country against both hubs: the case, the gaps and the caveats.',
    icon: <Icon d="M4 10h4M12 10h4M10 4v12M4 6v8M16 6v8" /> },
];

const pageFromHash = (): PageId => (location.hash.replace(/^#\/?/, '') === 'country' ? 'country' : 'global');

export default function Shell({ data, onSignOut }: { data: Dashboard; onSignOut: () => void }) {
  const [page, setPage] = useState<PageId>(pageFromHash);
  useEffect(() => {
    const on = () => setPage(pageFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const p = PAGES.find((x) => x.id === page)!;
  const name = data.me?.display_name || data.me?.username || '';

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Off_Shore_Insights</div>
        <nav className="nav" aria-label="Dashboards">
          {PAGES.map((x) => (
            <a key={x.id} href={`#/${x.id}`} className={'nav-item' + (x.id === page ? ' on' : '')} aria-current={x.id === page ? 'page' : undefined}>
              {x.icon}<span>{x.label}</span>
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <div className="who">{name}</div>
          <button className="linkish" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>

      <main className="main">
        <header className="main-head">
          <h1 className="h1">{p.title}</h1>
          <p className="lead">{p.lead}</p>
        </header>
        {page === 'global' ? <Global d={data} /> : <Country d={data} />}
        <footer className="foot main-foot">
          <span>Indicative only, not tax advice.</span>
          <span>Data as of {fmtDate(data.generated_at)}</span>
        </footer>
      </main>
    </div>
  );
}
