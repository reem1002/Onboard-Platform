import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileDown, FileText, Sparkles, Plus, Trash2, Share2, Lock } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { downloadProgressReport, downloadProgressReportPdf } from '../api/files';
import { useAuth } from '../context/AuthContext';
import { Loader, ErrorBox, fmtDate, PageSkeleton } from '../components/ui';
import { useT } from '../lib/i18n';

/** Donut showing overall completion */
function Donut({ pct }) {
  const t = useT();
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={`${pct}% complete`}>
      <circle cx="70" cy="70" r={r} className="donut-track" />
      <circle cx="70" cy="70" r={r} className="donut-fill" strokeDasharray={`${(c * pct) / 100} ${c}`} transform="rotate(-90 70 70)" />
      <text x="70" y="68" textAnchor="middle" className="donut-num">{pct}%</text>
      <text x="70" y="88" textAnchor="middle" className="donut-lbl">{t('complete')}</text>
    </svg>
  );
}

function Bars({ rows }) {
  return (
    <div className="hbars">
      {rows.map((r, i) => (
        <div className="hbar" key={i}>
          <span className="hbar-label">{r.label}</span>
          <span className="hbar-track"><span style={{ width: `${Math.max(0, Math.min(100, r.pct))}%` }} /></span>
          <span className={`hbar-val ${r.pct ? '' : 'muted'}`}>{r.value ?? (r.pct ? `${r.pct}%` : 'Not started')}</span>
        </div>
      ))}
    </div>
  );
}

function ListEditor({ items, onChange, placeholder }) {
  const t = useT();
  return (
    <div className="stack" style={{ gap: 6 }}>
      {items.map((x, i) => (
        <div key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <textarea className="textarea" style={{ minHeight: 56 }} value={x} placeholder={placeholder} onChange={(e) => onChange(items.map((y, j) => (j === i ? e.target.value : y)))} />
          <button type="button" className="btn btn-ghost icon-btn" aria-label={t('Remove')} onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...items, ''])}><Plus size={14} /> {t('Point')}</button>
    </div>
  );
}

export default function ReportPage() {
  const t = useT();
  const [params] = useSearchParams();
  const student = params.get('student');
  const course = params.get('course');
  const [state, setState] = useState(null);
  const [n, setN] = useState(null);
  const [preparedFor, setPreparedFor] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [ok, setOk] = useState('');
  const { user } = useAuth();
  const staff = ['super_admin', 'instructor'].includes(user.role);

  useEffect(() => {
    api.get('/reports/progress', { params: { student, course } })
      .then(({ data }) => { setState(data); setN(data.narrative); setPreparedFor(data.data.company.name || ''); })
      .catch((e) => setErr(errorMessage(e)));
  }, [student, course]);

  if (!state) return (err ? <div className="page"><ErrorBox>{err}</ErrorBox></div> : <PageSkeleton variant="detail" />);
  const d = state.data;

  const draftAI = async () => {
    setBusy('ai');
    setErr('');
    try {
      const { data } = await api.post('/reports/progress/draft', { student, course, preparedFor });
      setN(data.narrative);
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(''); }
  };
  const body = () => ({ student, course, preparedFor, ...(staff ? { narrative: n } : {}) });
  const download = async (format) => {
    setBusy(format);
    setErr('');
    try {
      await (format === 'docx' ? downloadProgressReport : downloadProgressReportPdf)(body());
    } catch (e) { setErr(errorMessage(e, 'Could not generate the report.')); } finally { setBusy(''); }
  };
  const share = async () => {
    setBusy('share');
    setErr('');
    setOk('');
    try {
      await api.post('/reports/saved', { student, course, preparedFor, narrative: n });
      setOk(`Shared with ${d.company.name}. Their company admins were notified and can download it as PDF.`);
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(''); }
  };

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <Link to={staff ? `/courses/${course}/reports` : '/team'} className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> {staff ? t('All reports for this course') : t('Team progress')}</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <span className="small muted">Progress report · {d.course.code}</span>
          <h1>{d.student.name}</h1>
          <p>{[d.student.jobTitle, d.company.name].filter(Boolean).join(' · ')}</p>
        </div>
        <span className="spacer" />
        {staff && state.aiAvailable && <button className="btn" disabled={Boolean(busy)} onClick={draftAI}><Sparkles size={15} /> {busy === 'ai' ? 'Drafting…' : 'Draft text with AI'}</button>}
        {staff && <button className="btn" disabled={Boolean(busy)} onClick={() => download('docx')}><FileText size={15} /> {busy === 'docx' ? 'Generating…' : 'Word'}</button>}
        <button className={`btn ${staff ? '' : 'btn-primary'}`} disabled={Boolean(busy)} onClick={() => download('pdf')}><FileDown size={16} /> {busy === 'pdf' ? 'Generating…' : 'Download PDF'}</button>
        {staff && <button className="btn btn-primary" disabled={Boolean(busy)} onClick={share} title={t('Save this version and share it with the company admin')}><Share2 size={15} /> {busy === 'share' ? 'Sharing…' : 'Share with company'}</button>}
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <div className="alert alert-ok" role="status">{ok}</div>}

      <div className="report-grid">
        <div className="card report-kpi">
          <Donut pct={Math.round(d.progress.pct)} />
          <div className="stack" style={{ gap: 4 }}>
            <div><b>{d.progress.completed}</b> of {d.progress.total} items complete</div>
            <div><b>{d.progress.avgScore ?? '—'}{d.progress.avgScore != null && '%'}</b> {t('average grade')}</div>
            {d.progress.pendingReview > 0 && <div className="muted">{d.progress.pendingReview} waiting for grading</div>}
            {d.progress.currentMilestone && <div className="muted small">Now on: {d.progress.currentMilestone.title}</div>}
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>{t('Milestone completion')}</h3>
          <Bars rows={d.progress.milestones.map((m) => ({ label: m.title, pct: m.pct }))} />
        </div>
      </div>

      {d.graded.length > 0 && (
        <div className="card" style={{ marginTop: 'var(--sp-3)' }}>
          <h3 style={{ marginBottom: 10 }}>{t('Graded deliverables')}</h3>
          <Bars rows={d.graded.map((g) => ({ label: `${g.code} — ${g.title}`, pct: Math.round((g.score / g.maxScore) * 100), value: `${g.score}/${g.maxScore}` }))} />
        </div>
      )}

      {staff ? (
      <div className="card stack" style={{ marginTop: 'var(--sp-3)' }}>
        <h3>{t('Report text')}</h3>
        <p className="small muted">{t('Numbers, tables and charts come from the platform automatically. Adjust the wording below before downloading.')}</p>
        <div className="field"><label htmlFor="pf">{t('Prepared for')}</label><input id="pf" className="input" value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} placeholder={t('e.g. Mansour — HR Director, Beamtrail Corporate')} /></div>
        <div className="field"><label htmlFor="es">{t('1. Executive summary')}</label><textarea id="es" className="textarea" style={{ minHeight: 200 }} value={n.executiveSummary} onChange={(e) => setN({ ...n, executiveSummary: e.target.value })} /><span className="small muted">{t('Leave a blank line between paragraphs.')}</span></div>
        <div className="field"><label>{t('Business value assessment')}</label><ListEditor items={n.businessValue} onChange={(businessValue) => setN({ ...n, businessValue })} /></div>
        <div className="field"><label htmlFor="rec">{t('Recommendation')}</label><textarea id="rec" className="textarea" value={n.recommendation} onChange={(e) => setN({ ...n, recommendation: e.target.value })} /></div>
        <div className="field"><label>{t('Next steps & reporting cadence')}</label><ListEditor items={n.nextSteps} onChange={(nextSteps) => setN({ ...n, nextSteps })} /></div>
      </div>
      ) : (
        <div className="card stack" style={{ marginTop: 'var(--sp-3)' }}>
          <div className="row"><h3>{t('Report text')}</h3><span className="chip"><Lock size={12} /> {t('Read-only')}</span></div>
          <p className="small muted">{t('Written by the training team from your employee’s results. Reports your instructor shares with you appear under')} <Link to="/reports/shared">{t('Reports')}</Link>.</p>
          <div className="report-text">
            <h4>{t('Executive summary')}</h4>
            {n.executiveSummary.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
            <h4>{t('Business value')}</h4>
            <ul className="bullets">{n.businessValue.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <h4>{t('Recommendation')}</h4>
            <p>{n.recommendation}</p>
            <h4>{t('Next steps')}</h4>
            <ul className="bullets">{n.nextSteps.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 'var(--sp-3)' }}>
        <h3 style={{ marginBottom: 8 }}>{t('Also included automatically')}</h3>
        <ul className="bullets small">
          <li>Employee & programme overview (enrolled {fmtDate(d.enrollment.enrolledAt)}{d.enrollment.dueAt ? `, complete by ${fmtDate(d.enrollment.dueAt)}` : ''}; assessor{d.assessors.length !== 1 ? 's' : ''}: {d.assessors.join(', ') || '—'})</li>
          <li>{d.jdRows.length ? `Job-description alignment table (${d.jdRows.length} requirements)` : 'Job-description alignment — add a “Job-description requirement” to assignments to include this table'}</li>
          <li>Skills demonstrated with grades and assessor evidence ({d.graded.length} graded){d.quizzes.length ? `, plus ${d.quizzes.length} quiz result(s)` : ''}</li>
          <li>Strengths ({d.strengths.length}), development focus ({d.development.length}){d.assessorQuote ? ' and an assessor quote' : ''} taken from approved feedback</li>
        </ul>
      </div>
    </div>
  );
}
