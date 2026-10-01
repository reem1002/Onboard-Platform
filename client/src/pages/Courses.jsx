import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { useAuth, can } from '../context/AuthContext';
import { ErrorBox, Progress, fmtDate, Skeleton, SkeletonText } from '../components/ui';
import { useT } from '../lib/i18n';

/** Platform admin: create a course shell (milestones), then add assignments inside it. */
function NewCourseModal({ onClose }) {
  const t = useT();
  const nav = useNavigate();
  const [f, setF] = useState({ code: '', title: '', summary: '', milestones: 'Milestone 1\nMilestone 2\nMilestone 3' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const milestones = f.milestones.split('\n').map((x) => x.trim()).filter(Boolean).map((title, order) => ({ title, order }));
      const { data } = await api.post('/courses', { code: f.code, title: f.title, summary: f.summary || undefined, milestones, isPublished: false });
      nav(`/courses/${data.course._id}`);
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal stack" role="dialog" aria-modal="true" aria-labelledby="nc-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 id="nc-title">{t('New course')}</h2>
        <ErrorBox>{err}</ErrorBox>
        <div className="grid-form">
          <div className="field"><label htmlFor="cc">{t('Code')}</label><input id="cc" className="input" required placeholder={t('SOC-L1-2026')} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
          <div className="field"><label htmlFor="ct">{t('Title')}</label><input id="ct" className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="cs">{t('Summary')}</label><textarea id="cs" className="textarea" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
        <div className="field"><label htmlFor="cm">{t('Milestones (one per line)')}</label><textarea id="cm" className="textarea" style={{ minHeight: 110 }} value={f.milestones} onChange={(e) => setF({ ...f, milestones: e.target.value })} /></div>
        <p className="small muted">{t('The course starts as a draft. Assign instructors under Instructors, then publish it when the assignments are ready.')}</p>
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary">{t('Create course')}</button></div>
      </form>
    </div>
  );
}

export default function Courses() {
  const { user } = useAuth();
  const { data, error, loading } = useFetch('/courses');
  const [creating, setCreating] = useState(false);
  const isEmployee = user.role === 'employee';
  const t = useT();

  const intro = {
    employee: 'These are the courses your company assigned to you.',
    instructor: 'The courses you teach and grade.',
    company_admin: 'Courses available to your company. Open one to assign it to employees.',
    super_admin: 'Every course on the platform.',
  }[user.role];
  const tIntro = t(intro);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{isEmployee ? t('Welcome, {name}', { name: user.name.split(' ')[0] }) : user.role === 'instructor' ? t('My courses') : t('Courses')}</h1>
          <p>{tIntro}</p>
        </div>
        <span className="spacer" />
        {can.admin(user) && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> {t('New course')}</button>}
      </div>
      <ErrorBox>{error}</ErrorBox>
      {loading ? (
        <div className="course-grid">{[0, 1, 2].map((i) => <div key={i} className="card skel-card"><Skeleton w={90} h={22} r={999} /><Skeleton w="85%" h={20} style={{ marginTop: 14 }} /><SkeletonText lines={2} /><Skeleton h={8} style={{ marginTop: 18 }} /></div>)}</div>
      ) : !data?.courses?.length ? (
        <div className="card empty">
          <h3>{t('No courses yet')}</h3>
          <p>
            {t(isEmployee ? 'Your manager hasn’t assigned a course to you yet.'
              : user.role === 'instructor' ? 'The platform admin hasn’t assigned you to a course yet.'
              : can.admin(user) ? 'Create your first course to start building assignments.'
              : 'No courses are available to your company yet.')}
          </p>
        </div>
      ) : (
        <div className="course-grid">
          {data.courses.map((c, idx) => {
            const pct = c.progress?.total ? Math.round((c.progress.approved / c.progress.total) * 100) : 0;
            return (
              <Link to={`/courses/${c._id}`} key={c._id} className={`course-card tone-${idx % 4}`}>
                <div className="body">
                  <span className="code">{c.code}</span>
                  <h3>{c.title}</h3>
                  {c.summary && <p className="small muted">{c.summary}</p>}
                  <div className="spacer" />
                  {isEmployee ? (
                    <>
                      <div className="row small">
                        <span>{t('{a} of {b} graded', { a: c.progress.approved, b: c.progress.total })}</span>
                        <span className="spacer" />
                        <strong>{pct}%</strong>
                      </div>
                      <Progress value={pct} ok={pct === 100} />
                      {c.enrollment?.dueAt && <span className="small muted">{t('Due {date}', { date: fmtDate(c.enrollment.dueAt) })}</span>}
                    </>
                  ) : (
                    <div className="row">
                      <span className="chip">{c.isPublished ? t('Published') : t('Draft')}</span>
                      {can.admin(user) && (
                        <span className="small muted">
                          {c.instructors?.length ? t('Instructors: {names}', { names: c.instructors.map((i) => i.name).join(', ') }) : t('No instructor assigned')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      {creating && <NewCourseModal onClose={() => setCreating(false)} />}
    </div>
  );
}
