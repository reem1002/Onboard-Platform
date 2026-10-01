import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, RotateCcw, Timer } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { ErrorBox, PageSkeleton, fmtDate } from '../components/ui';

/** Instructor / admin view: who attempted, who passed, and which questions people get wrong. */
export default function QuizResults() {
  const { id } = useParams();
  const { data, error, loading, reload } = useFetch(`/quizzes/${id}/results`);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({});

  if (loading) return <PageSkeleton variant="table" />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  const { quiz, rows, items, canGrant } = data;
  const attempted = rows.filter((r) => r.attempts > 0);
  const passed = rows.filter((r) => r.passed).length;
  const best = attempted.map((r) => r.best).filter((x) => x != null);
  const avgBest = best.length ? Math.round(best.reduce((a, b) => a + b, 0) / best.length) : null;

  const grant = async (r) => {
    setBusy(r.student._id);
    setMsg({});
    try {
      await api.post(`/quizzes/${id}/grant`, { student: r.student._id });
      setMsg({ ok: `${r.student.name} can try again — they’ve been notified.` });
      reload();
    } catch (e) { setMsg({ err: errorMessage(e) }); } finally { setBusy(''); }
  };

  return (
    <div className="page">
      <Link to={`/quizzes/${quiz._id}`} className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> Back to quiz</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <span className="small muted">Quiz results · pass mark {quiz.passScore}%{quiz.maxAttempts ? ` · ${quiz.maxAttempts} attempts` : ''}{quiz.timeLimitMinutes ? ` · ${quiz.timeLimitMinutes} min` : ''}</span>
          <h1>{quiz.title}</h1>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b>{rows.length}</b><span>Enrolled</span></div>
        <div className="stat"><b>{attempted.length}</b><span>Attempted</span></div>
        <div className="stat"><b>{passed}</b><span>Passed</span></div>
        <div className="stat"><b>{avgBest ?? '—'}{avgBest != null && '%'}</b><span>Average best score</span></div>
      </div>

      {msg.ok && <div className="alert alert-ok" role="status">{msg.ok}</div>}
      <ErrorBox>{msg.err}</ErrorBox>

      <section className="card card-flush" style={{ marginBottom: 'var(--sp-4)' }}>
        <table className="table">
          <thead><tr><th>Employee</th><th>Attempts</th><th>Best</th><th>Status</th><th>Last attempt</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.student._id}>
                <td data-label="Employee"><strong>{r.student.name}</strong><div className="small muted">{r.company || r.student.email}</div></td>
                <td data-label="Attempts">{r.attempts}{r.allowed ? ` / ${r.allowed}` : ''}</td>
                <td data-label="Best">{r.best != null ? `${r.best}%` : '—'}</td>
                <td data-label="Status">
                  {r.passed ? <span className="chip chip-ok">Passed</span> : r.outOfAttempts ? <span className="chip chip-danger">Out of attempts</span> : r.attempts ? <span className="chip chip-warn">Not passed yet</span> : <span className="chip">Not started</span>}
                  {r.overtime && <span className="chip" title="At least one attempt was submitted after the time limit" style={{ marginInlineStart: 6 }}><Timer size={12} /> late</span>}
                </td>
                <td data-label="Last attempt">{r.lastAt ? fmtDate(r.lastAt) : '—'}</td>
                <td>{canGrant && r.outOfAttempts && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => grant(r)}><RotateCcw size={14} /> {busy === r.student._id ? '…' : 'Allow another try'}</button>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted small">Nobody is enrolled yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2 className="h-card" style={{ marginBottom: 4 }}>Question analysis</h2>
        <p className="small muted" style={{ marginBottom: 'var(--sp-3)' }}>Based on each employee’s latest attempt. Questions most people miss are worth explaining again — or rewording.</p>
        <ol className="qa-list">
          {[...items].sort((a, b) => (a.correctPct ?? 101) - (b.correctPct ?? 101)).map((q) => (
            <li key={q._id} className="qa-item">
              <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <p className="grow" style={{ margin: 0 }}><strong>{q.prompt}</strong></p>
                <span className={`score-pill ${q.correctPct == null ? '' : q.correctPct >= 80 ? 'good' : q.correctPct >= 50 ? 'ok' : 'low'}`}>{q.correctPct == null ? '—' : <><b>{q.correctPct}%</b> correct</>}</span>
              </div>
              <div className="hbars" style={{ marginTop: 8 }}>
                {q.options.map((o, oi) => {
                  const pct = q.answered ? Math.round((q.pick[oi] / q.answered) * 100) : 0;
                  const right = q.correct.includes(oi);
                  return (
                    <div className="hbar" key={oi}>
                      <span className="hbar-label small">{right && <Check size={13} className="text-ok" aria-label="Correct answer" style={{ display: 'inline', verticalAlign: '-2px' }} />} {o}</span>
                      <span className="hbar-track" title={`${q.pick[oi]} of ${q.answered} chose this`}><span className={right ? 'right' : ''} style={{ width: `${pct}%` }} /></span>
                      <span className="hbar-val small">{q.answered ? `${pct}%` : '—'}</span>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
