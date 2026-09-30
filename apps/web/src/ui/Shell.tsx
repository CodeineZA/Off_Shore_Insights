// App shell: a sidebar that separates the two uses of the dashboard. Each page starts
// empty; tiles are added one at a time as their data, axes and legend are agreed.
import { useEffect, useState, type ReactNode } from 'react';
import type { Dashboard } from '../data/types';
import { fmtDate } from '../data/insights';

type PageId = 'compare' | 'eligibility';
interface PageDef { id: PageId; label: string; title: string; lead: string; icon: ReactNode }

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const PAGES: PageDef[] = [
  { id: 'compare', label: 'Global comparison', title: 'Global comparison',
    lead: 'One statistic, compared across countries.',
    icon: <Icon d="M3 17h14M5 17V9M9 17V4M13 17v-6M17 17V7" /> },
  { id: 'eligibility', label: 'Country eligibility', title: 'Country eligibility',
    lead: 'One country: which Mauritius and Seychelles structures it can benefit from — trusts, companies, real estate, investments, bank accounts.',
    icon: <Icon d="M10 2.5l6 2.5v4.5c0 3.8-2.6 6.6-6 8-3.4-1.4-6-4.2-6-8V5l6-2.5zM7 10l2 2 4-4" /> },
];

const pageFromHash = (): PageId => (location.hash.replace(/^#\/?/, '') === 'eligibility' ? 'eligibility' : 'compare');

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
        <section className="empty-page">
          <div className="empty-title">No tiles yet</div>
          <div className="empty-text">Tiles are added here one at a time, once the data, axes and legend for each are agreed.</div>
        </section>
        <footer className="foot main-foot">
          <span>Indicative only, not tax advice.</span>
          <span>Data as of {fmtDate(data.generated_at)}</span>
        </footer>
      </main>
    </div>
  );
}
