import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Plus, UserPlus, PlayCircle, ListChecks, Video, FileText, Paperclip, ArrowUpDown } from 'lucide-react';
import CourseOutlineEditor from '../components/CourseOutlineEditor';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { useAuth, can } from '../context/AuthContext';
import { Loader, ErrorBox, StatusChip, fmtDate, PageSkeleton } from '../components/ui';

function EnrollModal({ courseId, onClose }) {
  const { data } = useFetch('/users?role=employee&limit=100');
  const [picked, setPicked] = useState([]);
  const [dueAt, setDueAt] = useState('');
  const [msg, setMsg] = useState({});
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    try {
      const { data: r } = await api.post(`/courses/${courseId}/enroll`, { userIds: picked, dueAt: dueAt || undefined });
      setMsg({ ok: `Assigned to ${r.enrolled} employee(s)${r.skipped ? `, ${r.skipped} already enrolled` : ''}.` });
      setPicked([]);
    } catch (e) {
      setMsg({ err: errorMessage(e) });
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal stack" role="dialog" aria-modal="true" aria-labelledby="enroll-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="enroll-title">Assign this course</h2>
        {msg.ok && <div className="alert alert-ok">{msg.ok}</div>}
        <ErrorBox>{msg.err}</ErrorBox>
        <div className="field">
          <label htmlFor="due">Complete by (optional)</label>
          <input id="due" type="date" className="input" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </div>
        <div className="card card-flush" style={{ maxHeight: 300, overflow: 'auto' }}>
          {!data ? <div style={{ padding: 12 }}><Loader rows={4} /></div> : data.users.map((u) => (
            <label key={u._id} className="item-row" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={picked.includes(u._id)} onChange={() => toggle(u._id)} />
              <span className="item-title">{u.name}<br /><span className="small muted">{u.email}</span></span>
              <span className="small muted">{u.department}</span>
            </label>
          ))}
        </div>
        <div className="row">
          <span className="spacer" />
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" disabled={!picked.length} onClick={save}>Assign to {picked.length || ''} selected</button>
        </div>
      </div>
    </div>
  );
}

export default function CourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(`/courses/${id}`);
  const [pubErr, setPubErr] = useState('');
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [organizing, setOrganizing] = useState(false);

  if (loading) return <PageSkeleton variant="list" />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;

  const { course, assignments } = data;
  const isEmployee = user.role === 'employee';
  const milestones = [...course.milestones].sort((a, b) => a.order - b.order);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="small muted">{course.code}</span>
          <h1>{course.title}</h1>
          {course.summary && <p>{course.summary}</p>}
          {can.admin(user) && (
            <p className="small muted" style={{ marginTop: 6 }}>
              {course.instructors?.length ? `Instructors: ${course.instructors.map((i) => i.name).join(', ')}` : 'No instructor assigned yet — assign one under Instructors.'}
            </p>
          )}
        </div>
        <span className="spacer" />
        {can.admin(user) && (
          <button
            className={`btn ${course.isPublished ? '' : 'btn-primary'}`}
            onClick={async () => {
              setPubErr('');
              try { await api.patch(`/courses/${course._id}`, { isPublished: !course.isPublished }); reload(); } catch (e) { setPubErr(errorMessage(e)); }
            }}
          >
            {course.isPublished ? 'Unpublish' : 'Publish course'}
          </button>
        )}
        {data.canEdit && !organizing && (
          <button className="btn" onClick={() => setOrganizing(true)}><ArrowUpDown size={16} /> Organise</button>
        )}
        {can.report(user) && (data.canEdit || can.manageTeam(user)) && (
          <Link className="btn" to={`/courses/${course._id}/reports`}><FileText size={16} /> Progress reports</Link>
        )}
        {can.manageTeam(user) && (
          <button className="btn" onClick={() => setEnrollOpen(true)}><UserPlus size={16} /> Assign to employees</button>
        )}
      </div>

      <ErrorBox>{pubErr}</ErrorBox>
      {!course.isPublished && !isEmployee && <div className="alert alert-ok" style={{ marginBottom: 12 }}>Draft — companies and employees can’t see this course until it’s published.</div>}
      {organizing ? (
        <CourseOutlineEditor course={course} assignments={assignments} quizzes={data.quizzes || []} onClose={() => setOrganizing(false)} onSaved={() => { setOrganizing(false); reload(); }} />
      ) : milestones.map((m, idx) => {
        const items = assignments.filter((a) => a.milestoneId === m._id);
        const quizzes = (data.quizzes || []).filter((q) => q.milestoneId === m._id);
        const gradable = items.filter((a) => a.kind !== 'lesson');
        const done = gradable.filter((a) => a.mySubmission?.status === 'approved').length + quizzes.filter((q) => q.myBest?.passed).length;
        const count = gradable.length + quizzes.length;
        return (
          <details className="milestone" key={m._id} open={idx === 0}>
            <summary>
              <ChevronRight size={18} className="caret" />
              <span style={{ flex: 1 }}>
                {m.title}
                {m.weeks && <span className="small muted" style={{ fontWeight: 400 }}> — {m.weeks}</span>}
              </span>
              <span className="small muted">{isEmployee ? `${done}/${count}` : `${items.length + quizzes.length} items`}</span>
            </summary>
            {[...items.map((a) => ({ t: 'a', o: a.order ?? 0, a })), ...quizzes.map((q) => ({ t: 'q', o: q.order ?? 0, q }))]
              .sort((x, y) => x.o - y.o)
              .map(({ t, a, q }) => (t === 'a' ? (
                <Link to={`/assignments/${a._id}`} className="item-row" key={a._id}>
                  <span className={`item-code ${a.kind === 'lesson' ? 'lesson' : ''}`}>{a.kind === 'lesson' ? <><PlayCircle size={12} /> Lesson</> : a.code}</span>
                  <span className="item-title">{a.title}</span>
                  {a.videos?.length > 0 && a.kind !== 'lesson' && <span className="small muted row" style={{ gap: 4 }} title="Includes video"><Video size={14} /></span>}
                  {a.attachmentCount > 0 && <span className="small muted row" style={{ gap: 3 }} title={`${a.attachmentCount} resource file(s)`}><Paperclip size={14} />{a.attachmentCount}</span>}
                  {a.meta?.estimatedHours && <span className="small muted">{a.meta.estimatedHours} h</span>}
                  {isEmployee ? (a.kind !== 'lesson' && <StatusChip status={a.mySubmission?.status} />) : !a.isPublished && <span className="chip">Draft</span>}
                  {a.dueAt && <span className="small muted">Due {fmtDate(a.dueAt)}</span>}
                </Link>
              ) : (
                <Link to={`/quizzes/${q._id}`} className="item-row" key={q._id}>
                  <span className="item-code quiz"><ListChecks size={12} /> Quiz</span>
                  <span className="item-title">{q.title}</span>
                  <span className="small muted">{q.questionCount} questions</span>
                  {isEmployee
                    ? q.myBest ? <span className={`chip ${q.myBest.passed ? 'chip-ok' : 'chip-danger'}`}>{q.myBest.passed ? 'Passed' : 'Not passed'} · {q.myBest.score}%</span> : <span className="chip">Not started</span>
                    : !q.isPublished && <span className="chip">Draft</span>}
                </Link>
              )))}
            {data.canEdit && (
              <div className="item-row add-row">
                <Link to={`/courses/${course._id}/assignments/new?milestone=${m._id}`} className="btn btn-ghost btn-sm"><Plus size={15} /> Assignment</Link>
                <Link to={`/courses/${course._id}/assignments/new?milestone=${m._id}&kind=lesson`} className="btn btn-ghost btn-sm"><PlayCircle size={15} /> Lesson / video</Link>
                <Link to={`/courses/${course._id}/quizzes/new?milestone=${m._id}`} className="btn btn-ghost btn-sm"><ListChecks size={15} /> Quiz</Link>
              </div>
            )}
            {!items.length && !quizzes.length && !data.canEdit && <div className="item-row muted small">Nothing here yet.</div>}
          </details>
        );
      })}
      {enrollOpen && <EnrollModal courseId={course._id} onClose={() => setEnrollOpen(false)} />}
    </div>
  );
}
