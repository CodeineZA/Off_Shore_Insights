import { useEffect, useState, type FormEvent } from 'react';
import { LoginError, login, type Session } from '../api';
import { LAND_DOTS } from '../map/landDots';
import { useTween } from './tween';

export default function Login({ onLogin, notice }: { onLogin: (s: Session) => void; notice?: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(notice ?? '');
  const [wait, setWait] = useState(0);
  const T = useTween({ p: 1 }, { dur: 1800, delay: 200 }, 0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || wait > 0 || !username.trim() || !password) return;
    setBusy(true); setError('');
    try {
      onLogin(await login(username.trim().toLowerCase(), password));
    } catch (err) {
      const k = err instanceof LoginError ? err : new LoginError('unavailable');
      if (k.kind === 'invalid') setError('Username or password is not right.');
      else if (k.kind === 'rate') { setWait(k.retryAfterS); setError('Too many attempts.'); }
      else setError('The sign-in service is not reachable. Try again in a moment.');
      setPassword('');
    } finally { setBusy(false); }
  }

  return (
    <div className="login">
      <svg className="login-map" viewBox="0 0 720 276" aria-hidden="true">
        <defs><clipPath id="lmc"><rect x="0" y="0" height="276" width={(T.p || 0) * 730} /></clipPath>
          <radialGradient id="lmg"><stop offset="0" stopColor="#ffd9a0" stopOpacity=".9" /><stop offset=".35" stopColor="#d8a65f" stopOpacity=".35" /><stop offset="1" stopColor="#d8a65f" stopOpacity="0" /></radialGradient></defs>
        <path d={LAND_DOTS} fill="rgba(216,190,150,.30)" clipPath="url(#lmc)" />
        {[[57.55, -20.25], [55.45, -4.68]].map(([lon, lat]) => { const x = (lon + 180) * 2, y = (80 - lat) * 2; return (
          <g key={lon} style={{ opacity: (T.p || 0) > x / 720 ? 1 : 0, transition: 'opacity .4s' }}>
            <circle cx={x} cy={y} r="30" fill="url(#lmg)" /><circle cx={x} cy={y} r="3.5" fill="#fff0d6" />
            <circle cx={x} cy={y} r="4" fill="none" stroke="#ffd9a0" strokeWidth="1" style={{ animation: 'pinPulse 2.4s ease-out infinite' }} />
          </g>); })}
      </svg>

      <form className="login-card" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="kicker">Off_Shore_Insights</div>
          <h1 className="h1" style={{ fontSize: 26 }}>Sign in</h1>
          <p className="lead">Mauritius &amp; Seychelles market insights. Accounts are created by Hentus.</p>
        </div>
        <div className="field">
          <label htmlFor="u">Username</label>
          <input id="u" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label htmlFor="p">Password</label>
          <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="error" role="alert">{error}{wait > 0 ? ` Try again in ${wait}s.` : ''}</div>
        <button className="primary" type="submit" disabled={busy || wait > 0 || !username.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="foot">Indicative only, not tax advice.</div>
      </form>
    </div>
  );
}
