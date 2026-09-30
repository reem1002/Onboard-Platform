import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus, UserPlus, BarChart3, Check } from 'lucide-react';
import { useFetch } from '../../api/useFetch';
import { api, errorMessage } from '../../api/client';
import { Loader, ErrorBox, Progress } from '../../components/ui';
import ResetPasswordButton from '../../components/ResetPasswordButton';

const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function NewCompanyForm({ onDone, onCancel }) {
  const [f, setF] = useState({ name: '', slug: '', seatLimit: 10, adminName: '', adminEmail: '', adminPassword: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const up = (patch) => setF((x) => ({ ...x, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const body = { name: f.name, slug: f.slug || slugify(f.name), seatLimit: Number(f.seatLimit) };
      if (f.adminEmail) body.admin = { name: f.adminName, email: f.adminEmail, password: f.adminPassword };
      await api.post('/users/companies', body);
      onDone();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} style={{ marginBottom: 'var(--sp-4)' }}>
      <h3>New customer company</h3>
      <ErrorBox>{err}</ErrorBox>
      <div className="grid-form">
        <div className="field"><label htmlFor="cn">Company name</label><input id="cn" className="input" required value={f.name} onChange={(e) => up({ name: e.target.value, slug: slugify(e.target.value) })} /></div>
        <div className="field"><label htmlFor="cs">Short ID</label><input id="cs" className="input" required pattern="[a-z0-9-]{2,60}" value={f.slug} onChange={(e) => up({ slug: e.target.value })} /><span className="small muted">Lowercase letters, numbers and dashes.</span></div>
        <div className="field"><label htmlFor="seats">Employee seats purchased</label><input id="seats" type="number" min={0} className="input" required value={f.seatLimit} onChange={(e) => up({ seatLimit: e.target.value })} /></div>
      </div>
      <h3 style={{ marginTop: 8 }}>First company admin <span className="small muted" style={{ fontWeight: 400 }}>(optional — you can add one later)</span></h3>
      <div className="grid-form">
        <div className="field"><label htmlFor="an">Full name</label><input id="an" className="input" value={f.adminName} onChange={(e) => up({ adminName: e.target.value })} required={Boolean(f.adminEmail)} /></div>
        <div className="field"><label htmlFor="ae">Work email</label><input id="ae" type="email" className="input" value={f.adminEmail} onChange={(e) => up({ adminEmail: e.target.value })} /></div>
        <div className="field"><label htmlFor="ap">Temporary password</label><input id="ap" className="input" autoComplete="new-password" minLength={10} value={f.adminPassword} onChange={(e) => up({ adminPassword: e.target.value })} required={Boolean(f.adminEmail)} /><span className="small muted">10+ characters with upper, lower case and a number.</span></div>
      </div>
      <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onCancel}>Cancel</button><button className="btn btn-primary" disabled={busy}>Create company</button></div>
    </form>
  );
}

function AddAdminModal({ company, onClose, onDone }) {
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.post('/users', { ...f, role: 'company_admin', company: company._id });
      onDone();
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal stack" role="dialog" aria-modal="true" aria-labelledby="aa-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 id="aa-title">Add a company admin for {company.name}</h2>
        <p className="small muted">They'll be able to add employee accounts (up to the seat limit) and assign courses.</p>
        <ErrorBox>{err}</ErrorBox>
        <div className="field"><label htmlFor="n">Full name</label><input id="n" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="e">Work email</label><input id="e" type="email" className="input" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="p">Temporary password</label><input id="p" className="input" required minLength={10} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Add admin</button></div>
      </form>
    </div>
  );
}

function SeatEditor({ company, onSaved }) {
  const [v, setV] = useState(company.seatLimit);
  const [err, setErr] = useState('');
  const dirty = Number(v) !== company.seatLimit;
  const save = async () => {
    setErr('');
    try {
      await api.patch(`/users/companies/${company._id}`, { seatLimit: Number(v) });
      onSaved();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input type="number" min={0} className="input" style={{ width: 96 }} aria-label={`Seat limit for ${company.name}`} value={v} onChange={(e) => setV(e.target.value)} />
        {dirty && <button className="btn btn-sm btn-primary" onClick={save}><Check size={14} /> Save</button>}
      </div>
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </div>
  );
}

export default function Companies() {
  const { data, error, loading, reload } = useFetch('/users/companies');
  const [creating, setCreating] = useState(false);
  const [addAdminFor, setAddAdminFor] = useState(null);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Companies</h1><p>Customers, the seats they've purchased, and their admins.</p></div>
        <span className="spacer" />
        {!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New company</button>}
      </div>

      {creating && <NewCompanyForm onCancel={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      <ErrorBox>{error}</ErrorBox>

      {loading ? <div className="card"><Loader rows={4} /></div> : !data?.companies.length ? (
        <div className="card empty"><Building2 style={{ margin: '0 auto 8px' }} /><h3>No companies yet</h3><p>Add your first customer to start onboarding their employees.</p></div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead><tr><th>Company</th><th style={{ width: '24%' }}>Seats used</th><th>Seat limit</th><th>Company admins</th><th /></tr></thead>
            <tbody>
              {data.companies.map((c) => {
                const pct = c.seatLimit ? Math.round((c.seatsUsed / c.seatLimit) * 100) : 100;
                return (
                  <tr key={c._id}>
                    <td data-label="Company"><strong>{c.name}</strong><div className="small muted">{c.slug}</div></td>
                    <td data-label="Seats used">
                      <div style={{ flex: 1 }}>
                        <div className="row small" style={{ flexWrap: 'nowrap' }}><span>{c.seatsUsed} of {c.seatLimit}</span><span className="spacer" />{pct >= 100 && <span className="chip chip-danger">Full</span>}</div>
                        <Progress value={pct} />
                      </div>
                    </td>
                    <td data-label="Seat limit"><SeatEditor key={c.seatLimit} company={c} onSaved={reload} /></td>
                    <td data-label="Company admins">
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {c.admins.length ? c.admins.map((a) => <span key={a._id} className="small row" style={{ gap: 4 }}>{a.name} <span className="muted">· {a.email}</span><ResetPasswordButton user={a} className="btn btn-ghost btn-sm icon-link" /></span>) : <span className="small muted">None yet</span>}
                        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', paddingInline: 0 }} onClick={() => setAddAdminFor(c)}><UserPlus size={14} /> Add admin</button>
                      </div>
                    </td>
                    <td><Link className="btn btn-sm" to={`/team?company=${c._id}`}><BarChart3 size={14} /> Progress</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {addAdminFor && <AddAdminModal company={addAdminFor} onClose={() => setAddAdminFor(null)} onDone={() => { setAddAdminFor(null); reload(); }} />}
    </div>
  );
}
