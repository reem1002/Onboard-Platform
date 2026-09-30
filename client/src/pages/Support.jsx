import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LifeBuoy, Plus, MessageCircle } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Loader, ErrorBox, fmtDate } from '../components/ui';

export const TICKET_STATUS = {
  open: ['Waiting for support', 'chip-warn'],
  answered: ['Replied', 'chip-info'],
  resolved: ['Resolved', 'chip-ok'],
};
const STAFF_STATUS = { open: ['Needs reply', 'chip-danger'], answered: ['Waiting on customer', 'chip-info'], resolved: ['Resolved', 'chip-ok'] };
const CATEGORIES = [
  ['question', 'General question'], ['assignment', 'About an assignment'], ['grading', 'Grade or feedback'],
  ['technical', 'Technical problem (lab, upload, access)'], ['account', 'Account & access'], ['billing', 'Licences & seats'], ['other', 'Other'],
];

function NewTicket({ onCancel }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const courses = useFetch(user.role === 'employee' ? '/support/courses' : null);
  const isEmployee = user.role === 'employee';
  const [f, setF] = useState({
    channel: isEmployee && params.get('course') ? 'course' : isEmployee ? 'course' : 'platform',
    courseId: params.get('course') || '',
    assignmentId: params.get('assignment') || undefined,
    subject: params.get('subject') || '',
    category: params.get('assignment') ? 'assignment' : 'question',
    priority: 'normal',
    body: '',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (f.channel === 'course' && !f.courseId && courses.data?.courses?.length === 1) setF((x) => ({ ...x, courseId: courses.data.courses[0]._id }));
  }, [courses.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const body = { ...f };
      if (body.channel !== 'course') { delete body.courseId; delete body.assignmentId; }
      const { data } = await api.post('/support', body);
      nav(`/support/${data.ticket._id}`);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card stack" onSubmit={submit} style={{ marginBottom: 'var(--sp-4)' }}>
      <h3>New request</h3>
      <ErrorBox>{err}</ErrorBox>
      {isEmployee && (
        <fieldset className="choice-row">
          <legend className="sr-only">Who should answer?</legend>
          <label className={`choice ${f.channel === 'course' ? 'on' : ''}`}>
            <input type="radio" name="ch" checked={f.channel === 'course'} onChange={() => setF({ ...f, channel: 'course' })} />
            <strong>Ask my instructor</strong><span className="small muted">Questions about course content, assignments or your grade</span>
          </label>
          <label className={`choice ${f.channel === 'platform' ? 'on' : ''}`}>
            <input type="radio" name="ch" checked={f.channel === 'platform'} onChange={() => setF({ ...f, channel: 'platform' })} />
            <strong>Platform support</strong><span className="small muted">Login, labs, uploads or anything technical</span>
          </label>
        </fieldset>
      )}
      <div className="grid-form">
        {f.channel === 'course' && (
          <div className="field">
            <label htmlFor="tc">Course</label>
            <select id="tc" className="select" required value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>
              <option value="">Choose a course…</option>
              {courses.data?.courses?.map((c) => <option key={c._id} value={c._id}>{c.code} — {c.title}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="tcat">Topic</label>
          <select id="tcat" className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.filter(([k]) => (f.channel === 'course' ? !['billing', 'account'].includes(k) : true)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tp">Urgency</label>
          <select id="tp" className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            <option value="low">Low — whenever you can</option>
            <option value="normal">Normal</option>
            <option value="high">High — it’s blocking my work</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
      </div>
      <div className="field"><label htmlFor="ts">Subject</label><input id="ts" className="input" required minLength={3} maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="e.g. Can’t filter Level 12+ alerts in W-01 Task 3" /></div>
      <div className="field"><label htmlFor="tb">Details</label><textarea id="tb" className="textarea" style={{ minHeight: 140 }} required maxLength={5000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="What were you trying to do, what happened, and what have you tried?" /></div>
      <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onCancel}>Cancel</button><button className="btn btn-primary" disabled={busy}>Send request</button></div>
    </form>
  );
}

export default function Support() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const staff = ['super_admin', 'instructor'].includes(user.role);
  const [status, setStatus] = useState('active');
  const [channel, setChannel] = useState('');
  const creating = params.get('new') !== null;
  const { data, error, loading } = useFetch(`/support?status=${status}${channel ? `&channel=${channel}` : ''}`, [status, channel]);
  const labels = staff ? STAFF_STATUS : TICKET_STATUS;

  const title = { super_admin: 'Support', instructor: 'Student questions', company_admin: 'Support', employee: 'Help & support' }[user.role];
  const intro = {
    super_admin: 'Every request on the platform — company admins and employees, plus the questions instructors are handling.',
    instructor: 'Questions from employees in the courses you teach.',
    company_admin: 'Contact our team about accounts, seats, labs or anything else.',
    employee: 'Ask your instructor about the course, or contact platform support for technical help.',
  }[user.role];

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{title}</h1><p>{intro}</p></div>
        <span className="spacer" />
        {!staff && !creating && <button className="btn btn-primary" onClick={() => setParams({ new: '' })}><Plus size={16} /> New request</button>}
      </div>

      {creating && <NewTicket onCancel={() => setParams({})} />}

      {data?.stats && (
        <div className="stats">
          <div className="stat"><b>{data.stats.open}</b><span>Need a reply</span></div>
          <div className="stat"><b>{data.stats.answered}</b><span>Waiting on customer</span></div>
          <div className="stat"><b>{data.stats.resolved}</b><span>Resolved</span></div>
          <div className="stat"><b>{data.stats.avgFirstResponseHours ?? '—'}{data.stats.avgFirstResponseHours != null && 'h'}</b><span>Avg. first response</span></div>
        </div>
      )}

      <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
        <div className="tabs">
          {[['active', 'Active'], ['open', staff ? 'Needs reply' : 'Waiting for support'], ['answered', staff ? 'Waiting on customer' : 'Replied'], ['resolved', 'Resolved'], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        {user.role === 'super_admin' && (
          <select className="select" style={{ width: 'auto' }} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
            <option value="">All channels</option>
            <option value="platform">Platform support</option>
            <option value="course">Course questions</option>
          </select>
        )}
      </div>

      <ErrorBox>{error}</ErrorBox>
      {loading ? <div className="card"><Loader rows={4} /></div> : !data?.tickets.length ? (
        <div className="card empty">
          <LifeBuoy style={{ margin: '0 auto 8px' }} />
          <h3>{staff ? 'Nothing waiting' : 'No requests yet'}</h3>
          <p>{staff ? 'New questions will show up here.' : 'When you need help, open a request — you’ll get a reply right here.'}</p>
        </div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead><tr><th>Request</th>{staff && <th>From</th>}<th>Channel</th><th>Status</th><th>Last activity</th></tr></thead>
            <tbody>
              {data.tickets.map((t) => (
                <tr key={t._id} className="clickable">
                  <td data-label="Request">
                    <Link to={`/support/${t._id}`} className="ticket-link">
                      <MessageCircle size={15} /> <span><span className="muted">#{t.number}</span> {t.subject}</span>
                    </Link>
                    {['high', 'urgent'].includes(t.priority) && <span className={`chip ${t.priority === 'urgent' ? 'chip-danger' : 'chip-warn'}`} style={{ marginTop: 4 }}>{t.priority}</span>}
                  </td>
                  {staff && <td data-label="From">{t.requester?.name}<div className="small muted">{t.company?.name || '—'}</div></td>}
                  <td data-label="Channel">{t.channel === 'course' ? <span className="chip chip-info">{t.course?.code || 'Course'}</span> : <span className="chip">Platform</span>}</td>
                  <td data-label="Status"><span className={`chip ${labels[t.status][1]}`}>{labels[t.status][0]}</span></td>
                  <td data-label="Last activity" className="muted">{fmtDate(t.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
