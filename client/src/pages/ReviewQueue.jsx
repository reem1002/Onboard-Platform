import { Fragment, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronDown, Eye, FileText, Info, RotateCcw, Search, ShieldAlert, Sparkles, PencilLine } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { ErrorBox, StatusChip, fmtDate, ListSkeleton } from '../components/ui';
import { timeAgo } from '../components/notifications';
import { localizeMessage, aiIssues, worstSeverity } from '../lib/aiLabels';
import { useT, useI18n } from '../lib/i18n';

const TABS = [
  ['pending', 'Needs review'],
  ['ai_grading', 'AI grading'],
  ['returned', 'Returned'],
  ['approved', 'Graded'],
];
const CONF = { high: 'High', medium: 'Medium', low: 'Low' };

/** Score + how much to trust it, in one compact pill. */
function AiPill({ s }) {
  const t = useT();
  if (s.status === 'ai_grading') return <span className="ai-pill pending"><span className="spin-dot" /> {t('Drafting…')}</span>;
  if (s.status === 'ai_failed' || (s.ai?.error && s.ai?.totalScore == null)) return <span className="ai-pill manual">{t('Grade manually')}</span>;
  if (s.ai?.totalScore == null) return <span className="muted">—</span>;
  return (
    <span className={`ai-pill conf-${s.ai.confidence || 'medium'}`} title={t('AI draft · {c} confidence', { c: t(CONF[s.ai.confidence] || 'Medium').toLowerCase() })}>
      <Sparkles size={12} /> <b>{s.ai.totalScore}</b><span className="conf-dot" aria-hidden />{t(CONF[s.ai.confidence] || 'Medium')}
    </span>
  );
}

function IssueCount({ issues }) {
  const t = useT();
  const sev = worstSeverity(issues.filter((i) => i.severity !== 'info'));
  if (!sev) return null;
  const n = issues.filter((i) => i.severity !== 'info').length;
  return <span className={`issue-count sev-${sev}`} title={t('{n} thing(s) to check', { n })}><AlertTriangle size={12} /> {n}</span>;
}

function Details({ s, issues, onRetry, busy }) {
  const t = useT();
  const { lang } = useI18n();
  const canRetry = ['ai_failed', 'ai_graded', 'submitted', 'returned'].includes(s.status);
  return (
    <div className="q-details">
      <section>
        <h4><ShieldAlert size={14} /> {t('What to check')}</h4>
        {issues.length ? (
          <ul className="checks">
            {issues.map((c) => (
              <li key={c.kind} className={`sev-${c.severity}`}>
                {c.severity === 'info' ? <Info size={14} /> : <AlertTriangle size={14} />}
                <span><strong>{t(c.label)}</strong>{c.message && <span className="small muted"> — {t(localizeMessage(c.message, lang))}</span>}</span>
              </li>
            ))}
          </ul>
        ) : <p className="small muted">{s.ai?.totalScore != null ? t('No warnings — the AI quoted the submission for every score.') : t('No AI draft yet.')}</p>}
        {s.ai?.error && <p className="small text-danger" style={{ marginTop: 6 }}>{s.ai.error}</p>}
      </section>
      <section>
        <h4><FileText size={14} /> {t('Submission')}</h4>
        <dl className="q-facts">
          <div><dt>{t('Course')}</dt><dd>{s.course?.code || '—'}</dd></div>
          <div><dt>{t('Submitted')}</dt><dd>{fmtDate(s.createdAt)}{s.attempt > 1 ? ` · ${t('attempt {n}', { n: s.attempt })}` : ''}</dd></div>
          <div><dt>{t('Files')}</dt><dd>{s.files?.map((f) => f.originalName).join(', ') || '—'}</dd></div>
          {s.ai?.model && <div><dt>{t('AI model')}</dt><dd>{s.ai.model}{s.ai.durationMs ? ` · ${Math.round(s.ai.durationMs / 1000)} s` : ''}</dd></div>}
          {s.final?.totalScore != null && <div><dt>{t('Final grade')}</dt><dd><b>{s.final.totalScore}</b> / {s.assignment?.maxScore || 100}</dd></div>}
        </dl>
        {s.note && <p className="small q-note">“{s.note.length > 220 ? `${s.note.slice(0, 220)}…` : s.note}”</p>}
      </section>
      <section className="q-actions">
        <Link className="btn btn-primary btn-sm" to={`/review/${s._id}`}><PencilLine size={14} /> {s.status === 'approved' ? t('Open') : t('Review & grade')}</Link>
        <Link className="btn btn-sm" to={`/review/${s._id}?tab=files`}><Eye size={14} /> {t('View files')}</Link>
        {canRetry && <button className="btn btn-sm" disabled={busy} onClick={onRetry}><RotateCcw size={14} /> {s.ai?.totalScore != null ? t('Re-draft with AI') : t('Retry AI')}</button>}
      </section>
    </div>
  );
}

export default function ReviewQueue() {
  const t = useT();
  const nav = useNavigate();
  const [status, setStatus] = useState('pending');
  const [open, setOpen] = useState(null);
  const [q, setQ] = useState('');
  const [course, setCourse] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({});
  const { data, error, loading, reload } = useFetch(`/submissions/queue?status=${status}&limit=100`, [status]);
  const stats = useFetch('/dashboard/instructor');

  const items = useMemo(() => (data?.items || []).filter((s) => {
    if (course && s.course?._id !== course) return false;
    const needle = q.trim().toLowerCase();
    return !needle || `${s.student?.name} ${s.student?.email} ${s.assignment?.code} ${s.assignment?.title}`.toLowerCase().includes(needle);
  }), [data, q, course]);
  const courses = useMemo(() => {
    const m = new Map();
    (data?.items || []).forEach((s) => s.course && m.set(s.course._id, s.course));
    return [...m.values()];
  }, [data]);

  const c = stats.data?.counts || {};
  const counts = { pending: (c.ai_graded || 0) + (c.submitted || 0) + (c.ai_failed || 0), ai_grading: c.ai_grading || 0, returned: c.returned, approved: c.approved };

  const retry = async (s) => {
    setBusy(s._id); setMsg({});
    try {
      await api.post(`/submissions/${s._id}/regrade`);
      setMsg({ ok: t('{name}’s submission is being re-drafted. It will be back in “Needs review” in a minute or two.', { name: s.student?.name }) });
      reload(); stats.reload?.();
    } catch (e) { setMsg({ err: errorMessage(e) }); } finally { setBusy(''); }
  };

  const toggle = (id) => setOpen((o) => (o === id ? null : id));
  const rowKey = (e, s) => {
    if (e.target.closest('a,button,input,select')) return;
    if (e.key === 'Enter') nav(`/review/${s._id}`);
    if (e.key === ' ') { e.preventDefault(); toggle(s._id); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('Review queue')}</h1>
          <p>{t('AI drafts a grade for each submission against the rubric. Nothing reaches the employee until you approve it.')}</p>
        </div>
      </div>

      {stats.data && (
        <div className="stats stats-quiet">
          <div className="stat"><b>{counts.pending}</b><span>{t('Waiting for you')}</span></div>
          <div className="stat"><b>{counts.ai_grading}</b><span>{t('Being drafted by AI')}</span></div>
          <div className="stat"><b>{c.approved || 0}</b><span>{t('Approved')}</span></div>
          <div className="stat"><b>{stats.data.aiAgreementRate ?? '—'}{stats.data.aiAgreementRate != null && '%'}</b><span>{t('AI drafts approved without changes')}</span></div>
        </div>
      )}

      <div className="q-toolbar">
        <div className="seg" role="tablist" aria-label={t('Filter by status')}>
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={status === k} className={status === k ? 'on' : ''} onClick={() => { setStatus(k); setOpen(null); }}>
              {t(label)}{counts[k] ? <span className="seg-count">{counts[k]}</span> : null}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <label className="search-box"><Search size={15} aria-hidden /><input className="input" placeholder={t('Search name or assignment')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search name or assignment')} /></label>
        {courses.length > 1 && (
          <select className="select" style={{ width: 'auto' }} value={course} onChange={(e) => setCourse(e.target.value)} aria-label={t('Course')}>
            <option value="">{t('All courses')}</option>
            {courses.map((x) => <option key={x._id} value={x._id}>{x.code}</option>)}
          </select>
        )}
      </div>

      {msg.ok && <div className="alert alert-ok" role="status">{msg.ok}</div>}
      <ErrorBox>{error || msg.err}</ErrorBox>

      {loading ? <div className="card"><ListSkeleton rows={4} /></div> : !items.length ? (
        <div className="card empty">
          <h3>{q || course ? t('No matches') : status === 'pending' ? t('All caught up') : t('Nothing here')}</h3>
          <p>{q || course ? t('Try a different name or course.') : t('No submissions in this list.')}</p>
        </div>
      ) : (
        <div className="card card-flush qlist" role="table" aria-label={t('Submissions')}>
          <div className="q-row q-head" role="row">
            <span role="columnheader" aria-hidden />
            <span role="columnheader">{t('Employee')}</span>
            <span role="columnheader">{t('Assignment')}</span>
            <span role="columnheader">{status === 'approved' ? t('Graded') : t('Waiting')}</span>
            <span role="columnheader">{status === 'approved' ? t('Grade') : t('AI draft')}</span>
            <span role="columnheader">{t('Status')}</span>
            <span role="columnheader" aria-hidden />
          </div>
          {items.map((s) => {
            const issues = aiIssues(s);
            const isOpen = open === s._id;
            return (
              <Fragment key={s._id}>
                <div role="row" tabIndex={0} aria-expanded={isOpen} className={`q-row ${isOpen ? 'open' : ''}`} onClick={(e) => !e.target.closest('a,button') && toggle(s._id)} onKeyDown={(e) => rowKey(e, s)}>
                  <span role="cell"><button className="btn btn-ghost icon-btn q-caret" aria-label={isOpen ? t('Hide details') : t('Show details')} aria-expanded={isOpen} onClick={() => toggle(s._id)}><ChevronDown size={16} /></button></span>
                  <span role="cell" className="q-emp"><strong>{s.student?.name}</strong><span className="small muted">{[s.student?.company?.name, s.student?.department].filter(Boolean).join(' · ')}</span></span>
                  <span role="cell" className="q-item"><span className="item-code">{s.assignment?.code}</span><span className="q-title" dir="auto" title={s.assignment?.title}>{s.assignment?.title}</span>{s.attempt > 1 && <span className="chip chip-sm">{t('Attempt {n}', { n: s.attempt })}</span>}</span>
                  <span role="cell" className="small" title={fmtDate(status === 'approved' ? s.final?.reviewedAt : s.createdAt)}>{timeAgo(status === 'approved' ? s.final?.reviewedAt || s.updatedAt : s.createdAt)}</span>
                  <span role="cell" className="q-ai">
                    {status === 'approved' && s.final?.totalScore != null ? <span className="score-pill good"><b>{s.final.totalScore}</b></span> : <AiPill s={s} />}
                    <IssueCount issues={issues} />
                  </span>
                  <span role="cell"><StatusChip status={s.status} /></span>
                  <span role="cell" className="q-open"><Link className={`btn btn-sm ${['ai_graded', 'submitted', 'ai_failed'].includes(s.status) ? 'btn-primary' : ''}`} to={`/review/${s._id}`}>{['ai_graded', 'submitted', 'ai_failed'].includes(s.status) ? t('Review') : t('Open')}</Link></span>
                </div>
                {isOpen && <div className="q-expand" role="row"><Details s={s} issues={issues} busy={busy === s._id} onRetry={() => retry(s)} /></div>}
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
