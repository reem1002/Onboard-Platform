import { useEffect, useState } from 'react';
import { CheckCircle2, HardDrive, Mail, Save, Send, UploadCloud, AlertTriangle, Sparkles, RefreshCw } from 'lucide-react';
import { api, errorMessage } from '../../api/client';
import { ErrorBox, Loader, PageSkeleton, Progress, fmtBytes } from '../../components/ui';

const MB = 1024 * 1024;

/** Platform admin: upload limits, storage per company and the notification-email switch. */
export default function Settings() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const load = () => api.get('/settings').then(({ data: d }) => setData(d)).catch((e) => setErr(errorMessage(e)));
  useEffect(() => { load(); }, []);

  if (!data) return err ? <div className="page"><ErrorBox>{err}</ErrorBox></div> : <PageSkeleton variant="list" />;
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div>
          <h1>Platform settings</h1>
          <p>AI grading, file size limits, storage per customer and notification emails.</p>
        </div>
      </div>
      <div className="profile-grid">
        <AiGrading data={data} onSaved={load} />
        <UploadLimits data={data} onSaved={load} />
        <EmailSettings data={data} onSaved={load} />
        <Storage data={data} onSaved={load} />
      </div>
    </div>
  );
}

function NumField({ id, label, value, onChange, max, hint, suffix = 'MB' }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-suffix">
        <input id={id} type="number" min={0} max={max} className="input" value={value} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
        <span>{suffix}</span>
      </div>
      {hint && <span className="small muted">{hint}</span>}
    </div>
  );
}

function UploadLimits({ data, onSaved }) {
  const u = data.settings.uploads;
  const [f, setF] = useState({ submissionFileMB: u.submissionFileMB, submissionTotalMB: u.submissionTotalMB, attachmentFileMB: u.attachmentFileMB, defaultCompanyQuotaMB: u.defaultCompanyQuotaMB });
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => { setF({ ...f, [k]: v }); setMsg({}); };
  const dirty = Object.keys(f).some((k) => f[k] !== u[k]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put('/settings', { uploads: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v) || 0])) });
      setMsg({ ok: 'Saved. New limits apply to the next upload.' });
      onSaved();
    } catch (e2) { setMsg({ err: errorMessage(e2) }); } finally { setBusy(false); }
  };

  return (
    <form className="card stack" onSubmit={save}>
      <div className="row"><UploadCloud size={18} /><h2 className="h-card">File size limits</h2></div>
      <p className="small muted">The server accepts at most <strong>{data.maxUploadMB} MB</strong> per file (<code>MAX_UPLOAD_MB</code> in the server .env). Instructors can set a different per-file limit on an individual assignment.</p>
      {msg.ok && <div className="alert alert-ok">{msg.ok}</div>}
      <ErrorBox>{msg.err}</ErrorBox>
      <div className="grid-form">
        <NumField id="sf" label="Employee submission — per file" value={f.submissionFileMB} max={data.maxUploadMB} onChange={set('submissionFileMB')} />
        <NumField id="st" label="Employee submission — all files" value={f.submissionTotalMB} onChange={set('submissionTotalMB')} />
        <NumField id="af" label="Instructor resources — per file" value={f.attachmentFileMB} max={data.maxUploadMB} onChange={set('attachmentFileMB')} />
        <NumField id="dq" label="Default storage per company" value={f.defaultCompanyQuotaMB} onChange={set('defaultCompanyQuotaMB')} hint="0 = unlimited. Override per company below." />
      </div>
      <div className="row"><span className="spacer" /><button className="btn btn-primary" disabled={!dirty || busy}><Save size={15} /> {busy ? 'Saving…' : 'Save limits'}</button></div>
    </form>
  );
}

function EmailSettings({ data, onSaved }) {
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState('');
  const on = data.settings.email.notificationsEnabled;

  const toggle = async () => {
    setBusy('toggle'); setMsg({});
    try { await api.put('/settings', { email: { notificationsEnabled: !on } }); onSaved(); } catch (e) { setMsg({ err: errorMessage(e) }); } finally { setBusy(''); }
  };
  const test = async () => {
    setBusy('test'); setMsg({});
    try { const { data: r } = await api.post('/settings/test-email'); setMsg({ ok: `Test email sent to ${r.to}.` }); } catch (e) { setMsg({ err: errorMessage(e) }); } finally { setBusy(''); }
  };

  return (
    <section className="card stack">
      <div className="row"><Mail size={18} /><h2 className="h-card">Notification emails</h2></div>
      <div className={`alert ${data.mail.configured ? 'alert-ok' : 'alert-warn'}`}>
        {data.mail.configured
          ? <><CheckCircle2 size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Email server connected · sending as {data.mail.from}</>
          : <><AlertTriangle size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> No email server yet. Add SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM to the server .env — until then emails are only logged in the server console.</>}
      </div>
      <ErrorBox>{msg.err}</ErrorBox>
      {msg.ok && <div className="alert alert-ok">{msg.ok}</div>}
      <label className="switch-row">
        <span><strong>Email notifications to users</strong><span className="small muted">Grades, new courses, support replies, review queue, team updates. Each person can still turn categories off in their account settings.</span></span>
        <input type="checkbox" role="switch" className="switch" checked={on} disabled={busy === 'toggle'} onChange={toggle} />
      </label>
      <p className="small muted">Password-reset emails are always sent, whatever this switch says.</p>
      <div className="row"><span className="spacer" /><button className="btn" disabled={!data.mail.configured || Boolean(busy)} onClick={test}><Send size={14} /> {busy === 'test' ? 'Sending…' : 'Send me a test email'}</button></div>
    </section>
  );
}

function QuotaEditor({ row, onSaved }) {
  const [v, setV] = useState(row.storageQuotaMB ?? '');
  const [err, setErr] = useState('');
  const dirty = String(v) !== String(row.storageQuotaMB ?? '');
  const save = async () => {
    setErr('');
    try { await api.patch(`/settings/companies/${row._id}/quota`, { storageQuotaMB: v === '' ? null : Number(v) }); onSaved(); } catch (e) { setErr(errorMessage(e)); }
  };
  return (
    <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
      <div className="input-suffix" style={{ width: 150 }}>
        <input type="number" min={0} className="input" aria-label={`Storage quota for ${row.name}`} placeholder="Default" value={v} onChange={(e) => setV(e.target.value)} />
        <span>MB</span>
      </div>
      {dirty && <button className="btn btn-sm btn-primary" onClick={save}>Save</button>}
      {err && <span className="small" style={{ color: 'var(--danger)' }}>{err}</span>}
    </div>
  );
}

function Storage({ data, onSaved }) {
  const total = data.storage.reduce((n, c) => n + c.usedBytes, 0);
  return (
    <section className="card card-flush profile-wide">
      <div className="row" style={{ padding: 'var(--sp-4) var(--sp-4) var(--sp-2)' }}>
        <HardDrive size={18} /><h2 className="h-card">Storage by company</h2>
        <span className="spacer" />
        <span className="small muted">{fmtBytes(total)} of employee submissions in total</span>
      </div>
      <table className="table">
        <thead><tr><th>Company</th><th>Files</th><th style={{ width: '32%' }}>Used</th><th>Quota</th></tr></thead>
        <tbody>
          {data.storage.map((c) => {
            const q = c.effectiveQuotaMB;
            const pct = q ? Math.min(100, Math.round((c.usedBytes / (q * MB)) * 100)) : 0;
            return (
              <tr key={c._id}>
                <td data-label="Company"><strong>{c.name}</strong>{!c.isActive && <span className="chip" style={{ marginInlineStart: 6 }}>Inactive</span>}</td>
                <td data-label="Files">{c.files}</td>
                <td data-label="Used">
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    {q ? <Progress value={pct} /> : null}
                    <span className={`small ${pct >= 90 ? 'text-danger' : ''}`} style={{ whiteSpace: 'nowrap' }}>{fmtBytes(c.usedBytes)}{q ? ` of ${q >= 1024 ? `${(q / 1024).toFixed(1)} GB` : `${q} MB`}` : ' · unlimited'}</span>
                  </div>
                </td>
                <td data-label="Quota"><QuotaEditor key={String(c.storageQuotaMB)} row={c} onSaved={onSaved} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small muted" style={{ padding: 'var(--sp-3) var(--sp-4)' }}>Empty quota = use the platform default ({data.settings.uploads.defaultCompanyQuotaMB ? `${data.settings.uploads.defaultCompanyQuotaMB} MB` : 'unlimited'}); 0 = unlimited for that company. When a company is full, its employees see a clear message and can’t upload until you raise it.</p>
    </section>
  );
}

const SUGGESTED = [
  ['qwen2.5:7b', 'Recommended for a 4–8 GB graphics card · ~4.7 GB'],
  ['llama3.1:8b', 'Alternative · ~4.9 GB'],
  ['qwen2.5:3b', 'Faster, weaker — for machines without a graphics card · ~1.9 GB'],
  ['qwen2.5:14b', 'Better quality — needs 12 GB+ graphics memory · ~9 GB'],
];

function AiGrading({ data, onSaved }) {
  const ai = data.settings.ai;
  const [f, setF] = useState({ provider: ai.provider, localModel: ai.localModel, runs: ai.runs, useExamples: ai.useExamples, maxChars: ai.maxChars });
  const [st, setSt] = useState(null);
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState(false);
  const loadStatus = () => { setSt(null); api.get('/settings/ai/status').then(({ data: d }) => setSt(d)).catch(() => setSt({ error: true })); };
  useEffect(loadStatus, []);
  const dirty = Object.keys(f).some((k) => f[k] !== ai[k]);
  const installed = st?.local?.models?.map((m) => m.name) || [];
  const modelReady = installed.some((n) => n === f.localModel || n === `${f.localModel}:latest`);

  const save = async () => {
    setBusy(true); setMsg({});
    try { await api.put('/settings', { ai: f }); setMsg({ ok: 'Saved — applies to the next submission.' }); onSaved(); loadStatus(); } catch (e) { setMsg({ err: errorMessage(e) }); } finally { setBusy(false); }
  };

  const a = st?.agreement;
  return (
    <section className="card stack profile-wide">
      <div className="row"><Sparkles size={18} /><h2 className="h-card">AI grading</h2><span className="spacer" /><button className="btn btn-ghost btn-sm" onClick={loadStatus}><RefreshCw size={14} /> Refresh status</button></div>
      <p className="small muted">The AI only drafts a grade. An instructor always reviews, edits and approves before an employee sees anything.</p>
      {msg.ok && <div className="alert alert-ok">{msg.ok}</div>}
      <ErrorBox>{msg.err}</ErrorBox>

      <div className="seg" role="radiogroup" aria-label="Grading engine">
        {[['local', 'In-house (free)'], ['claude', 'Claude API'], ['off', 'Off — manual only']].map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={f.provider === id} className={f.provider === id ? 'on' : ''} disabled={id === 'claude' && st && !st.claudeConfigured} title={id === 'claude' && st && !st.claudeConfigured ? 'Add ANTHROPIC_API_KEY to the server .env first' : undefined} onClick={() => setF({ ...f, provider: id })}>{label}</button>
        ))}
      </div>

      {f.provider === 'local' && (
        <>
          <div className="row small" style={{ gap: 8 }}>
            {!st ? <span className="muted">Checking the local AI…</span> : (
              <>
                <span className={`status-dot ${st.local?.reachable ? 'ok' : ''}`} aria-hidden />
                {st.local?.reachable
                  ? <span>Ollama is running at <code>{st.local.url}</code> · {installed.length} model{installed.length === 1 ? '' : 's'} installed</span>
                  : <span>Ollama isn’t reachable at <code>{st.local?.url || 'http://127.0.0.1:11434'}</code> — install and start it (steps below).</span>}
              </>
            )}
          </div>
          <div className="grid-form">
            <div className="field">
              <label htmlFor="lm">Model</label>
              <input id="lm" className="input" list="lm-list" value={f.localModel} onChange={(e) => setF({ ...f, localModel: e.target.value.trim() })} />
              <datalist id="lm-list">{[...new Set([...installed, ...SUGGESTED.map(([n]) => n)])].map((n) => <option key={n} value={n} />)}</datalist>
              {st?.local?.reachable && !modelReady && <span className="small" style={{ color: 'var(--warn)' }}>Not installed yet — run <code>ollama pull {f.localModel}</code></span>}
            </div>
            <div className="field">
              <label htmlFor="runs">Runs per criterion</label>
              <select id="runs" className="select" value={f.runs} onChange={(e) => setF({ ...f, runs: Number(e.target.value) })}>
                <option value={1}>1 — fastest</option>
                <option value={2}>2 — flags disagreements</option>
                <option value={3}>3 — median of three (slowest, steadiest)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="mc">Text sent to the model</label>
              <div className="input-suffix"><input id="mc" type="number" min={2000} max={60000} step={1000} className="input" value={f.maxChars} onChange={(e) => setF({ ...f, maxChars: Number(e.target.value) })} /><span>chars</span></div>
              <span className="small muted">~14 000 fits a 7B model’s memory. Longer submissions are cut and flagged.</span>
            </div>
          </div>
          <label className="switch-row">
            <span><strong>Learn from instructors</strong><span className="small muted">Show the model how instructors graded earlier submissions of the same assignment (and where the AI was too generous or too harsh).</span></span>
            <input type="checkbox" role="switch" className="switch" checked={f.useExamples} onChange={(e) => setF({ ...f, useExamples: e.target.checked })} />
          </label>
          {st && !st.local?.reachable && (
            <details className="setup-steps" open>
              <summary><strong>Set up the in-house model (one time, free)</strong></summary>
              <ol className="small">
                <li>Download and install Ollama for Windows from <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a>. It starts automatically in the background.</li>
                <li>Open PowerShell and download the model (about 4.7 GB, once):<pre className="cmd">ollama pull {f.localModel || 'qwen2.5:7b'}</pre></li>
                <li>Optional quick test:<pre className="cmd">ollama run {f.localModel || 'qwen2.5:7b'} "Say hello in one sentence"</pre></li>
                <li>Press <em>Refresh status</em> above. New submissions are then drafted automatically; for older ones use <em>Retry AI</em> on the review page.</li>
              </ol>
              <p className="small muted">Suggested models: {SUGGESTED.map(([n, h]) => `${n} (${h})`).join(' · ')}</p>
            </details>
          )}
        </>
      )}

      <div className="row"><span className="spacer" /><button className="btn btn-primary" disabled={!dirty || busy} onClick={save}><Save size={15} /> {busy ? 'Saving…' : 'Save AI settings'}</button></div>

      <h3 style={{ marginTop: 'var(--sp-2)' }}>How close are AI drafts to instructors’ final grades? <span className="small muted" style={{ fontWeight: 400 }}>(last 90 days)</span></h3>
      {!st ? <Loader rows={1} /> : !a?.graded ? (
        <p className="small muted">No approved AI-drafted submissions yet. This fills in as instructors approve grades.</p>
      ) : (
        <>
          <div className="stat-mini">
            <div><b>{a.graded}</b><span>drafts approved</span></div>
            <div><b>±{a.meanAbsDiff}</b><span>average difference (points)</span></div>
            <div><b>{a.within5Pct}%</b><span>within 5 points</span></div>
            <div><b>{a.acceptedAsIsPct}%</b><span>approved without edits</span></div>
            {a.avgSeconds != null && <div><b>{a.avgSeconds < 90 ? `${a.avgSeconds} s` : `${Math.round(a.avgSeconds / 60)} min`}</b><span>average drafting time</span></div>}
          </div>
          {a.byModel.length > 1 && <p className="small muted">{a.byModel.map((m) => `${m.model}: ±${m.meanAbsDiff} over ${m.graded}`).join(' · ')}</p>}
        </>
      )}
      {st?.queue && (st.queue.waiting > 0 || st.queue.running > 0) && <p className="small">Now drafting {st.queue.running}, waiting {st.queue.waiting}.</p>}
    </section>
  );
}
