import { useCallback, useEffect, useState } from 'react';
import { Check, KeyRound, Laptop, LogOut, Mail, Palette, Save, ShieldCheck, Smartphone, UserRound } from 'lucide-react';
import { THEMES, applyTheme } from '../lib/theme';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../lib/i18n';
import { ErrorBox, Loader, fmtDate } from '../components/ui';
import PasswordField, { passwordOk } from '../components/PasswordField';
import { timeAgo } from '../components/notifications';
import { useT } from '../lib/i18n';

const ROLE_LABEL = { super_admin: 'Platform admin', company_admin: 'Company admin', instructor: 'Instructor', employee: 'Employee' };

/** Human-friendly device name from a user-agent string (display only). */
function device(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: [browser, os].filter(Boolean).join(' on '), mobile: /Android|iPhone|iPad|Mobile/.test(ua) };
}

export default function Profile() {
  const t = useT();
  // Deep link from notification emails: /profile#notifications
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);
  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="page-head">
        <div>
          <h1>{t('Account settings')}</h1>
          <p>{t('Your details, password, theme, language, email notifications and the devices signed in to your account.')}</p>
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
  const t = useT();
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
      setOk(t('Saved.'));
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <form className="card stack" onSubmit={save}>
      <div className="row"><UserRound size={18} /><h2 className="h-card">{t('Personal details')}</h2></div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <div className="alert alert-ok" role="status">{ok}</div>}
      <div className="grid-form">
        <div className="field"><label htmlFor="p-name">{t('Full name')}</label><input id="p-name" className="input" required minLength={2} maxLength={120} value={f.name} onChange={set('name')} autoComplete="name" /></div>
        <div className="field"><label htmlFor="p-phone">{t('Phone')}</label><input id="p-phone" className="input" maxLength={40} value={f.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" placeholder="+971 50 123 4567" /></div>
        <div className="field"><label htmlFor="p-job">{t('Job title')}</label><input id="p-job" className="input" maxLength={120} value={f.jobTitle} onChange={set('jobTitle')} autoComplete="organization-title" /></div>
        <div className="field"><label htmlFor="p-dep">{t('Department')}</label><input id="p-dep" className="input" maxLength={120} value={f.department} onChange={set('department')} /></div>
      </div>
      <dl className="meta-strip">
        <div><dt>{t('Email (sign-in)')}</dt><dd style={{ overflowWrap: 'anywhere' }}>{user.email}</dd></div>
        <div><dt>{t('Role')}</dt><dd>{t(ROLE_LABEL[user.role])}</dd></div>
        {user.lastLoginAt && <div><dt>{t('Last sign-in')}</dt><dd>{fmtDate(user.lastLoginAt)}</dd></div>}
      </dl>
      <p className="small muted">{t(user.role === 'employee' ? 'Your email and role are managed by your company admin.' : 'Your email and role are managed by the platform admin.')}</p>
      <div className="row"><span className="spacer" /><button className="btn btn-primary" disabled={busy || !dirty || f.name.trim().length < 2}><Save size={15} /> {busy ? t('Saving…') : t('Save changes')}</button></div>
    </form>
  );
}

function ChangePassword() {
  const t = useT();
  const { applySession } = useAuth();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return setErr(t('The two passwords don’t match.'));
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: cur, newPassword: pw });
      applySession(data);
      setCur(''); setPw(''); setPw2('');
      setOk(t('Password changed. You’ve been signed out everywhere else.'));
    } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="row"><KeyRound size={18} /><h2 className="h-card">{t('Change password')}</h2></div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <div className="alert alert-ok" role="status">{ok}</div>}
      <PasswordField id="cp-cur" label={t('Current password')} autoComplete="current-password" value={cur} onChange={setCur} />
      <PasswordField id="cp-new" label={t('New password')} value={pw} onChange={setPw} showRules={pw.length > 0} />
      <PasswordField id="cp-new2" label={t('Repeat new password')} value={pw2} onChange={setPw2} />
      <p className="small muted">{t('Changing your password signs out all your other devices.')}</p>
      <div className="row"><span className="spacer" /><button className="btn btn-primary" disabled={busy || !cur || !passwordOk(pw) || !pw2}>{busy ? t('Changing…') : t('Change password')}</button></div>
    </form>
  );
}

function Sessions() {
  const t = useT();
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
        <ShieldCheck size={18} /><h2 className="h-card">{t('Where you’re signed in')}</h2>
        <span className="spacer" />
        {others > 0 && <button className="btn btn-sm btn-danger" disabled={Boolean(busy)} onClick={revokeOthers}><LogOut size={14} /> {t('Sign out other devices')}</button>}
      </div>
      <p className="small muted">{t('Don’t recognise a device? Sign it out and change your password.')}</p>
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
                  <div><strong>{d.label}</strong> {s.current && <span className="chip chip-ok">{t('This device')}</span>} {s.remembered && <span className="chip">{t('Remembered')}</span>}</div>
                  <div className="small muted">{t('Signed in {date}', { date: fmtDate(s.signedInAt) })} · {t('active {x}', { x: timeAgo(s.lastActiveAt) })}{s.ip ? ` · ${s.ip}` : ''}</div>
                </div>
                {!s.current && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => revoke(s.id)}>{busy === s.id ? '…' : t('Sign out')}</button>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Appearance() {
  const t = useT();
  const { user, applySession } = useAuth();
  const [theme, setTheme] = useState(user.preferences?.theme || 'default');
  const [err, setErr] = useState('');
  const { lang, setLang } = useI18n();
  const pickLang = async (l) => {
    if (l === lang) return;
    setLang(l);
    try { const { data } = await api.patch('/auth/me/preferences', { language: l }); applySession(data); } catch (e) { setErr(errorMessage(e)); }
  };

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
      <div className="row"><Palette size={18} /><h2 className="h-card">{t('Appearance')}</h2></div>
      <ErrorBox>{err}</ErrorBox>
      <div className="theme-grid" role="radiogroup" aria-label={t('Theme')}>
        {THEMES.map((th) => (
          <button key={th.id} type="button" role="radio" aria-checked={theme === th.id} className={`theme-opt ${theme === th.id ? 'on' : ''}`} onClick={() => pick(th.id)}>
            <span className={`theme-swatch sw-${th.id}`} aria-hidden><i /><i /><i /></span>
            <span className="theme-name">{t(th.label)} {theme === th.id && <Check size={14} />}</span>
            <span className="small muted">{t(th.hint)}</span>
          </button>
        ))}
      </div>
      <div className="field" style={{ marginTop: 4 }}>
        <span className="label-like">{t('Language')}</span>
        <div className="seg" role="radiogroup" aria-label={t('Language')}>
          <button type="button" role="radio" aria-checked={lang === 'en'} className={lang === 'en' ? 'on' : ''} onClick={() => pickLang('en')} lang="en">{t('English')}</button>
          <button type="button" role="radio" aria-checked={lang === 'ar'} className={lang === 'ar' ? 'on' : ''} onClick={() => pickLang('ar')} lang="ar">العربية</button>
        </div>
      </div>
    </section>
  );
}

const EMAIL_CATS = {
  employee: [['grades', 'Grades & feedback', 'When work is graded or returned for rework'], ['courses', 'Courses', 'When you’re assigned a new course'], ['support', 'Support replies', 'When someone answers your question'], ['reminders', 'Due dates & reminders', 'Before a course or assignment is due, and when it’s overdue']],
  instructor: [['reviews', 'New work to review', 'New submissions and AI drafts ready'], ['support', 'Employee questions', 'New questions and replies'], ['courses', 'Course assignments', 'When you’re added to a course'], ['reminders', 'Review reminders', 'A daily nudge when submissions wait more than 2 days']],
  company_admin: [['team', 'Team updates', 'Completed courses, shared progress reports, seats'], ['courses', 'New courses', 'When a new course becomes available'], ['support', 'Support replies', 'When our team answers you'], ['reminders', 'Overdue training', 'When an employee misses a course due date']],
  super_admin: [['support', 'Support requests', 'New platform tickets and replies'], ['reviews', 'Grading', 'Submissions waiting for review'], ['team', 'Customer updates', 'Seat limits and completions']],
};

function EmailPrefs() {
  const t = useT();
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
      <div className="row"><Mail size={18} /><h2 className="h-card">{t('Email notifications')}</h2><span className="spacer" />{saved && <span className="small" style={{ color: 'var(--ok)' }}><Check size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {t('Saved')}</span>}</div>
      <p className="small muted">{t('You always see notifications under the bell. Choose which ones also come to')} <strong>{user.email}</strong>.</p>
      <ErrorBox>{err}</ErrorBox>
      <label className="switch-row">
        <span><strong>{t('Send me emails')}</strong><span className="small muted">{t('Turn off to get in-app notifications only')}</span></span>
        <input type="checkbox" role="switch" className="switch" checked={on} onChange={(e) => save({ enabled: e.target.checked })} />
      </label>
      {cats.map(([k, label, hint]) => (
        <label key={k} className={`switch-row ${on ? '' : 'disabled'}`}>
          <span><strong>{t(label)}</strong><span className="small muted">{t(hint)}</span></span>
          <input type="checkbox" role="switch" className="switch" disabled={!on} checked={p[k] !== false} onChange={(e) => save({ [k]: e.target.checked })} />
        </label>
      ))}
    </section>
  );
}
