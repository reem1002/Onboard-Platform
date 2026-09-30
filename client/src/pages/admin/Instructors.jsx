import { useState } from 'react';
import { GraduationCap, Plus, Check } from 'lucide-react';
import { useFetch } from '../../api/useFetch';
import { api, errorMessage } from '../../api/client';
import { Loader, ErrorBox } from '../../components/ui';
import ResetPasswordButton from '../../components/ResetPasswordButton';

function NewInstructor({ onDone, onCancel }) {
  const [f, setF] = useState({ name: '', email: '', password: '', jobTitle: '' });
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      await api.post('/users', { ...f, role: 'instructor' });
      onDone();
    } catch (e2) {
      setErr(errorMessage(e2));
    }
  };
  return (
    <form className="card stack" onSubmit={submit} style={{ marginBottom: 'var(--sp-4)' }}>
      <h3>New instructor</h3>
      <ErrorBox>{err}</ErrorBox>
      <div className="grid-form">
        <div className="field"><label htmlFor="n">Full name</label><input id="n" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="field"><label htmlFor="e">Work email</label><input id="e" type="email" className="input" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <div className="field"><label htmlFor="p">Temporary password</label><input id="p" className="input" required minLength={10} autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div className="field"><label htmlFor="j">Title (optional)</label><input id="j" className="input" value={f.jobTitle} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} /></div>
      </div>
      <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onCancel}>Cancel</button><button className="btn btn-primary">Create instructor</button></div>
    </form>
  );
}

/** One instructor's course assignment — toggle chips, then save. */
function CourseAssigner({ instructor, courses, onSaved }) {
  const [picked, setPicked] = useState(instructor.courses.map(String));
  const [msg, setMsg] = useState('');
  const initial = instructor.courses.map(String).sort().join();
  const dirty = [...picked].sort().join() !== initial;
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const save = async () => {
    setMsg('');
    try {
      await api.put(`/users/instructors/${instructor._id}/courses`, { courseIds: picked });
      onSaved();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        {courses.map((c) => {
          const on = picked.includes(String(c._id));
          return (
            <button key={c._id} type="button" className={`chip-toggle ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(String(c._id))} title={c.title}>
              {on && <Check size={13} />} {c.code}
            </button>
          );
        })}
        {!courses.length && <span className="small muted">Create a course first.</span>}
      </div>
      {dirty && <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={save}>Save assignments</button>}
      {msg && <span className="small" style={{ color: 'var(--danger)' }}>{msg}</span>}
    </div>
  );
}

export default function Instructors() {
  const { data, error, loading, reload } = useFetch('/users/instructors');
  const [creating, setCreating] = useState(false);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Instructors</h1><p>Your team. Each instructor only sees, edits and grades the courses you assign here.</p></div>
        <span className="spacer" />
        {!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New instructor</button>}
      </div>
      {creating && <NewInstructor onCancel={() => setCreating(false)} onDone={() => { setCreating(false); reload(); }} />}
      <ErrorBox>{error}</ErrorBox>

      {loading ? <div className="card"><Loader rows={4} /></div> : !data?.instructors.length ? (
        <div className="card empty"><GraduationCap style={{ margin: '0 auto 8px' }} /><h3>No instructors yet</h3><p>Add an instructor, then assign the courses they'll teach and grade.</p></div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead><tr><th>Instructor</th><th>Assigned courses</th><th>Status</th></tr></thead>
            <tbody>
              {data.instructors.map((u) => (
                <tr key={u._id}>
                  <td data-label="Instructor"><strong>{u.name}</strong><div className="small muted">{u.email}</div></td>
                  <td data-label="Assigned courses"><CourseAssigner key={u.courses.join()} instructor={u} courses={data.courses} onSaved={reload} /></td>
                  <td data-label="Status"><div className="stack" style={{ gap: 6 }}><span className={`chip ${u.isActive ? 'chip-ok' : ''}`} style={{ alignSelf: 'flex-start' }}>{u.isActive ? 'Active' : 'Inactive'}</span>{u.isActive && <ResetPasswordButton user={u} className="btn btn-ghost btn-sm icon-link" />}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
