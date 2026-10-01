import { fmtDate } from './ui';
import { useT } from '../lib/i18n';

/** The overview mentions the grade; keep it equal to the grade actually shown (older drafts may hold a placeholder). */
export const syncTotal = (text, total, max = 100) => (text ? String(text).replaceAll('{{TOTAL}}', String(total ?? '')).replace(/(earned\s+)\d+(?:\.\d+)?\s*\/\s*100\b/i, `$1${total}/${max}`) : text);

/** Bold any "85/100"-style score inside a sentence (matches the Word template). */
function Rich({ text }) {
  const parts = String(text || '').split(/(\d+(?:\.\d+)?\s*\/\s*100)/);
  return parts.map((p, i) => (/\/\s*100/.test(p) ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>));
}

/**
 * The feedback sheet, laid out like the instructor template:
 * Overview → details → Strengths → Areas to Tighten Up → Grading Breakdown → closing.
 * Used on the employee's feedback page and as the instructor's live preview.
 */
export default function FeedbackView({ sub, fb }) {
  const t = useT();
  const a = sub.assignment || {};
  const max = a.maxScore || 100;
  const points = (c) => Math.round(((c.score || 0) * c.weight) / 100 * (max / 100) * 10) / 10;

  return (
    <article className="fb">
      <header className="fb-head">
        <div>
          <h2>{a.code} Feedback — {sub.student?.name}</h2>
          <p className="muted small">{fmtDate(fb.reviewedAt || sub.updatedAt)}</p>
        </div>
        <div className="fb-score" aria-label={`Grade ${fb.totalScore} out of ${max}`}>
          <b>{fb.totalScore ?? '—'}</b><span>/ {max}</span>
        </div>
      </header>

      <section className="fb-section">
        <h3>{t('Overview')}</h3>
        <p><Rich text={syncTotal(fb.overview, fb.totalScore, max) || `${sub.student?.name}'s ${a.code} submission earned ${fb.totalScore}/${max}.`} /></p>
        <dl className="fb-details">
          <div><dt>{t('Assignment')}</dt><dd>{a.code}: {a.title}</dd></div>
          {sub.course?.title && <div><dt>{t('Course')}</dt><dd>{sub.course.title}</dd></div>}
          <div><dt>{t('Student')}</dt><dd>{sub.student?.name}{sub.student?.email && <span className="muted"> ({sub.student.email})</span>}</dd></div>
          <div><dt>{t('Submission')}</dt><dd>{(sub.files || []).map((f) => f.originalName).join(', ')}, {fmtDate(sub.createdAt)}</dd></div>
          <div><dt>{t('Grade')}</dt><dd><strong>{fb.totalScore} / {max}</strong></dd></div>
        </dl>
      </section>

      {fb.strengths?.length > 0 && (
        <section className="fb-section">
          <h3>{t('Strengths')}</h3>
          <div className="fb-cards">
            {fb.strengths.map((s, i) => (
              <div className="fb-card good" key={i}>
                <strong>{s.task}</strong>
                <p>{s.detail}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {fb.improvements?.length > 0 && (
        <section className="fb-section">
          <h3>{t('Areas to tighten up')}</h3>
          <div className="fb-cards">
            {fb.improvements.map((s, i) => (
              <div className="fb-card fix" key={i}>
                <strong>{s.task}</strong>
                <div className="fb-issue"><span className="lbl">{t('Issue')}</span><p>{s.issue}</p></div>
                <div className="fb-issue"><span className="lbl">{t('Suggestion')}</span><p>{s.suggestion}</p></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {fb.criteria?.length > 0 && (
        <section className="fb-section">
          <h3>{t('Grading breakdown')}</h3>
          <div className="card card-flush">
            <table className="table">
              <thead><tr><th>{t('Criterion')}</th><th>{t('Weight')}</th><th>{t('Score')}</th><th>{t('Notes')}</th></tr></thead>
              <tbody>
                {fb.criteria.map((c, i) => (
                  <tr key={i}>
                    <td data-label="Criterion">{c.criterion}</td>
                    <td data-label="Weight">{c.weight}%</td>
                    <td data-label="Score"><strong>{points(c)}</strong><span className="muted"> / {c.weight}</span></td>
                    <td data-label="Notes" className="muted">{c.comment}</td>
                  </tr>
                ))}
                <tr className="fb-total">
                  <td data-label="Total">{t('Total')}</td><td data-label="Weight">100%</td>
                  <td data-label="Score" colSpan={2}><strong>{fb.totalScore} / {max}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {fb.closing && <p className="fb-closing"><Rich text={fb.closing} /></p>}
    </article>
  );
}
