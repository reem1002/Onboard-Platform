import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileDown, Plus, RotateCcw, Sparkles, Trash2, Eye, PencilLine, ShieldAlert, Quote, Info, AlertTriangle } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { downloadSubmissionFile, downloadFeedbackDocx, downloadFeedbackPdf } from '../api/files';
import FeedbackView from '../components/FeedbackView';
import { Loader, ErrorBox, StatusChip, fmtDate, PageSkeleton } from '../components/ui';

const CHECK_LABEL = {
  too_short: 'Very little text', unreadable_file: 'Unreadable file', prompt_injection_attempt: 'Tries to instruct the AI',
  tasks_possibly_missing: 'Tasks possibly missing', copied_from_brief: 'Copied from the brief', similar_to_peer: 'Similar to a colleague',
  truncated_for_ai: 'Long submission',
};
const FLAG_HELP = {
  unsupported_score: 'A criterion scored 50%+ but the AI could not quote supporting text',
  quote_not_found: 'The AI quoted text that is not in the submission — it was removed',
  inconsistent_runs: 'Repeated AI runs disagreed by more than 15 points',
};

const blankFeedback = { overview: '', strengths: [], improvements: [], closing: '' };

/** Editable table rows (Strengths / Areas to tighten up) */
function RowsEditor({ rows, fields, onChange, disabled, addLabel }) {
  const set = (i, patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="stack">
      {rows.map((r, i) => (
        <div key={i} className="fb-edit-row">
          <div className="fb-edit-fields">
            {fields.map(([key, label, multiline]) =>
              multiline ? (
                <textarea key={key} className="textarea" style={{ minHeight: 84 }} rows={3} placeholder={label} aria-label={label} disabled={disabled} value={r[key] || ''} onChange={(e) => set(i, { [key]: e.target.value })} />
              ) : (
                <input key={key} className="input" placeholder={label} aria-label={label} disabled={disabled} value={r[key] || ''} onChange={(e) => set(i, { [key]: e.target.value })} />
              )
            )}
          </div>
          {!disabled && (
            <button type="button" className="btn btn-ghost icon-btn" aria-label="Remove row" onClick={() => onChange(rows.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...rows, Object.fromEntries(fields.map(([k]) => [k, '']))])}>
          <Plus size={14} /> {addLabel}
        </button>
      )}
    </div>
  );
}

export default function ReviewDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [sub, setSub] = useState(null);
  const [scores, setScores] = useState({});
  const [fb, setFb] = useState(blankFeedback);
  const [tab, setTab] = useState('edit');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () =>
    api.get(`/submissions/${id}`).then(({ data }) => {
      const s = data.submission;
      setSub(s);
      // Start from the final (if already reviewed) or the AI draft
      const base = s.final?.criteria?.length ? s.final : s.ai || {};
      const init = {};
      for (const r of s.assignment.rubric) {
        const c = (base.criteria || []).find((x) => String(x.criterionId) === String(r._id));
        init[r._id] = { score: c?.score ?? 0, comment: c?.comment || '' };
      }
      setScores(init);
      setFb({
        overview: base.overview || '',
        strengths: base.strengths?.length ? base.strengths : [],
        improvements: base.improvements?.length ? base.improvements : [],
        closing: base.closing || '',
      });
    }).catch((e) => setError(errorMessage(e)));

  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = useMemo(() => {
    if (!sub) return 0;
    const pct = sub.assignment.rubric.reduce((s, r) => s + ((scores[r._id]?.score || 0) * r.weight) / 100, 0);
    return Math.round(pct * (sub.assignment.maxScore / 100) * 10) / 10;
  }, [scores, sub]);

  if (!sub) return (error ? <div className="page"><ErrorBox>{error}</ErrorBox></div> : <PageSkeleton variant="detail" />);
  const locked = sub.status === 'approved' || sub.status === 'ai_grading';
  const aiFor = (rid) => sub.ai?.criteria?.find((c) => String(c.criterionId) === String(rid));
  const criteriaPayload = sub.assignment.rubric.map((r) => ({
    criterionId: r._id, criterion: r.criterion, weight: r.weight,
    score: Number(scores[r._id]?.score || 0), comment: scores[r._id]?.comment || undefined,
  }));
  const previewFb = { ...fb, criteria: criteriaPayload, totalScore: total, reviewedAt: new Date() };
  const hasDraft = Boolean(sub.ai?.criteria?.length || sub.final?.criteria?.length);

  const decide = async (decision) => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/submissions/${id}/review`, {
        decision,
        criteria: criteriaPayload.map(({ criterionId, score, comment }) => ({ criterionId, score, comment })),
        overview: fb.overview,
        strengths: fb.strengths,
        improvements: fb.improvements,
        closing: fb.closing,
      });
      nav('/review');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const regrade = async () => {
    try {
      await api.post(`/submissions/${id}/regrade`);
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const setScore = (rid, patch) => setScores((s) => ({ ...s, [rid]: { ...s[rid], ...patch } }));

  return (
    <div className="page">
      <Link to="/review" className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> Review queue</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <span className="small muted">{sub.assignment.code} · attempt {sub.attempt} · {fmtDate(sub.createdAt)}</span>
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
            <button role="tab" aria-selected={tab === 'edit'} className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}><PencilLine size={15} /> Edit feedback</button>
            <button role="tab" aria-selected={tab === 'preview'} className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}><Eye size={15} /> Preview as employee</button>
            <span className="spacer" />
            {sub.ai?.model && sub.ai?.confidence && (
              <span className={`ai-badge conf-${sub.ai.confidence}`} title={`${sub.ai.provider === 'local' ? 'In-house model' : 'Claude'} · ${sub.ai.model}${sub.ai.durationMs ? ` · ${Math.round(sub.ai.durationMs / 1000)} s` : ''}`}>
                <Sparkles size={13} /> AI draft · {sub.ai.confidence} confidence
              </span>
            )}
          </div>

          {sub.status === 'ai_failed' && (
            <div className="alert alert-error">
              AI grading failed ({sub.ai?.error}). Grade manually or retry.
              <button className="btn btn-sm" style={{ marginInlineStart: 8 }} onClick={regrade}><RotateCcw size={13} /> Retry AI</button>
            </div>
          )}
          {!hasDraft && sub.status !== 'ai_failed' && (
            <div className="alert alert-ok">No AI draft for this submission — fill in the scores and feedback below.</div>
          )}

          {tab === 'preview' ? (
            <div className="card fb-sheet"><FeedbackView sub={sub} fb={previewFb} /></div>
          ) : (
            <>
              <div className="card">
                <h3 style={{ marginBottom: 4 }}>Overview</h3>
                <p className="small muted" style={{ marginBottom: 8 }}>One sentence verdict. Type the score as “{total}/100” and it will be updated in bold automatically.</p>
                <textarea className="textarea" disabled={locked} value={fb.overview} onChange={(e) => setFb({ ...fb, overview: e.target.value })} placeholder={`${sub.student.name}'s ${sub.assignment.code} submission earned ${total}/100 — …`} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 10 }}>Strengths</h3>
                <RowsEditor rows={fb.strengths} disabled={locked} addLabel="Strength" onChange={(strengths) => setFb({ ...fb, strengths })}
                  fields={[['task', 'Task (e.g. Task 4 — Escalation trigger criteria)'], ['detail', 'What stood out', true]]} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 10 }}>Areas to tighten up</h3>
                <RowsEditor rows={fb.improvements} disabled={locked} addLabel="Area" onChange={(improvements) => setFb({ ...fb, improvements })}
                  fields={[['task', 'Task'], ['issue', 'Issue — what the brief asked vs what was submitted', true], ['suggestion', 'Suggestion — a concrete fix', true]]} />
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 4 }}>Grading breakdown</h3>
                {sub.assignment.rubric.map((r) => {
                  const ai = aiFor(r._id);
                  const changed = ai && Number(scores[r._id]?.score) !== ai.score;
                  return (
                    <div className="crit" key={r._id}>
                      <div className="crit-head">
                        <span className="name">{r.criterion}</span>
                        <span className="small muted">weight {r.weight}%</span>
                        {ai && <span className="ai-badge"><Sparkles size={12} /> AI {ai.score}%{changed && ' · edited'}</span>}
                      </div>
                      <div className="score-input">
                        <input type="range" min={0} max={100} step={5} disabled={locked} value={scores[r._id]?.score ?? 0} onChange={(e) => setScore(r._id, { score: Number(e.target.value) })} aria-label={`Score for ${r.criterion}`} />
                        <input type="number" min={0} max={100} className="input" disabled={locked} value={scores[r._id]?.score ?? 0} onChange={(e) => setScore(r._id, { score: Math.max(0, Math.min(100, Number(e.target.value))) })} aria-label="Score %" />
                        <span>%</span>
                      </div>
                      {ai?.evidence?.length > 0 && (
                        <ul className="evidence" aria-label="Evidence the AI found in the submission">
                          {ai.evidence.map((q, i) => <li key={i}><Quote size={12} /> {q}</li>)}
                        </ul>
                      )}
                      {ai && !ai.evidence?.length && sub.ai?.provider === 'local' && ai.score >= 50 && (
                        <p className="small evidence-missing"><AlertTriangle size={12} /> The AI gave {ai.score}% without quoting the submission — check this one.</p>
                      )}
                      <input className="input" disabled={locked} placeholder="Notes (short, e.g. “Accurate hierarchy; missing description”)" value={scores[r._id]?.comment || ''} onChange={(e) => setScore(r._id, { comment: e.target.value })} />
                    </div>
                  );
                })}
              </div>

              <div className="card">
                <h3 style={{ marginBottom: 8 }}>Closing line</h3>
                <input className="input" disabled={locked} value={fb.closing} onChange={(e) => setFb({ ...fb, closing: e.target.value })} placeholder="Solid work overall — …" />
              </div>
            </>
          )}
        </div>

        <aside className="stack">
          <div className="card stack">
            <div className="row"><span className="total">{total}</span><span className="muted">/ {sub.assignment.maxScore}</span><span className="spacer" />{total >= sub.assignment.passScore ? <span className="chip chip-ok">Pass</span> : <span className="chip chip-danger">Below pass</span>}</div>
            {!locked && (
              <>
                <button className="btn btn-primary" disabled={busy} onClick={() => decide('approve')}>Approve & send feedback</button>
                <button className="btn btn-danger" disabled={busy} onClick={() => decide('return')}>Return for rework</button>
              </>
            )}
            {hasDraft && (
              <div className="row">
                <button className="btn" onClick={() => downloadFeedbackPdf(sub._id)}>
                  <FileDown size={15} /> {sub.status === 'approved' ? 'Feedback PDF' : 'Draft PDF'}
                </button>
                <button className="btn" onClick={() => downloadFeedbackDocx(sub._id)}>
                  <FileDown size={15} /> Word
                </button>
              </div>
            )}
            {!locked && hasDraft && <p className="small muted">Downloads reflect the last saved version, not unsaved edits. Employees receive the PDF.</p>}
          </div>

          <div className="card stack">
            <h3>Files</h3>
            {sub.files.map((f, i) => (
              <button key={i} className="file-link" title={f.originalName} onClick={() => downloadSubmissionFile(sub._id, i, f.originalName)}>
                <Download size={14} /> <span>{f.originalName}</span>
              </button>
            ))}
            {sub.note && <><h3>Employee note</h3><p className="small">{sub.note}</p></>}
          </div>

          {sub.ai?.checks?.length > 0 && (
            <div className="card stack">
              <div className="row"><ShieldAlert size={16} /><h3>Automatic checks</h3></div>
              <ul className="checks">
                {sub.ai.checks.map((c, i) => (
                  <li key={i} className={`sev-${c.severity}`}>
                    {c.severity === 'info' ? <Info size={14} /> : <AlertTriangle size={14} />}
                    <span><strong>{CHECK_LABEL[c.kind] || c.kind.replaceAll('_', ' ')}</strong><span className="small"> — {c.message}</span></span>
                  </li>
                ))}
              </ul>
              <p className="small muted">Checks never change the score — they tell you where to look.</p>
            </div>
          )}
          {sub.ai?.flags?.filter((f) => !(sub.ai.checks || []).some((c) => c.kind === f)).length > 0 && (
            <div className="card stack">
              <h3>AI flags</h3>
              <div className="row">{sub.ai.flags.filter((f) => !(sub.ai.checks || []).some((c) => c.kind === f)).map((f) => <span key={f} className="chip chip-warn" title={FLAG_HELP[f] || ''}>{f.replaceAll('_', ' ')}</span>)}</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
