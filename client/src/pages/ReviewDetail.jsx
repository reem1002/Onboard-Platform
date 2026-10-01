import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Download, FileDown, Plus, RotateCcw, Sparkles, Trash2, Eye, PencilLine, ShieldAlert, Quote, Info, AlertTriangle,
  FileSearch, Check, CloudUpload, Send, Undo2,
} from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { downloadSubmissionFile, downloadFeedbackDocx, downloadFeedbackPdf } from '../api/files';
import FeedbackView from '../components/FeedbackView';
import FileViewer from '../components/FileViewer';
import { ErrorBox, StatusChip, fmtDate, PageSkeleton } from '../components/ui';
import { timeAgo } from '../components/notifications';
import { localizeMessage, aiIssues } from '../lib/aiLabels';
import { useT, useI18n } from '../lib/i18n';

const blankFeedback = { overview: '', strengths: [], improvements: [], closing: '' };
const CONF_HELP = {
  high: 'Every score is backed by quotes from the submission and the checks found nothing unusual.',
  medium: 'Mostly backed by quotes — skim the criteria marked below.',
  low: 'Several scores lack evidence or the file was hard to read. Check the submission before approving.',
};

/** Editable table rows (Strengths / Areas to tighten up) */
function RowsEditor({ rows, fields, onChange, disabled, addLabel }) {
  const t = useT();
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="stack">
      {rows.map((r, i) => (
        <div key={i} className="fb-edit-row">
          <div className="fb-edit-fields">
            {fields.map(([key, label, multiline]) =>
              multiline ? (
                <textarea key={key} className="textarea grow" rows={2} placeholder={t(label)} aria-label={t(label)} disabled={disabled} value={r[key] || ''} onChange={(e) => set(i, { [key]: e.target.value })} />
              ) : (
                <input key={key} className="input" placeholder={t(label)} aria-label={t(label)} disabled={disabled} value={r[key] || ''} onChange={(e) => set(i, { [key]: e.target.value })} />
              )
            )}
          </div>
          {!disabled && (
            <button type="button" className="btn btn-ghost icon-btn" aria-label={t('Remove row')} onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...rows, Object.fromEntries(fields.map(([k]) => [k, '']))])}>
          <Plus size={14} /> {t(addLabel)}
        </button>
      )}
    </div>
  );
}

function stateFrom(s) {
  // Work in progress wins, then the instructor's final (returned work), then the AI draft
  const base = (s.status !== 'approved' && s.reviewDraft) || (s.final?.criteria?.length ? s.final : s.ai || {});
  const scores = {};
  for (const r of s.assignment.rubric) {
    const c = (base.criteria || []).find((x) => String(x.criterionId) === String(r._id));
    scores[r._id] = { score: c?.score ?? 0, comment: c?.comment || '' };
  }
  return {
    scores,
    fb: { overview: base.overview || '', strengths: base.strengths || [], improvements: base.improvements || [], closing: base.closing || '' },
  };
}

export default function ReviewDetail() {
  const t = useT();
  const { lang } = useI18n();
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [sub, setSub] = useState(null);
  const [scores, setScores] = useState({});
  const [fb, setFb] = useState(blankFeedback);
  const [tab, setTab] = useState(params.get('tab') === 'files' ? 'files' : 'edit');
  const [fileIdx, setFileIdx] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState({ at: null, state: 'idle' }); // idle | saving | saved | error
  const [confirm, setConfirm] = useState(null); // 'approve' | 'return'
  const [seenFiles, setSeenFiles] = useState(params.get('tab') === 'files');
  const baseline = useRef('');

  const load = useCallback(() =>
    api.get(`/submissions/${id}`).then(({ data }) => {
      const s = data.submission;
      const st = stateFrom(s);
      setSub(s);
      setScores(st.scores);
      setFb(st.fb);
      baseline.current = JSON.stringify(st);
      setSaved({ at: s.reviewDraft?.savedAt || null, state: s.reviewDraft ? 'saved' : 'idle' });
    }).catch((e) => setError(errorMessage(e))), [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'files') setSeenFiles(true); }, [tab]);

  // While the AI is drafting, check back every 5 s
  useEffect(() => {
    if (sub?.status !== 'ai_grading') return undefined;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [sub?.status, load]);

  const total = useMemo(() => {
    if (!sub) return 0;
    const pct = sub.assignment.rubric.reduce((s, r) => s + ((scores[r._id]?.score || 0) * r.weight) / 100, 0);
    return Math.round(pct * (sub.assignment.maxScore / 100) * 10) / 10;
  }, [scores, sub]);

  const locked = !sub || sub.status === 'approved' || sub.status === 'ai_grading';
  const current = JSON.stringify({ scores, fb });
  const dirty = Boolean(sub) && !locked && current !== baseline.current;

  const criteriaPayload = useMemo(() => (sub ? sub.assignment.rubric.map((r) => ({
    criterionId: r._id, criterion: r.criterion, weight: r.weight,
    score: Number(scores[r._id]?.score || 0), comment: scores[r._id]?.comment || undefined,
  })) : []), [sub, scores]);
  const body = useCallback(() => ({
    criteria: criteriaPayload.map(({ criterionId, score, comment }) => ({ criterionId, score, comment })),
    overview: fb.overview, strengths: fb.strengths, improvements: fb.improvements, closing: fb.closing,
  }), [criteriaPayload, fb]);

  // Autosave 2 s after the last edit — closing the tab never loses work
  const saveDraft = useCallback(async () => {
    setSaved((s) => ({ ...s, state: 'saving' }));
    try {
      const { data } = await api.put(`/submissions/${id}/draft`, body(), { silent: true });
      baseline.current = current;
      setSaved({ at: data.savedAt, state: 'saved' });
    } catch (e) {
      setSaved((s) => ({ ...s, state: 'error' }));
      setError(errorMessage(e));
    }
  }, [id, body, current]);
  useEffect(() => {
    if (!dirty) return undefined;
    const timer = setTimeout(saveDraft, 2000);
    return () => clearTimeout(timer);
  }, [dirty, current, saveDraft]);
  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!sub) return (error ? <div className="page"><ErrorBox>{error}</ErrorBox></div> : <PageSkeleton variant="detail" />);

  const aiFor = (rid) => sub.ai?.criteria?.find((c) => String(c.criterionId) === String(rid));
  const previewFb = { ...fb, criteria: criteriaPayload, totalScore: total, reviewedAt: new Date() };
  const hasDraft = Boolean(sub.ai?.criteria?.length || sub.final?.criteria?.length || sub.reviewDraft);
  const issues = aiIssues(sub);
  const serious = issues.filter((i) => i.severity === 'high');
  const passed = total >= sub.assignment.passScore;
  const canRedraft = ['ai_failed', 'ai_graded', 'submitted', 'returned'].includes(sub.status);

  const decide = async (decision) => {
    // Serious warnings + the file was never opened → ask once more, inline (no browser pop-up)
    if (decision === 'approve' && serious.length && !seenFiles && confirm !== 'approve') { setConfirm('approve'); return; }
    if (decision === 'return' && confirm !== 'return') { setConfirm('return'); return; }
    setBusy(true);
    setError('');
    try {
      await api.post(`/submissions/${id}/review`, { decision, ...body() });
      baseline.current = current; // nothing unsaved any more
      nav('/review');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const regrade = async () => {
    setError('');
    try {
      await api.post(`/submissions/${id}/regrade`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const openFile = (i) => { setFileIdx(i); setTab('files'); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const setScore = (rid, patch) => setScores((s) => ({ ...s, [rid]: { ...s[rid], ...patch } }));

  const SaveState = () => (locked ? null : (
    <span className={`save-state ${saved.state}`} role="status" aria-live="polite">
      {saved.state === 'saving' ? <><span className="spin-dot" /> {t('Saving…')}</>
        : dirty ? <><PencilLine size={13} /> {t('Unsaved changes')}</>
          : saved.state === 'error' ? <><AlertTriangle size={13} /> {t('Not saved')}</>
            : saved.at ? <><Check size={13} /> {t('Draft saved {x}', { x: timeAgo(saved.at) })}</>
              : <><Sparkles size={13} /> {t('Your edits save automatically')}</>}
    </span>
  ));

  const Actions = ({ compact }) => (
    <>
      {confirm === 'approve' && (
        <div className="confirm-box" role="alert">
          <AlertTriangle size={15} />
          <span>{t('The checks found serious problems and you haven’t opened the file yet. Approve anyway?')}</span>
          <div className="row"><button className="btn btn-sm" onClick={() => { setConfirm(null); openFile(0); }}>{t('Open the file')}</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide('approve')}>{t('Approve anyway')}</button></div>
        </div>
      )}
      {confirm === 'return' && (
        <div className="confirm-box" role="alert">
          <Undo2 size={15} />
          <span>{t('The employee will see your feedback and must resubmit. Make sure “Areas to tighten up” says what to fix.')}</span>
          <div className="row"><button className="btn btn-sm" onClick={() => setConfirm(null)}>{t('Cancel')}</button><button className="btn btn-danger btn-sm" disabled={busy} onClick={() => decide('return')}>{t('Return for rework')}</button></div>
        </div>
      )}
      {!confirm && (
        <div className={compact ? 'row' : 'stack'} style={{ gap: 8 }}>
          <button className="btn btn-primary" disabled={busy} onClick={() => decide('approve')}><Send size={15} /> {t('Approve & send feedback')}</button>
          <button className="btn btn-danger" disabled={busy} onClick={() => decide('return')}><Undo2 size={15} /> {compact ? t('Return') : t('Return for rework')}</button>
        </div>
      )}
    </>
  );

  return (
    <div className="page review-page">
      <Link to="/review" className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> {t('Review queue')}</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <span className="small muted">{sub.assignment.code} · {t('attempt {n}', { n: sub.attempt })} · {fmtDate(sub.createdAt)}</span>
          <h1>{sub.student.name}</h1>
          <p>{sub.assignment.title}</p>
        </div>
        <span className="spacer" />
        <StatusChip status={sub.status} />
      </div>
      <ErrorBox>{error}</ErrorBox>

      <div className="review-layout">
        <div className="stack">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'files'} className={tab === 'files' ? 'active' : ''} onClick={() => setTab('files')}><FileSearch size={15} /> {t('Submission')}{sub.files.length > 1 ? ` (${sub.files.length})` : ''}</button>
            <button role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}><PencilLine size={15} /> {t('Grade & feedback')}</button>
            <button role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}><Eye size={15} /> {t('Preview as employee')}</button>
            <span className="spacer" />
            <SaveState />
          </div>

          {sub.status === 'ai_grading' && (
            <div className="alert alert-ok row"><span className="spin-dot" /> {t('The AI is drafting this grade — the page updates by itself. You can read the submission meanwhile.')}</div>
          )}

          {/* What the AI did and how much to trust it — always visible above the editor */}
          {tab !== 'files' && sub.status !== 'ai_grading' && (sub.ai?.model || sub.ai?.error || issues.length > 0) && (
            <section className={`card ai-summary ${sub.ai?.error && sub.ai?.totalScore == null ? 'failed' : `conf-${sub.ai?.confidence || 'medium'}`}`}>
              <div className="row" style={{ alignItems: 'flex-start' }}>
                <span className="ai-summary-icon"><Sparkles size={18} /></span>
                <div className="grow">
                  {sub.ai?.error && sub.ai?.totalScore == null ? (
                    <><strong>{t('No AI draft — grade this one yourself')}</strong><p className="small">{sub.ai.error}</p></>
                  ) : (
                    <>
                      <strong>{t('AI draft: {score}/{max} · {c} confidence', { score: sub.ai.totalScore, max: sub.assignment.maxScore, c: t(sub.ai.confidence === 'high' ? 'High' : sub.ai.confidence === 'low' ? 'Low' : 'Medium').toLowerCase() })}</strong>
                      <p className="small">{t(CONF_HELP[sub.ai.confidence] || CONF_HELP.medium)}</p>
                    </>
                  )}
                  {sub.ai?.model && <p className="small muted">{sub.ai.provider === 'local' ? t('In-house model') : 'Claude'} · {sub.ai.model}{sub.ai.durationMs ? ` · ${Math.round(sub.ai.durationMs / 1000)} s` : ''}{sub.ai.gradedAt ? ` · ${timeAgo(sub.ai.gradedAt)}` : ''}</p>}
                </div>
                {canRedraft && <button className="btn btn-sm" onClick={regrade} title={t('Run the AI again (e.g. after changing the model or the rubric)')}><RotateCcw size={14} /> {sub.ai?.totalScore != null ? t('Re-draft') : t('Retry AI')}</button>}
              </div>
              {issues.length > 0 && (
                <ul className="checks" style={{ marginTop: 10 }}>
                  {issues.map((c) => (
                    <li key={c.kind} className={`sev-${c.severity}`}>
                      {c.severity === 'info' ? <Info size={14} /> : <AlertTriangle size={14} />}
                      <span><strong>{t(c.label)}</strong>{c.message && <span className="small"> — {t(localizeMessage(c.message, lang))}</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
              {serious.length > 0 && !seenFiles && <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => openFile(0)}><FileSearch size={14} /> {t('Open the submission')}</button>}
            </section>
          )}

          {!hasDraft && !sub.ai?.error && sub.status !== 'ai_grading' && tab === 'edit' && (
            <div className="alert alert-ok">{t('No AI draft for this submission — fill in the scores and feedback below.')}</div>
          )}

          {tab === 'files' ? (
            <FileViewer files={sub.files} source={{ type: 'submission', id: sub._id }} initial={fileIdx} height="calc(100dvh - 260px)" />
          ) : tab === 'preview' ? (
            <div className="card fb-sheet"><FeedbackView sub={sub} fb={previewFb} /></div>
          ) : (
            <>
              <div className="card">
                <h3 style={{ marginBottom: 4 }}>{t('Grading breakdown')}</h3>
                <p className="small muted" style={{ marginBottom: 6 }}>{t('Start here — the total and the overview follow these scores.')}</p>
                {sub.assignment.rubric.map((r) => {
                  const ai = aiFor(r._id);
                  const changed = ai && Number(scores[r._id]?.score) !== ai.score;
                  const noEvidence = ai && !ai.evidence?.length && sub.ai?.provider === 'local' && ai.score >= 50;
                  return (
                    <div className={`crit ${noEvidence ? 'crit-warn' : ''}`} key={r._id}>
                      <div className="crit-head">
                        <span className="name">{r.criterion}</span>
                        <span className="small muted">{t('weight {n}%', { n: r.weight })}</span>
                        {ai && <span className={`ai-badge ${changed ? 'edited' : ''}`} title={changed ? t('You changed the AI score') : ''}><Sparkles size={12} /> {t('AI {n}%', { n: ai.score })}{changed && ` · ${t('edited')}`}</span>}
                      </div>
                      {r.guidance && <p className="small muted crit-guide">{r.guidance}</p>}
                      <div className="score-input">
                        <input type="range" min={0} max={100} step={5} disabled={locked} value={scores[r._id]?.score ?? 0} onChange={(e) => setScore(r._id, { score: Number(e.target.value) })} aria-label={t('Score for {x}', { x: r.criterion })} />
                        <input type="number" min={0} max={100} className="input" disabled={locked} value={scores[r._id]?.score ?? 0} onChange={(e) => setScore(r._id, { score: Math.max(0, Math.min(100, Number(e.target.value))) })} aria-label={t('Score %')} />
                        <span>%</span>
                      </div>
                      {ai?.evidence?.length > 0 && (
                        <ul className="evidence" aria-label={t('Evidence the AI found in the submission')}>
                          {ai.evidence.map((q, i) => <li key={i}><Quote size={12} /> {q}</li>)}
                        </ul>
                      )}
                      {noEvidence && <p className="small evidence-missing"><AlertTriangle size={12} /> {t('The AI gave {n}% without quoting the submission — check this one.', { n: ai.score })}</p>}
                      <input className="input" disabled={locked} placeholder={t('Notes (short, e.g. “Accurate hierarchy; missing description”)')} value={scores[r._id]?.comment || ''} onChange={(e) => setScore(r._id, { comment: e.target.value })} />
                    </div>
                  );
                })}
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 4 }}>{t('Overview')}</h3>
                <p className="small muted" style={{ marginBottom: 8 }}>{t('One sentence verdict. Write the score as “{n}/100” — it is kept equal to the final total and shown in bold.', { n: total })}</p>
                <textarea className="textarea grow" rows={2} disabled={locked} value={fb.overview} onChange={(e) => setFb({ ...fb, overview: e.target.value })} placeholder={`${sub.student.name}'s ${sub.assignment.code} submission earned ${total}/100 — …`} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 10 }}>{t('Strengths')}</h3>
                <RowsEditor rows={fb.strengths} disabled={locked} addLabel={t('Strength')} onChange={(strengths) => setFb({ ...fb, strengths })}
                  fields={[['task', 'Task (e.g. Task 4 — Escalation trigger criteria)'], ['detail', 'What stood out', true]]} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 10 }}>{t('Areas to tighten up')}</h3>
                <RowsEditor rows={fb.improvements} disabled={locked} addLabel={t('Area')} onChange={(improvements) => setFb({ ...fb, improvements })}
                  fields={[['task', 'Task'], ['issue', 'Issue — what the brief asked vs what was submitted', true], ['suggestion', 'Suggestion — a concrete fix', true]]} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 8 }}>{t('Closing line')}</h3>
                <input className="input" disabled={locked} value={fb.closing} onChange={(e) => setFb({ ...fb, closing: e.target.value })} placeholder={t('Solid work overall — …')} />
              </div>
            </>
          )}
        </div>

        <aside className="stack">
          <div className="card stack">
            <div className="row"><span className="total">{total}</span><span className="muted">/ {sub.assignment.maxScore}</span><span className="spacer" />{passed ? <span className="chip chip-ok">{t('Pass')}</span> : <span className="chip chip-danger">{t('Below pass')}</span>}</div>
            <p className="small muted" style={{ marginTop: -6 }}>{t('Pass mark {n}', { n: sub.assignment.passScore })}{sub.ai?.totalScore != null && total !== sub.ai.totalScore ? ` · ${t('AI draft {n}', { n: sub.ai.totalScore })}` : ''}</p>
            {!locked && <Actions />}
            {sub.status === 'approved' && <p className="small"><Check size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {t('Approved {x} — the employee has the feedback.', { x: fmtDate(sub.final?.reviewedAt) })}</p>}
            {hasDraft && (
              <div className="row">
                <button className="btn btn-sm" onClick={() => downloadFeedbackPdf(sub._id)}><FileDown size={14} /> {sub.status === 'approved' ? t('Feedback PDF') : t('Draft PDF')}</button>
                <button className="btn btn-sm" onClick={() => downloadFeedbackDocx(sub._id)}><FileDown size={14} /> Word</button>
              </div>
            )}
            {!locked && hasDraft && <p className="small muted">{t('PDF/Word show the AI draft or the last approved version, not unsent edits.')}</p>}
          </div>

          <div className="card stack">
            <h3>{t('Files')}</h3>
            {sub.files.map((f, i) => (
              <div key={i} className="file-row">
                <button className="file-link" title={t('View {x}', { x: f.originalName })} onClick={() => openFile(i)}>
                  <FileSearch size={14} /> <span>{f.originalName}</span>
                </button>
                <button className="btn btn-ghost icon-btn" aria-label={t('Download {x}', { x: f.originalName })} title={t('Download')} onClick={() => downloadSubmissionFile(sub._id, i, f.originalName)}><Download size={14} /></button>
              </div>
            ))}
            {sub.note && <><h3>{t('Employee note')}</h3><p className="small">{sub.note}</p></>}
          </div>
          {!locked && <p className="small muted" style={{ display: 'flex', gap: 6 }}><CloudUpload size={14} style={{ flex: 'none', marginTop: 2 }} /> {t('Edits are saved as a private draft. The employee only sees feedback after you approve or return it.')}</p>}
          {issues.length > 0 && tab === 'files' && (
            <div className="card stack">
              <div className="row"><ShieldAlert size={16} /><h3>{t('Automatic checks')}</h3></div>
              <ul className="checks">
                {issues.map((c) => (
                  <li key={c.kind} className={`sev-${c.severity}`}>
                    {c.severity === 'info' ? <Info size={14} /> : <AlertTriangle size={14} />}
                    <span><strong>{t(c.label)}</strong>{c.message && <span className="small"> — {t(localizeMessage(c.message, lang))}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Phones: the total and the decision stay within thumb reach */}
      {!locked && (
        <div className="review-bar mobile-only">
          <span className="total-sm"><b>{total}</b>/{sub.assignment.maxScore}</span>
          <span className="spacer" />
          <Actions compact />
        </div>
      )}
    </div>
  );
}
