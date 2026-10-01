import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Loader, ErrorBox, Progress, fmtDate } from '../components/ui';
import ResetPasswordButton from '../components/ResetPasswordButton';
import { useT } from '../lib/i18n';

const empty = { name: '', email: '', password: '', department: '', jobTitle: '' };

/** Company admin: manage the company's employee accounts within the purchased seats. */
export default function People() {
  const t = useT();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const { data, error, loading, reload } = useFetch(`/users?limit=100&role=employee${q ? `&q=${encodeURIComponent(q)}` : ''}`, [q]);
  const seats = useFetch('/users/seats');
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState({});

  const s = seats.data;
  const full = s ? s.seatsUsed >= s.seatLimit : false;
  const refresh = () => { reload(); seats.reload(); };

  const create = async (e) => {
    e.preventDefault();
    setMsg({});
    try {
      await api.post('/users', { ...form, role: 'employee' });
      setMsg({ ok: `${form.name} can now sign in. Share the temporary password securely and ask them to change it.` });
      setForm(null);
      refresh();
    } catch (err) {
      setMsg({ err: errorMessage(err) });
    }
  };

  const toggleActive = async (u) => {
    setMsg({});
    try {
      await api.patch(`/users/${u._id}`, { isActive: !u.isActive });
      refresh();
    } catch (err) {
      setMsg({ err: errorMessage(err) });
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{t('Employees')}</h1><p>Accounts for your team{s?.company ? ` at ${s.company}` : ''}.</p></div>
        <span className="spacer" />
        <button className="btn btn-primary" disabled={full} title={full ? 'All seats are in use' : undefined} onClick={() => setForm(empty)}><UserPlus size={16} /> {t('Add employee')}</button>
      </div>

      {s && (
        <div className="card seat-card">
          <div>
            <b>{s.seatsUsed} of {s.seatLimit}</b>
            <span className="muted small"> {t('seats in use')}</span>
          </div>
          <Progress value={s.seatLimit ? (s.seatsUsed / s.seatLimit) * 100 : 100} />
          <p className="small muted">
            {full ? 'All seats are in use. Deactivate an employee to free a seat, or contact us to add more.' : `${s.seatLimit - s.seatsUsed} seat(s) available. Deactivated employees don't use a seat.`}
          </p>
        </div>
      )}

      {msg.ok && <div className="alert alert-ok" style={{ marginBottom: 12 }}>{msg.ok}</div>}
      <ErrorBox>{msg.err || error}</ErrorBox>

      {form && (
        <form className="card stack" style={{ marginBottom: 'var(--sp-4)' }} onSubmit={create}>
          <h3>{t('New employee')}</h3>
          <div className="grid-form">
            <div className="field"><label htmlFor="n">{t('Full name')}</label><input id="n" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="e">{t('Work email')}</label><input id="e" type="email" className="input" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label htmlFor="p">{t('Temporary password')}</label><input id="p" type="text" className="input" required minLength={10} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><span className="small muted">{t('10+ characters with upper, lower case and a number.')}</span></div>
            <div className="field"><label htmlFor="d">{t('Department')}</label><input id="d" className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
            <div className="field"><label htmlFor="j">{t('Job title')}</label><input id="j" className="input" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
          </div>
          <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={() => setForm(null)}>{t('Cancel')}</button><button className="btn btn-primary">{t('Create account')}</button></div>
        </form>
      )}

      <input className="input" style={{ maxWidth: 320, margin: 'var(--sp-3) 0' }} placeholder={t('Search employees')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search employees')} />
      {loading ? <div className="card"><Loader rows={4} /></div> : !data?.users.length ? (
        <div className="card empty"><p>{t('No employees yet. Add your first employee to start their onboarding.')}</p></div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead><tr><th>{t('Name')}</th><th>{t('Department')}</th><th>{t('Job title')}</th><th>{t('Last sign-in')}</th><th /></tr></thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u._id} style={{ opacity: u.isActive ? 1 : 0.55 }}>
                  <td data-label="Name"><strong>{u.name}</strong><div className="small muted">{u.email}</div></td>
                  <td data-label="Department">{u.department || '—'}</td>
                  <td data-label="Job title">{u.jobTitle || '—'}</td>
                  <td data-label="Last sign-in">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : 'Never'}</td>
                  <td>{u._id !== user._id && (
                    <div className="row" style={{ justifyContent: 'flex-end' }}>
                      {u.isActive && u.role === 'employee' && <ResetPasswordButton user={u} />}
                      <button className="btn btn-sm" disabled={!u.isActive && full} onClick={() => toggleActive(u)}>{u.isActive ? t('Deactivate') : t('Reactivate')}</button>
                    </div>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
