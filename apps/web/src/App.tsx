import { useCallback, useEffect, useState } from 'react';
import { AuthExpired, fetchDashboard, loadSession, logout, type Session } from './api';
import type { Dashboard as Data } from './data/types';
import Dashboard from './ui/Dashboard';
import Login from './ui/Login';

type State = { kind: 'login'; notice?: string } | { kind: 'loading'; session: Session } | { kind: 'ready'; session: Session; data: Data } | { kind: 'error'; session: Session; message: string };

export default function App() {
  const [st, setSt] = useState<State>(() => { const s = loadSession(); return s ? { kind: 'loading', session: s } : { kind: 'login' }; });

  const load = useCallback(async (session: Session) => {
    setSt({ kind: 'loading', session });
    try {
      const { data, session: fresh } = await fetchDashboard(session);
      if (!data.me) { await logout(fresh); setSt({ kind: 'login', notice: 'This account has no access to Off_Shore_Insights.' }); return; }
      setSt({ kind: 'ready', session: fresh, data });
    } catch (e) {
      if (e instanceof AuthExpired) { await logout(null); setSt({ kind: 'login', notice: 'Your session ended. Please sign in again.' }); return; }
      setSt({ kind: 'error', session, message: 'Could not load the dashboard. The server may be restarting.' });
    }
  }, []);

  useEffect(() => {
    // Dev only (stripped from builds): ?fixture renders a local payload without signing in.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('fixture')) {
      void fetch('/__fixture').then((r) => r.json()).then((data: Data) =>
        setSt({ kind: 'ready', session: { access_token: '', refresh_token: '', expires_at: 0, email: '' }, data }));
      return;
    }
    if (st.kind === 'loading') void load(st.session);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (st.kind === 'login') return <Login notice={st.notice} onLogin={(s) => void load(s)} />;
  if (st.kind === 'ready') return <Dashboard data={st.data} onSignOut={() => { void logout(st.session); setSt({ kind: 'login' }); }} />;
  return (
    <div className="page">
      <div className="wrap">
        <div className="kicker">Off_Shore_Insights · Dashboard</div>
        {st.kind === 'loading' ? (
          <div className="grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="tile" style={{ opacity: 0.5, animation: `fadeUp .6s ${i * 80}ms both` }} />)}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
            <p className="lead">{st.message}</p>
            <button className="pill" onClick={() => void load(st.session)}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
