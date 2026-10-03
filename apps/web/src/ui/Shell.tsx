// App shell: a sidebar with the one-country dashboard, the reports and, for the administrator, user management.
import { useEffect, useState, type ReactNode } from 'react';
import type { Dashboard } from '../data/types';
import { fmtDate } from '../data/insights';
import Country from '../pages/Country';
import Reports from '../pages/Reports';
import Users from '../pages/Users';

type PageId = 'country' | 'reports' | 'users';
interface PageDef { id: PageId; label: string; title: string; lead: string; icon: ReactNode }

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const PAGES: PageDef[] = [
  { id: 'country', label: 'Country', title: 'Country insights', lead: 'One country at a time: the treaty, the money, where the tax hurts and where Mauritius and Seychelles help.',
    icon: <Icon d="M4 10h4M12 10h4M10 4v12M4 6v8M16 6v8" /> },
  { id: 'reports', label: 'Reports', title: 'Reports', lead: 'What a million invested in 2024 would have become kept at home, against held through a Trust in Mauritius or Seychelles. Emailed as a PDF with the raw values in Excel.',
    icon: <Icon d="M5 3h7l3 3v11H5zM12 3v3h3M7.5 10h5M7.5 13h5" /> },
];
// Only the administrator (Hentus) gets this page; the gateway refuses everyone else anyway.
const USERS: PageDef = { id: 'users', label: 'User management', title: 'User management',
  lead: 'Who can sign in to Off_Shore_Insights. Only you can see this page.',
  icon: <Icon d="M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13.5 4.5a2.8 2.8 0 0 1 0 5.2M15.5 12.3c1.6.6 2.5 2.2 2.5 4.7" /> };

const pageFromHash = (): PageId => { const h = location.hash.replace(/^#\/?/, ''); return h === 'users' ? 'users' : h === 'reports' ? 'reports' : 'country'; };

export default function Shell({ data, onSignOut, onExpired }: { data: Dashboard; onSignOut: () => void; onExpired: () => void }) {
  const pages = data.me?.is_admin ? [...PAGES, USERS] : PAGES;
  const [page, setPage] = useState<PageId>(pageFromHash);
  useEffect(() => {
    const on = () => setPage(pageFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const p = pages.find((x) => x.id === page) ?? PAGES[0];
  const name = data.me?.display_name || data.me?.username || '';

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">Off_Shore_Insights</div>
        <nav className="nav" aria-label="Dashboards">
          {pages.map((x) => (
            <a key={x.id} href={`#/${x.id}`} className={'nav-item' + (x.id === p.id ? ' on' : '')} aria-current={x.id === p.id ? 'page' : undefined}>
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
        {p.id === 'users' ? <Users me={data.me!.username} onExpired={onExpired} /> : p.id === 'reports' ? <Reports d={data} onExpired={onExpired} /> : <Country d={data} />}
        <footer className="foot main-foot">
          <span>Indicative only, not tax advice.</span>
          <span>Data as of {fmtDate(data.generated_at)}</span>
        </footer>
      </main>
    </div>
  );
}
