import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { Loader, ErrorBox, PageSkeleton } from '../components/ui';
import { useT } from '../lib/i18n';

const newQuestion = () => ({ type: 'single', prompt: '', options: ['', '', '', ''], correct: [0], explanation: '', points: 1 });

export default function QuizEditor() {
  const t = useT();
  const { courseId, id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [f, setF] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (id) api.get(`/quizzes/${id}`).then(({ data }) => setF(data.quiz)).catch((e) => setErr(errorMessage(e)));
    else setF({ milestoneId: params.get('milestone'), title: '', description: '', passScore: 70, maxAttempts: 3, timeLimitMinutes: '', shuffle: true, isPublished: false, questions: [newQuestion()] });
  }, [id, params]);

  if (!f) return (err ? <div className="page"><ErrorBox>{err}</ErrorBox></div> : <PageSkeleton variant="detail" />);

  const up = (patch) => setF((x) => ({ ...x, ...patch }));
  const setQ = (i, patch) => up({ questions: f.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const moveQ = (i, d) => { const qs = [...f.questions]; [qs[i], qs[i + d]] = [qs[i + d], qs[i]]; up({ questions: qs }); };

  const setType = (i, type) => {
    const q = f.questions[i];
    if (type === 'true_false') return setQ(i, { type, options: ['True', 'False'], correct: [0] });
    return setQ(i, { type, options: q.type === 'true_false' ? ['', '', '', ''] : q.options, correct: type === 'multiple' ? q.correct : [q.correct[0] ?? 0] });
  };
  const toggleCorrect = (i, oi) => {
    const q = f.questions[i];
    if (q.type !== 'multiple') return setQ(i, { correct: [oi] });
    const c = q.correct.includes(oi) ? q.correct.filter((x) => x !== oi) : [...q.correct, oi];
    setQ(i, { correct: c.length ? c : q.correct });
  };
  const removeOption = (i, oi) => {
    const q = f.questions[i];
    if (q.options.length <= 2) return;
    const options = q.options.filter((_, k) => k !== oi);
    const correct = q.correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c));
    setQ(i, { options, correct: correct.length ? correct : [0] });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const body = {
        milestoneId: f.milestoneId,
        title: f.title,
        description: f.description || undefined,
        passScore: Number(f.passScore),
        maxAttempts: Number(f.maxAttempts),
        timeLimitMinutes: f.timeLimitMinutes === '' || f.timeLimitMinutes == null ? null : Number(f.timeLimitMinutes),
        shuffle: f.shuffle !== false,
        isPublished: f.isPublished,
        questions: f.questions.map(({ _id, type, prompt, options, correct, explanation, points }) => ({
          ...(_id ? { _id } : {}), type, prompt, options, correct, explanation: explanation || undefined, points: Number(points),
        })),
      };
      if (id) {
        await api.patch(`/quizzes/${id}`, body);
        nav(`/quizzes/${id}`);
      } else {
        const { data } = await api.post('/quizzes', { ...body, courseId });
        nav(`/quizzes/${data.quiz._id}`);
      }
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  const back = id ? `/quizzes/${id}` : `/courses/${courseId}`;
  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <Link to={back} className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> {t('Cancel')}</Link>
      <div className="page-head" style={{ marginTop: 8 }}><h1>{id ? t('Edit quiz') : t('New milestone quiz')}</h1></div>

      <form onSubmit={save} className="stack">
        <ErrorBox>{err}</ErrorBox>
        <div className="editor-block stack">
          <div className="grid-form">
            <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="qt">{t('Title')}</label><input id="qt" className="input" required value={f.title} onChange={(e) => up({ title: e.target.value })} placeholder={t('M1 Quiz: SOC Foundations')} /></div>
            <div className="field"><label htmlFor="qp">{t('Pass mark (%)')}</label><input id="qp" type="number" min={0} max={100} className="input" value={f.passScore} onChange={(e) => up({ passScore: e.target.value })} /></div>
            <div className="field"><label htmlFor="qa">{t('Attempts allowed (0 = unlimited)')}</label><input id="qa" type="number" min={0} max={20} className="input" value={f.maxAttempts} onChange={(e) => up({ maxAttempts: e.target.value })} /></div>
            <div className="field"><label htmlFor="qt">{t('Time limit (minutes, empty = none)')}</label><input id="qt" type="number" min={1} max={600} className="input" value={f.timeLimitMinutes ?? ''} onChange={(e) => up({ timeLimitMinutes: e.target.value })} /></div>
            </div>
          <label className="switch-row">
            <span><strong>Shuffle questions &amp; answers</strong><span className="small muted">{t('Each attempt shows them in a different order (scores are not affected)')}</span></span>
            <input type="checkbox" role="switch" className="switch" checked={f.shuffle !== false} onChange={(e) => up({ shuffle: e.target.checked })} />
          </label>
          <div className="field"><label htmlFor="qd">{t('Instructions (optional)')}</label><textarea id="qd" className="textarea" value={f.description || ''} onChange={(e) => up({ description: e.target.value })} /></div>
        </div>

        {f.questions.map((q, i) => (
          <div key={q._id || i} className="editor-block stack">
            <div className="row">
              <span className="task-num">{i + 1}</span>
              <select className="select" style={{ width: 'auto' }} value={q.type} onChange={(e) => setType(i, e.target.value)} aria-label={t('Question type')}>
                <option value="single">{t('One correct answer')}</option>
                <option value="multiple">{t('Several correct answers')}</option>
                <option value="true_false">{t('True / False')}</option>
              </select>
              <input type="number" min={0} max={100} className="input" style={{ width: 90 }} aria-label={t('Points')} value={q.points} onChange={(e) => setQ(i, { points: e.target.value })} />
              <span className="small muted">{t('pts')}</span>
              <span className="spacer" />
              <button type="button" className="btn btn-ghost icon-btn" disabled={i === 0} aria-label={t('Move up')} onClick={() => moveQ(i, -1)}><ArrowUp size={15} /></button>
              <button type="button" className="btn btn-ghost icon-btn" disabled={i === f.questions.length - 1} aria-label={t('Move down')} onClick={() => moveQ(i, 1)}><ArrowDown size={15} /></button>
              <button type="button" className="btn btn-ghost icon-btn" aria-label={t('Delete question')} onClick={() => up({ questions: f.questions.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
            </div>
            <textarea className="textarea" style={{ minHeight: 60 }} required placeholder={t('Question')} aria-label={`Question ${i + 1}`} value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} />
            <p className="small muted">{q.type === 'multiple' ? 'Tick every correct answer.' : 'Select the correct answer.'}</p>
            {q.options.map((o, oi) => (
              <div key={oi} className="row" style={{ flexWrap: 'nowrap' }}>
                <input
                  type={q.type === 'multiple' ? 'checkbox' : 'radio'}
                  name={`correct-${i}`}
                  checked={q.correct.includes(oi)}
                  onChange={() => toggleCorrect(i, oi)}
                  aria-label={`Mark option ${oi + 1} correct`}
                />
                <input className="input" required disabled={q.type === 'true_false'} placeholder={`Option ${oi + 1}`} value={o} onChange={(e) => setQ(i, { options: q.options.map((x, k) => (k === oi ? e.target.value : x)) })} />
                {q.type !== 'true_false' && <button type="button" className="btn btn-ghost icon-btn" aria-label={t('Remove option')} disabled={q.options.length <= 2} onClick={() => removeOption(i, oi)}><Trash2 size={14} /></button>}
              </div>
            ))}
            {q.type !== 'true_false' && q.options.length < 8 && (
              <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setQ(i, { options: [...q.options, ''] })}><Plus size={14} /> {t('Option')}</button>
            )}
            <input className="input" placeholder={t('Explanation shown after submitting (optional)')} value={q.explanation || ''} onChange={(e) => setQ(i, { explanation: e.target.value })} />
          </div>
        ))}
        <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => up({ questions: [...f.questions, newQuestion()] })}><Plus size={15} /> {t('Add question')}</button>

        <div className="card row" style={{ position: 'sticky', bottom: 0, zIndex: 5 }}>
          <label className="row small"><input type="checkbox" checked={f.isPublished} onChange={(e) => up({ isPublished: e.target.checked })} /> {t('Visible to employees')}</label>
          <span className="small muted">{f.questions.length} questions · {f.questions.reduce((s, q) => s + Number(q.points || 0), 0)} points</span>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={busy || !f.questions.length}>{t('Save quiz')}</button>
        </div>
      </form>
    </div>
  );
}
