import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, KeyRound, Laptop, LogOut, Mail, Palette, Save, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { THEMES, applyTheme } from '../lib/theme';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ErrorBox, Loader, fmtDate } from '../components/ui';
import PasswordField, { passwordOk } from '../components/PasswordField';
import { timeAgo } from '../components/notifications';

const ROLE_LABEL = { super_admin: 'Platform admin', company_admin: 'Company admin', instructor: 'Instructor', employee: 'Employee' };

/** Human-friendly device name from a user-agent string (display only). */
function device(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: [browser, os].filter(Boolean).join(' on '), mobile: /Android|iPhone|iPad|Mobile/.test(ua) };
}

export default function Profile() {
  // Deep link from notification emails: /profile#notifications
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div>
          <h1>Account settings</h1>
          <p>Your details, password, theme, email notifications and the devices signed in to your account.</p>
        </div>
      </div>
      <div className="profile-grid">
        <Details />
        <ChangePassword />
        <Appearance />
        <EmailPrefs />
        <Sessions />
      </div>
    </div>
  );
}

function Details() {
  const { user, applySession } = useAuth();
  const [f, setF] = useState({ name: user.name || '', jobTitle: user.jobTitle || '', department: user.department || '', phone: user.phone || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const dirty = ['name', 'jobTitle', 'department', 'phone'].some((k) => (user[k] || '') !== f[k]);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setOk(''); };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.patch('/auth/me', f);
      applySession(data);
      setOk('Saved.');
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <form className="card stack" onSubmit={save}>
      <div className="row"><UserRound size={18} /><h2 className="h-card">Personal details</h2></div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <div className="alert alert-ok" role="status">{ok}</div>}
      <div className="grid-form">
        <div className="field"><label htmlFor="p-name">Full name</label><input id="p-name" className="input" required minLength={2} maxLength={120} value={f.name} onChange={set('name')} autoComplete="name" /></div>
        <div className="field"><label htmlFor="p-phone">Phone</label><input id="p-phone" className="input" maxLength={40} value={f.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" placeholder="+971 50 123 4567" /></div>
        <div className="field"><label htmlFor="p-job">Job title</label><input id="p-job" className="input" maxLength={120} value={f.jobTitle} onChange={set('jobTitle')} autoComplete="organization-title" /></div>
        <div className="field"><label htmlFor="p-dep">Department</label><input id="p-dep" className="input" maxLength={120} value={f.department} onChange={set('department')} /></div>
      </div>
      <dl className="meta-strip">
        <div><dt>Email (sign-in)</dt><dd style={{ overflowWrap: 'anywhere' }}>{user.email}</dd></div>
        <div><dt>Role</dt><dd>{ROLE_LABEL[user.role]}</dd></div>
        {user.lastLoginAt && <div><dt>Last sign-in</dt><dd>{fmtDate(user.lastLoginAt)}</dd></div>}
      </dl>
      <p className="small muted">Your email and role are managed by {user.role === 'employee' ? 'your company admin' : 'the platform admin'}.</p>
      <div className="row"><span className="spacer" /><button className="btn btn-primary" disabled={busy || !dirty || f.name.trim().length < 2}><Save size={15} /> {busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  );
}

function ChangePassword() {
  const { applySession } = useAuth();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return setErr('The two new passwords don’t match.');
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: cur, newPassword: pw });
      applySession(data);
      setCur(''); setPw(''); setPw2('');
      setOk('Password changed. You’ve been signed out everywhere else.');
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="row"><KeyRound size={18} /><h2 className="h-card">Change password</h2></div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <div className="alert alert-ok" role="status">{ok}</div>}
      <PasswordField id="cp-cur" label="Current password" autoComplete="current-password" value={cur} onChange={setCur} />
      <PasswordField id="cp-new" label="New password" value={pw} onChange={setPw} showRules={pw.length > 0} />
      <PasswordField id="cp-new2" label="Repeat new password" value={pw2} onChange={setPw2} />
      <p className="small muted">Changing your password signs out all your other devices.</p>
      <div className="row"><span className="spacer" /><button className="btn btn-primary" disabled={busy || !cur || !passwordOk(pw) || !pw2}>{busy ? 'Changing…' : 'Change password'}</button></div>
    </form>
  );
}

function Sessions() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => api.get('/auth/sessions').then(({ data }) => setList(data.sessions)).catch((e) => setErr(errorMessage(e))), []);
  useEffect(() => { load(); }, [load]);

  const revoke = async (id) => {
    setBusy(id);
    try { await api.delete(`/auth/sessions/${id}`); await load(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(''); }
  };
  const revokeOthers = async () => {
    setBusy('others');
    try { await api.post('/auth/sessions/revoke-others'); await load(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(''); }
  };
  const others = (list || []).filter((s) => !s.current).length;

  return (
    <section className="card stack profile-wide">
      <div className="row">
        <ShieldCheck size={18} /><h2 className="h-card">Where you’re signed in</h2>
        <span className="spacer" />
        {others > 0 && <button className="btn btn-sm btn-danger" disabled={Boolean(busy)} onClick={revokeOthers}><LogOut size={14} /> Sign out other devices</button>}
      </div>
      <p className="small muted">Don’t recognise a device? Sign it out and change your password.</p>
      <ErrorBox>{err}</ErrorBox>
      {!list ? <Loader rows={2} /> : (
        <ul className="session-list">
          {list.map((s) => {
            const d = device(s.userAgent);
            const Icon = d.mobile ? Smartphone : Laptop;
            return (
              <li key={s.id}>
                <span className="session-icon"><Icon size={18} /></span>
                <div className="grow">
                  <div><strong>{d.label}</strong> {s.current && <span className="chip chip-ok">This device</span>} {s.remembered && <span className="chip">Remembered</span>}</div>
                  <div className="small muted">Signed in {fmtDate(s.signedInAt)} · active {timeAgo(s.lastActiveAt)}{s.ip ? ` · ${s.ip}` : ''}</div>
                </div>
                {!s.current && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => revoke(s.id)}>{busy === s.id ? '…' : 'Sign out'}</button>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Appearance() {
  const { user, applySession } = useAuth();
  const [theme, setTheme] = useState(user.preferences?.theme || 'default');
  const [err, setErr] = useState('');

  const pick = async (id) => {
    const prev = theme;
    setTheme(id);
    applyTheme(id); // instant preview; saved to the account so it follows you to other devices
    setErr('');
    try {
      const { data } = await api.patch('/auth/me/preferences', { theme: id });
      applySession(data);
    } catch (e) {
      setTheme(prev);
      applyTheme(prev);
      setErr(errorMessage(e));
    }
  };

  return (
    <section className="card stack">
      <div className="row"><Palette size={18} /><h2 className="h-card">Appearance</h2></div>
      <ErrorBox>{err}</ErrorBox>
      <div className="theme-grid" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={theme === t.id} className={`theme-opt ${theme === t.id ? 'on' : ''}`} onClick={() => pick(t.id)}>
            <span className={`theme-swatch sw-${t.id}`} aria-hidden><i /><i /><i /></span>
            <span className="theme-name">{t.label} {theme === t.id && <Check size={14} />}</span>
            <span className="small muted">{t.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

const EMAIL_CATS = {
  employee: [['grades', 'Grades & feedback', 'When work is graded or returned for rework'], ['courses', 'Courses', 'When you’re assigned a new course'], ['support', 'Support replies', 'When someone answers your question']],
  instructor: [['reviews', 'New work to review', 'New submissions and AI drafts ready'], ['support', 'Employee questions', 'New questions and replies'], ['courses', 'Course assignments', 'When you’re added to a course']],
  company_admin: [['team', 'Team updates', 'Completed courses, shared progress reports, seats'], ['courses', 'New courses', 'When a new course becomes available'], ['support', 'Support replies', 'When our team answers you']],
  super_admin: [['support', 'Support requests', 'New platform tickets and replies'], ['reviews', 'Grading', 'Submissions waiting for review'], ['team', 'Customer updates', 'Seat limits and completions']],
};

function EmailPrefs() {
  const { user, applySession } = useAuth();
  const p = user.preferences?.email || {};
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);
  const cats = EMAIL_CATS[user.role] || [];
  const on = p.enabled !== false;

  const save = async (patch) => {
    setErr('');
    setSaved(false);
    try {
      const { data } = await api.patch('/auth/me/preferences', { email: patch });
      applySession(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) { setErr(errorMessage(e)); }
  };

  return (
    <section className="card stack" id="notifications">
      <div className="row"><Mail size={18} /><h2 className="h-card">Email notifications</h2><span className="spacer" />{saved && <span className="small" style={{ color: 'var(--ok)' }}><Check size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Saved</span>}</div>
      <p className="small muted">You always see notifications under the <Bell size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> bell. Choose which ones also come to <strong>{user.email}</strong>.</p>
      <ErrorBox>{err}</ErrorBox>
      <label className="switch-row">
        <span><strong>Send me emails</strong><span className="small muted">Turn off to get in-app notifications only</span></span>
        <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => save({ enabled: e.target.checked })} />
      </label>
      {cats.map(([k, label, hint]) => (
        <label key={k} className={`switch-row ${on ? '' : 'disabled'}`}>
          <span><strong>{label}</strong><span className="small muted">{hint}</span></span>
          <input type="checkbox" role="switch" className="switch" disabled={!on} checked={p[k] !== false} onChange={(e) => save({ [k]: e.target.checked })} />
        </label>
      ))}
    </section>
  );
}
