// User management: only the administrator (Hentus) sees this page, and the gateway refuses
// everyone else. View the list, read one user, edit any field (password shown in plain text,
// by Hentus's choice), disable, delete. All calls go through the gateway (/api/admin/users).
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminError, AuthExpired, admin, type AdminUser, type UserFields } from '../api';
import { fmtDate } from '../data/insights';
import './users.css';

type Mode = { kind: 'none' } | { kind: 'view'; id: string } | { kind: 'edit'; id: string } | { kind: 'create' } | { kind: 'delete'; id: string };
type Draft = { username: string; display_name: string; email: string; cell: string; password: string };

const newPassword = () => {
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(b, (n) => a[n % a.length]).join('');
};
const draftOf = (u?: AdminUser): Draft => ({ username: u?.username ?? '', display_name: u?.display_name ?? '',
  email: u?.email ?? '', cell: u?.cell ?? '', password: u?.password ?? (u ? '' : newPassword()) });
const when = (iso: string | null) => (iso ? fmtDate(iso) : 'never');

export default function Users({ me, onExpired }: { me: string; onExpired: () => void }) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'none' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const fail = useCallback((e: unknown) => {
    if (e instanceof AuthExpired) { onExpired(); return; }
    setError(e instanceof AdminError ? e.message : 'The server could not be reached. Try again.');
  }, [onExpired]);
  const load = useCallback(async () => {
    try { setUsers(await admin.list()); } catch (e) { fail(e); }
  }, [fail]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, next: Mode, message: string) => {
    setBusy(true); setError(''); setDone('');
    try { await fn(); await load(); setMode(next); setDone(message); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const open = (m: Mode) => { setMode(m); setError(''); setDone(''); };

  const cur = 'id' in mode ? users?.find((u) => u.user_id === mode.id) : undefined;
  const isMe = (u: AdminUser) => u.username === me;

  return (
    <div className="users">
      <section className="card users-list" aria-label="Users">
        <div className="card-head">
          <div><h2 className="card-title">Users</h2>
            <p className="users-sub">{users ? `${users.length} with access · ${users.filter((u) => u.disabled).length} disabled` : 'Loading…'}</p></div>
          <button className="pill" onClick={() => open({ kind: 'create' })} disabled={busy}>+ New user</button>
        </div>
        {users && (
          <div className="users-scroll">
            <table className="users-table">
              <thead><tr><th>Username</th><th>Email</th><th>Cell</th><th>Password</th><th>Status</th><th>Last sign-in</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.user_id} className={('id' in mode && mode.id === u.user_id ? 'on' : '') + (u.disabled ? ' off' : '')}>
                    <td><button className="users-name" onClick={() => open({ kind: 'view', id: u.user_id })}>
                      <b>{u.username}</b>{isMe(u) && <em> (you)</em>}{u.display_name && <small>{u.display_name}</small>}</button></td>
                    <td>{u.email || <span className="muted">—</span>}</td>
                    <td>{u.cell || <span className="muted">—</span>}</td>
                    <td>{u.password ? <code>{u.password}</code> : <span className="muted">not set here</span>}</td>
                    <td><span className={'users-status' + (u.disabled ? ' off' : '')}>{u.disabled ? 'Disabled' : 'Active'}</span></td>
                    <td className="muted">{when(u.last_sign_in_at)}</td>
                    <td className="users-actions">
                      <button className="linkish" onClick={() => open({ kind: 'view', id: u.user_id })}>View</button>
                      <button className="linkish" onClick={() => open({ kind: 'edit', id: u.user_id })}>Edit</button>
                      {!isMe(u) && <button className="linkish danger" onClick={() => open({ kind: 'delete', id: u.user_id })}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!('id' in mode) && mode.kind !== 'create' && (error || done) && <p className={error ? 'error' : 'users-done'} role="status">{error || done}</p>}
      </section>

      {mode.kind === 'create' && (
        <UserForm key="create" title="New user" draft={draftOf()} busy={busy} error={error} create
          onCancel={() => open({ kind: 'none' })}
          onSave={(f) => act(() => admin.create(f), { kind: 'none' }, `Created ${f.username}. They can sign in now.`)} />
      )}

      {cur && mode.kind === 'view' && (
        <section className="card users-detail" aria-label={`User ${cur.username}`}>
          <div className="card-head"><h2 className="card-title">{cur.username}{isMe(cur) ? ' (you)' : ''}</h2>
            <button className="linkish" onClick={() => open({ kind: 'none' })}>Close</button></div>
          <dl className="users-facts">
            <div><dt>Name</dt><dd>{cur.display_name || '—'}</dd></div>
            <div><dt>Email</dt><dd>{cur.email || '—'}</dd></div>
            <div><dt>Cell</dt><dd>{cur.cell || '—'}</dd></div>
            <div><dt>Password</dt><dd>{cur.password ? <code>{cur.password}</code> : <span className="muted">Not set here. Edit to set one.</span>}</dd></div>
            <div><dt>Signs in with</dt><dd>{cur.username}{cur.email ? ` or ${cur.email}` : ''}{cur.auth_email !== cur.email ? ` (login ${cur.auth_email})` : ''}</dd></div>
            <div><dt>Status</dt><dd>{cur.disabled ? 'Disabled: cannot sign in' : 'Active'}{cur.is_admin ? ' · administrator' : ''}</dd></div>
            <div><dt>Login</dt><dd>{cur.created_here ? 'Created here' : 'Linked: an existing login shared with other apps (e.g. Neil\'s Way)'}</dd></div>
            <div><dt>Created</dt><dd>{fmtDate(cur.created_at)}</dd></div>
            <div><dt>Last sign-in</dt><dd>{when(cur.last_sign_in_at)}</dd></div>
            {cur.password_set_at && <div><dt>Password set</dt><dd>{fmtDate(cur.password_set_at)}</dd></div>}
          </dl>
          <div className="users-buttons">
            <button className="pill" onClick={() => open({ kind: 'edit', id: cur.user_id })}>Edit</button>
            {!isMe(cur) && <button className="pill quiet" disabled={busy}
              onClick={() => act(() => admin.update(cur.user_id, { disabled: !cur.disabled }), mode, cur.disabled ? `${cur.username} can sign in again.` : `${cur.username} can no longer sign in.`)}>
              {cur.disabled ? 'Enable' : 'Disable'}</button>}
            {!isMe(cur) && <button className="pill danger" onClick={() => open({ kind: 'delete', id: cur.user_id })}>Delete</button>}
          </div>
          {(error || done) && <p className={error ? 'error' : 'users-done'} role="status">{error || done}</p>}
        </section>
      )}

      {cur && mode.kind === 'edit' && (
        <UserForm key={cur.user_id} title={`Edit ${cur.username}`} draft={draftOf(cur)} busy={busy} error={error}
          note={cur.created_here ? undefined : `Linked login: signs in with ${cur.auth_email}; the email here is the contact email. A new password changes it for this login everywhere it is used (e.g. Neil's Way).`}
          onCancel={() => open({ kind: 'view', id: cur.user_id })}
          onSave={(f) => act(() => admin.update(cur.user_id, f), { kind: 'view', id: cur.user_id }, 'Saved.')} />
      )}

      {cur && mode.kind === 'delete' && (
        <section className="card users-detail users-delete" aria-label={`Delete ${cur.username}`}>
          <h2 className="card-title">Delete {cur.username}?</h2>
          <p className="lead">{cur.created_here
            ? 'This deletes the user and their login. It cannot be undone.'
            : 'This removes their access to Off_Shore_Insights. Their login stays for other apps (e.g. Neil\'s Way).'}</p>
          <div className="users-buttons">
            <button className="pill danger solid" disabled={busy}
              onClick={() => act(() => admin.remove(cur.user_id), { kind: 'none' }, `Deleted ${cur.username}.`)}>{busy ? 'Deleting…' : 'Delete'}</button>
            <button className="pill quiet" onClick={() => open({ kind: 'view', id: cur.user_id })}>Cancel</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      )}
    </div>
  );
}

function UserForm({ title, draft, create, busy, error, note, onSave, onCancel }: {
  title: string; draft: Draft; create?: boolean; busy: boolean; error: string; note?: string;
  onSave: (f: UserFields) => void; onCancel: () => void;
}) {
  const [d, setD] = useState(draft);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setD({ ...d, [k]: k === 'username' ? e.target.value.toLowerCase() : e.target.value });
  // Send only what changed (a blank password on edit means "leave it").
  const changes = (): UserFields => {
    if (create) return { username: d.username.trim(), display_name: d.display_name, email: d.email, cell: d.cell, password: d.password };
    const out: UserFields = {};
    for (const k of ['username', 'display_name', 'email', 'cell'] as const) if (d[k].trim() !== draft[k]) out[k] = d[k].trim();
    if (d.password && d.password !== draft.password) out.password = d.password;
    return out;
  };
  const submit = (e: FormEvent) => { e.preventDefault(); const f = changes(); if (Object.keys(f).length) onSave(f); else onCancel(); };
  return (
    <form className="card users-detail users-form" onSubmit={submit} noValidate aria-label={title}>
      <div className="card-head"><h2 className="card-title">{title}</h2>
        <button type="button" className="linkish" onClick={onCancel}>Cancel</button></div>
      {note && <p className="users-note">{note}</p>}
      <div className="users-fields">
        <div className="field"><label htmlFor="uf-u">Username</label>
          <input id="uf-u" value={d.username} onChange={set('username')} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" /></div>
        <div className="field"><label htmlFor="uf-n">Name <span className="opt">optional</span></label>
          <input id="uf-n" value={d.display_name} onChange={set('display_name')} autoComplete="off" /></div>
        <div className="field"><label htmlFor="uf-e">Email <span className="opt">optional, preferred</span></label>
          <input id="uf-e" type="email" value={d.email} onChange={set('email')} autoCapitalize="none" spellCheck={false} autoComplete="off" /></div>
        <div className="field"><label htmlFor="uf-c">Cell <span className="opt">optional, preferred</span></label>
          <input id="uf-c" type="tel" value={d.cell} onChange={set('cell')} autoComplete="off" placeholder="+27 82 123 4567" /></div>
        <div className="field users-pw"><label htmlFor="uf-p">Password</label>
          <div className="users-pw-row">
            <input id="uf-p" type="text" value={d.password} onChange={set('password')} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off"
              placeholder={create ? '' : 'Not set here: type one to set it'} />
            <button type="button" className="pill quiet" onClick={() => setD({ ...d, password: newPassword() })}>Generate</button>
          </div></div>
      </div>
      <p className="users-hint">Username: 2–32 characters, a–z 0–9 . _ -. Password: 8 or more characters. They can sign in with the username or the email.</p>
      <div className="users-buttons">
        <button className="pill solid" type="submit" disabled={busy || !d.username.trim() || (create && d.password.length < 8)}>{busy ? 'Saving…' : create ? 'Create user' : 'Save'}</button>
        <button className="pill quiet" type="button" onClick={onCancel}>Cancel</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
