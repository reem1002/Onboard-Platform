import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, CheckCircle2, XCircle, RotateCcw, Timer, BarChart3, Play } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Loader, ErrorBox, fmtDate, PageSkeleton } from '../components/ui';
import { useT } from '../lib/i18n';

export default function QuizPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const t = useT();
  const { data, error, loading, reload } = useFetch(`/quizzes/${id}`);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState(null); // { startedAt, endsAt } from the server
  const [now, setNow] = useState(Date.now());
  const submitted = useRef(false);

  const quiz = data?.quiz;
  const attempts = data?.attempts || [];
  const passed = attempts.some((a) => a.passed);
  const allowed = data?.allowedAttempts ?? quiz?.maxAttempts;
  const left = allowed ? allowed - attempts.length : Infinity;
  const answered = useMemo(() => (quiz ? quiz.questions.filter((q) => answers[q._id]?.length).length : 0), [answers, quiz]);

  // Resume an attempt that was already started (page reload)
  useEffect(() => { if (data?.openAttempt && !session) setSession(data.openAttempt); }, [data, session]);

  // Shuffle once per attempt (display order only — answers are sent with the original option numbers)
  const order = useMemo(() => {
    if (!quiz) return null;
    const rand = (n) => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const on = quiz.shuffle !== false && user.role === 'employee';
    return { q: on ? rand(quiz.questions.length) : [...quiz.questions.keys()], o: Object.fromEntries(quiz.questions.map((q) => [q._id, on && q.type !== 'true_false' ? rand(q.options.length) : [...q.options.keys()]])) };
  }, [quiz, user.role, session?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const timed = Boolean(quiz?.timeLimitMinutes);
  const remaining = session?.endsAt ? Math.max(0, new Date(session.endsAt).getTime() - now) : null;
  useEffect(() => {
    if (!session?.endsAt || result) return undefined;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [session, result]);

  const submit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setErr('');
    try {
      const { data: r } = await api.post(`/quizzes/${id}/attempts`, {
        answers: (quiz?.questions || []).map((q) => ({ questionId: q._id, selected: answers[q._id] || [] })),
      });
      setResult(r);
      setSession(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      submitted.current = false;
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [answers, id, quiz]);

  // Time's up → submit whatever is answered
  useEffect(() => { if (remaining === 0 && session && !result) submit(); }, [remaining, session, result, submit]);

  if (loading) return <PageSkeleton variant="detail" />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;

  const pick = (q, i) =>
    setAnswers((a) => {
      const cur = a[q._id] || [];
      if (q.type === 'multiple') return { ...a, [q._id]: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] };
      return { ...a, [q._id]: [i] };
    });

  const start = async () => {
    setErr('');
    try {
      const { data: s2 } = await api.post(`/quizzes/${id}/start`);
      submitted.current = false;
      setNow(Date.now());
      setSession(s2);
    } catch (e) { setErr(errorMessage(e)); }
  };


  const review = result ? new Map(result.review.map((r) => [String(r.questionId), r])) : null;
  const mine = result ? new Map(result.attempt.answers.map((a) => [String(a.questionId), a])) : null;
  const eligible = user.role === 'employee' && !passed && left > 0 && !result;
  const canTake = eligible && (session || !timed);
  const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <Link to={`/courses/${quiz.course}`} className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> {t('Back to course')}</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <span className="small muted">{t('Milestone quiz')} · {t('{n} questions', { n: quiz.questions.length })} · {t('pass mark {n}%', { n: quiz.passScore })}{allowed ? ` · ${t('{n} attempts', { n: allowed })}` : ''}{timed ? ` · ${t('{n} min', { n: quiz.timeLimitMinutes })}` : ''}</span>
          <h1>{quiz.title}</h1>
          {quiz.description && <p>{quiz.description}</p>}
        </div>
        <span className="spacer" />
        {user.role !== 'employee' && <Link className="btn" to={`/quizzes/${quiz._id}/results`}><BarChart3 size={15} /> {t('Results')}</Link>}
        {data.canEdit && <Link className="btn" to={`/quizzes/${quiz._id}/edit`}><Pencil size={15} /> {t('Edit quiz')}</Link>}
      </div>

      {result && (
        <div className={`quiz-result ${result.attempt.passed ? 'pass' : 'fail'}`}>
          {result.attempt.passed ? <CheckCircle2 size={28} /> : <XCircle size={28} />}
          <div>
            <b>{result.attempt.score}%</b> — {result.attempt.passed ? t('Passed. Nice work!') : t('Not passed yet (pass mark {n}%).', { n: quiz.passScore })}
            <div className="small">{t('{a} of {b} points', { a: result.attempt.points, b: result.attempt.maxPoints })}{result.attemptsLeft !== null ? ` · ${t('{n} attempt(s) left', { n: result.attemptsLeft })}` : ''}. {t('Review the answers below.')}</div>
          </div>
          <span className="spacer" />
          {!result.attempt.passed && result.attemptsLeft !== 0 && (
            <button className="btn" onClick={() => { setResult(null); setAnswers({}); setSession(null); submitted.current = false; reload(); }}><RotateCcw size={15} /> {t('Try again')}</button>
          )}
        </div>
      )}

      {user.role === 'employee' && attempts.length > 0 && !result && (
        <div className="card small" style={{ marginBottom: 'var(--sp-3)' }}>
          <strong>{t('Your attempts:')} </strong>
          {attempts.map((a) => <span key={a._id} className={`chip ${a.passed ? 'chip-ok' : 'chip-danger'}`} style={{ marginInlineEnd: 6 }}>#{a.attemptNo} · {a.score}%{a.overtime ? ` · ${t('late')}` : ''} · {fmtDate(a.createdAt)}</span>)}
          {passed && <p style={{ marginTop: 6 }}>{t('You’ve passed this quiz.')}</p>}
          {!passed && left <= 0 && <p style={{ marginTop: 6 }}>{t('No attempts left — ask your instructor under Help & support if you need another try.')}</p>}
        </div>
      )}

      <ErrorBox>{err}</ErrorBox>

      {eligible && timed && !session && (
        <div className="card quiz-start">
          <Timer size={28} />
          <div>
            <strong>{t('This quiz is timed: {n} minutes.', { n: quiz.timeLimitMinutes })}</strong>
            <p className="small muted">{t('The timer starts when you press Start and keeps running if you leave the page. When time is up your answers are submitted automatically.')}</p>
          </div>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={start}><Play size={15} /> {t('Start quiz')}</button>
        </div>
      )}

      {(canTake || result || data.canEdit) && (
        <ol className="quiz-list">
          {(order?.q || []).map((origIdx, qi) => {
            const q = quiz.questions[origIdx];
            const r = review?.get(String(q._id));
            const my = mine?.get(String(q._id));
            const correctSet = new Set(r?.correct || q.correct || []);
            return (
              <li key={q._id} className={`card quiz-q ${r ? (my?.correct ? 'right' : 'wrong') : ''}`}>
                <div className="quiz-q-head">
                  <span className="task-num">{qi + 1}</span>
                  <div>
                    <p className="quiz-prompt">{q.prompt}</p>
                    <span className="small muted">{q.type === 'multiple' ? t('Select all that apply') : t('Choose one')} · {t('{n} pt', { n: q.points })}</span>
                  </div>
                </div>
                <div className="quiz-options" role={q.type === 'multiple' ? 'group' : 'radiogroup'} aria-label={t('Question {n}', { n: qi + 1 })}>
                  {(order?.o[q._id] || [...q.options.keys()]).map((oi) => {
                    const o = q.options[oi];
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
                {(r?.explanation || (data.canEdit && q.explanation)) && <p className="quiz-expl small"><strong>{t('Why:')} </strong>{r?.explanation || q.explanation}</p>}
              </li>
            );
          })}
        </ol>
      )}

      {canTake && (
        <div className="card row" style={{ position: 'sticky', bottom: 12 }}>
          {remaining !== null && <span className={`quiz-timer ${remaining < 60000 ? 'low' : ''}`} role="timer" aria-live="off"><Timer size={15} /> {mmss(remaining)}</span>}
          <span className="small muted">{t('{a} of {b} answered', { a: answered, b: quiz.questions.length })}</span>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={busy || (answered < quiz.questions.length && remaining !== 0)} onClick={submit}>{t('Submit answers')}</button>
        </div>
      )}
    </div>
  );
}
