import { VideoEmbed } from './Video';
import { useT } from '../lib/i18n';
const KIND_LABEL = { tip: 'Tip', hint: 'Hint', example: 'Example', warning: 'Warning', note: 'Note' };

export function Callout({ c }) {
  const t = useT();
  return (
    <div className={`callout ${c.kind}`}>
      <div className="callout-head">
        <span className="kind">{t(KIND_LABEL[c.kind] || '')}</span>
        {c.title}
      </div>
      {c.bullets?.length > 0 && (
        <ul className="bullets">
          {c.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
    </div>
  );
}

const Bullets = ({ items }) =>
  items?.length ? (
    <ul className="bullets">
      {items.map((b, i) => <li key={i}>{b}</li>)}
    </ul>
  ) : null;

/**
 * Renders a structured assignment exactly like the LMS brief —
 * shared by the student view and the editor's live preview.
 */
export default function AssignmentBrief({ a }) {
  const t = useT();
  const meta = a.meta || {};
  return (
    <article>
      {a.kind !== 'lesson' && <dl className="meta-strip">
        <div><dt>{t('Difficulty')}</dt><dd>{meta.difficulty || '—'}</dd></div>
        <div><dt>{t('Type')}</dt><dd>{meta.type || a.kind}</dd></div>
        <div><dt>{t('Estimated time')}</dt><dd>{meta.estimatedHours ? t('{n} hours', { n: meta.estimatedHours }) : '—'}</dd></div>
        {meta.platform && <div><dt>{t('Platform')}</dt><dd>{meta.platform}</dd></div>}
      </dl>}
      {meta.certifications?.length > 0 && (
        <p className="small muted" style={{ marginTop: 8 }}>Maps to: {meta.certifications.join(', ')}</p>
      )}

      {a.videos?.length > 0 && (
        <section className="brief-section">
          <h2>{t(a.kind === 'lesson' ? 'Watch' : a.videos.length > 1 ? 'Videos' : 'Video')}</h2>
          <div className="video-list">{a.videos.map((v, i) => <VideoEmbed key={i} video={v} />)}</div>
        </section>
      )}

      {(a.scenario?.bullets?.length > 0 || a.scenario?.callouts?.length > 0) && (
        <section className="brief-section">
          <h2>{t('Scenario')}</h2>
          <Bullets items={a.scenario.bullets} />
          {a.scenario.callouts?.map((c, i) => <Callout key={i} c={c} />)}
        </section>
      )}

      {a.tasks?.length > 0 && (
        <section className="brief-section">
          <h2>{t('Tasks')}</h2>
          {a.tasks.map((tk, i) => (
            <div className="task" id={`task-${i + 1}`} key={tk._id || i}>
              <div className="task-num">{i + 1}</div>
              <div>
                <h3>{tk.title}</h3>
                <Bullets items={tk.bullets} />
                {tk.callouts?.map((c, j) => <Callout key={j} c={c} />)}
              </div>
            </div>
          ))}
        </section>
      )}

      {a.deliverable?.bullets?.length > 0 && (
        <section className="brief-section">
          <h2>{t('Deliverable')}</h2>
          <Bullets items={a.deliverable.bullets} />
          <p className="small muted" style={{ marginTop: 8 }}>
            {t('Accepted files:')} {a.deliverable.acceptedFileTypes?.map((x) => `.${x}`).join(', ')} · {t('up to {n} file(s)', { n: a.deliverable.maxFiles })}
          </p>
        </section>
      )}

      {a.rubric?.length > 0 && (
        <section className="brief-section">
          <h2>{t('How it’s graded')}</h2>
          <div className="weightbar" aria-hidden>
            {a.rubric.map((r, i) => <span key={i} style={{ flex: r.weight, '--i': i }} title={`${r.criterion} (${r.weight}%)`} />)}
          </div>
          <ul className="rubric-list">
            {a.rubric.map((r, i) => (
              <li key={i}><span className="w">{r.weight}%</span><span>{r.criterion}</span></li>
            ))}
          </ul>
        </section>
      )}

      {(a.professionalDevelopment?.linkedinSkills?.length > 0 || a.professionalDevelopment?.cvAccomplishment) && (
        <section className="brief-section">
          <h2>{t('What you’ll be able to show')}</h2>
          {a.professionalDevelopment.linkedinSkills?.length > 0 && (
            <div className="row" style={{ marginBottom: 8 }}>
              {a.professionalDevelopment.linkedinSkills.map((s) => <span key={s} className="chip chip-info">{s}</span>)}
            </div>
          )}
          {a.professionalDevelopment.cvAccomplishment && <p className="small">{a.professionalDevelopment.cvAccomplishment}</p>}
        </section>
      )}
    </article>
  );
}
