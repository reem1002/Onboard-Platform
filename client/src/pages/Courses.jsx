import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { useAuth, can } from '../context/AuthContext';
import { ErrorBox, Progress, fmtDate, Skeleton, SkeletonText } from '../components/ui';

/** Platform admin: create a course shell (milestones), then add assignments inside it. */
function NewCourseModal({ onClose }) {
  const nav = useNavigate();
  const [f, setF] = useState({ code: '', title: '', summary: '', milestones: 'Milestone 1\nMilestone 2\nMilestone 3' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      const milestones = f.milestones.split('\n').map((t) => t.trim()).filter(Boolean).map((title, order) => ({ title, order }));
      const { data } = await api.post('/courses', { code: f.code, title: f.title, summary: f.summary || undefined, milestones, isPublished: false });
      nav(`/courses/${data.course._id}`);
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <form className="modal stack" role="dialog" aria-modal="true" aria-labelledby="nc-title" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 id="nc-title">New course</h2>
        <ErrorBox>{err}</ErrorBox>
        <div className="grid-form">
          <div className="field"><label htmlFor="cc">Code</label><input id="cc" className="input" required placeholder="SOC-L1-2026" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
          <div className="field"><label htmlFor="ct">Title</label><input id="ct" className="input" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="cs">Summary</label><textarea id="cs" className="textarea" value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></div>
        <div className="field"><label htmlFor="cm">Milestones (one per line)</label><textarea id="cm" className="textarea" style={{ minHeight: 110 }} value={f.milestones} onChange={(e) => setF({ ...f, milestones: e.target.value })} /></div>
        <p className="small muted">The course starts as a draft. Assign instructors under Instructors, then publish it when the assignments are ready.</p>
        <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary">Create course</button></div>
      </form>
    </div>
  );
}

export default function Courses() {
  const { user } = useAuth();
  const { data, error, loading } = useFetch('/courses');
  const [creating, setCreating] = useState(false);
  const isEmployee = user.role === 'employee';

  const intro = {
    employee: 'These are the courses your company assigned to you.',
    instructor: 'The courses you teach and grade.',
    company_admin: 'Courses available to your company. Open one to assign it to employees.',
    super_admin: 'Every course on the platform.',
  }[user.role];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{isEmployee ? `Welcome, ${user.name.split(' ')[0]}` : user.role === 'instructor' ? 'My courses' : 'Courses'}</h1>
          <p>{intro}</p>
        </div>
        <span className="spacer" />
        {can.admin(user) && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New course</button>}
      </div>
      <ErrorBox>{error}</ErrorBox>
      {loading ? (
        <div className="course-grid">{[0, 1, 2].map((i) => <div key={i} className="card skel-card"><Skeleton w={90} h={22} r={999} /><Skeleton w="85%" h={20} style={{ marginTop: 14 }} /><SkeletonText lines={2} /><Skeleton h={8} style={{ marginTop: 18 }} /></div>)}</div>
      ) : !data?.courses?.length ? (
        <div className="card empty">
          <h3>No courses yet</h3>
          <p>
            {isEmployee ? 'Your manager hasn’t assigned a course to you yet.'
              : user.role === 'instructor' ? 'The platform admin hasn’t assigned you to a course yet.'
              : can.admin(user) ? 'Create your first course to start building assignments.'
              : 'No courses are available to your company yet.'}
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
                        <span>{c.progress.approved} of {c.progress.total} graded</span>
                        <span className="spacer" />
                        <strong>{pct}%</strong>
                      </div>
                      <Progress value={pct} ok={pct === 100} />
                      {c.enrollment?.dueAt && <span className="small muted">Due {fmtDate(c.enrollment.dueAt)}</span>}
                    </>
                  ) : (
                    <div className="row">
                      <span className="chip">{c.isPublished ? 'Published' : 'Draft'}</span>
                      {can.admin(user) && (
                        <span className="small muted">
                          {c.instructors?.length ? `Instructors: ${c.instructors.map((i) => i.name).join(', ')}` : 'No instructor assigned'}
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
