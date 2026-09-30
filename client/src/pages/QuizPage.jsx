import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Loader, ErrorBox, fmtDate, PageSkeleton } from '../components/ui';

export default function QuizPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(`/quizzes/${id}`);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [startedAt] = useState(() => new Date().toISOString());

  const quiz = data?.quiz;
  const attempts = data?.attempts || [];
  const passed = attempts.some((a) => a.passed);
  const left = quiz?.maxAttempts ? quiz.maxAttempts - attempts.length : Infinity;
  const answered = useMemo(() => (quiz ? quiz.questions.filter((q) => answers[q._id]?.length).length : 0), [answers, quiz]);

  if (loading) return <PageSkeleton variant="detail" />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;

  const pick = (q, i) =>
    setAnswers((a) => {
      const cur = a[q._id] || [];
      if (q.type === 'multiple') return { ...a, [q._id]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] };
      return { ...a, [q._id]: [i] };
    });

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const { data: r } = await api.post(`/quizzes/${id}/attempts`, {
        startedAt,
        answers: quiz.questions.map((q) => ({ questionId: q._id, selected: answers[q._id] || [] })),
      });
      setResult(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const review = result ? new Map(result.review.map((r) => [String(r.questionId), r])) : null;
  const mine = result ? new Map(result.attempt.answers.map((a) => [String(a.questionId), a])) : null;
  const canTake = user.role === 'employee' && !passed && left > 0 && !result;

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <Link to={`/courses/${quiz.course}`} className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> Back to course</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <span className="small muted">Milestone quiz · {quiz.questions.length} questions · pass mark {quiz.passScore}%{quiz.maxAttempts ? ` · ${quiz.maxAttempts} attempts` : ''}</span>
          <h1>{quiz.title}</h1>
          {quiz.description && <p>{quiz.description}</p>}
        </div>
        <span className="spacer" />
        {data.canEdit && <Link className="btn" to={`/quizzes/${quiz._id}/edit`}><Pencil size={15} /> Edit quiz</Link>}
      </div>

      {result && (
        <div className={`quiz-result ${result.attempt.passed ? 'pass' : 'fail'}`}>
          {result.attempt.passed ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
          <div>
            <b>{result.attempt.score}%</b> — {result.attempt.passed ? 'Passed. Nice work!' : `Not passed yet (pass mark ${quiz.passScore}%).`}
            <div className="small">{result.attempt.points} of {result.attempt.maxPoints} points{result.attemptsLeft !== null ? ` · ${result.attemptsLeft} attempt(s) left` : ''}. Review the answers below.</div>
          </div>
          <span className="spacer" />
          {!result.attempt.passed && result.attemptsLeft !== 0 && (
            <button className="btn" onClick={() => { setResult(null); setAnswers({}); reload(); }}><RotateCcw size={15} /> Try again</button>
          )}
        </div>
      )}

      {user.role === 'employee' && attempts.length > 0 && !result && (
        <div className="card small" style={{ marginBottom: 'var(--sp-3)' }}>
          <strong>Your attempts: </strong>
          {attempts.map((a) => <span key={a._id} className={`chip ${a.passed ? 'chip-ok' : 'chip-danger'}`} style={{ marginInlineEnd: 6 }}>#{a.attemptNo} · {a.score}% · {fmtDate(a.createdAt)}</span>)}
          {passed && <p style={{ marginTop: 6 }}>You’ve passed this quiz.</p>}
          {!passed && left <= 0 && <p style={{ marginTop: 6 }}>No attempts left — ask your instructor under Help &amp; support if you need another try.</p>}
        </div>
      )}

      <ErrorBox>{err}</ErrorBox>

      {(canTake || result || data.canEdit) && (
        <ol className="quiz-list">
          {quiz.questions.map((q, qi) => {
            const r = review?.get(String(q._id));
            const my = mine?.get(String(q._id));
            const correctSet = new Set(r?.correct || q.correct || []);
            return (
              <li key={q._id} className={`card quiz-q ${r ? (my?.correct ? 'right' : 'wrong') : ''}`}>
                <div className="quiz-q-head">
                  <span className="task-num">{qi + 1}</span>
                  <div>
                    <p className="quiz-prompt">{q.prompt}</p>
                    <span className="small muted">{q.type === 'multiple' ? 'Select all that apply' : 'Choose one'} · {q.points} pt{q.points !== 1 && 's'}</span>
                  </div>
                </div>
                <div className="quiz-options" role={q.type === 'multiple' ? 'group' : 'radiogroup'} aria-label={`Question ${qi + 1}`}>
                  {q.options.map((o, oi) => {
                    const chosen = r ? my?.selected?.includes(oi) : (answers[q._id] || []).includes(oi);
                    const showKey = Boolean(r) || data.canEdit;
                    const cls = showKey ? (correctSet.has(oi) ? 'is-correct' : chosen ? 'is-wrong' : '') : '';
                    return (
                      <label key={oi} className={`quiz-opt ${chosen ? 'chosen' : ''} ${cls}`}>
                        <input
                          type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                          name={`q-${q._id}`}
                          checked={Boolean(chosen)}
                          disabled={!canTake}
                          onChange={() => pick(q, oi)}
                        />
                        <span>{o}</span>
                      </label>
                    );
                  })}
                </div>
                {(r?.explanation || (data.canEdit && q.explanation)) && <p className="quiz-expl small"><strong>Why: </strong>{r?.explanation || q.explanation}</p>}
              </li>
            );
          })}
        </ol>
      )}

      {canTake && (
        <div className="card row" style={{ position: 'sticky', bottom: 12 }}>
          <span className="small muted">{answered} of {quiz.questions.length} answered</span>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={busy || answered < quiz.questions.length} onClick={submit}>Submit answers</button>
        </div>
      )}
    </div>
  );
}
