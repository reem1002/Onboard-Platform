import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { LifeBuoy, Plus, MessageCircle } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Loader, ErrorBox, fmtDate } from '../components/ui';
import { useT } from '../lib/i18n';

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
  const t = useT();
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
      <h3>{t('New request')}</h3>
      <ErrorBox>{err}</ErrorBox>
      {isEmployee && (
        <fieldset className="choice-row">
          <legend className="sr-only">Who should answer?</legend>
          <label className={`choice ${f.channel === 'course' ? 'on' : ''}`}>
            <input type="radio" name="ch" checked={f.channel === 'course'} onChange={() => setF({ ...f, channel: 'course' })} />
            <strong>{t('Ask my instructor')}</strong><span className="small muted">{t('Questions about course content, assignments or your grade')}</span>
          </label>
          <label className={`choice ${f.channel === 'platform' ? 'on' : ''}`}>
            <input type="radio" name="ch" checked={f.channel === 'platform'} onChange={() => setF({ ...f, channel: 'platform' })} />
            <strong>{t('Platform support')}</strong><span className="small muted">{t('Login, labs, uploads or anything technical')}</span>
          </label>
        </fieldset>
      )}
      <div className="grid-form">
        {f.channel === 'course' && (
          <div className="field">
            <label htmlFor="tc">{t('Course')}</label>
            <select id="tc" className="select" required value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}>
              <option value="">{t('Choose a course…')}</option>
              {courses.data?.courses?.map((c) => <option key={c._id} value={c._id}>{c.code} — {c.title}</option>)}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="tcat">{t('Topic')}</label>
          <select id="tcat" className="select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {CATEGORIES.filter(([k]) => (f.channel === 'course' ? !['billing', 'account'].includes(k) : true)).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="tp">{t('Urgency')}</label>
          <select id="tp" className="select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            <option value="low">{t('Low — whenever you can')}</option>
            <option value="normal">{t('Normal')}</option>
            <option value="high">{t('High — it’s blocking my work')}</option>
            <option value="urgent">{t('Urgent')}</option>
          </select>
        </div>
      </div>
      <div className="field"><label htmlFor="ts">{t('Subject')}</label><input id="ts" className="input" required minLength={3} maxLength={200} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder={t('e.g. Can’t filter Level 12+ alerts in W-01 Task 3')} /></div>
      <div className="field"><label htmlFor="tb">{t('Details')}</label><textarea id="tb" className="textarea" style={{ minHeight: 140 }} required maxLength={5000} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={t('What were you trying to do, what happened, and what have you tried?')} /></div>
      <div className="row"><span className="spacer" /><button type="button" className="btn" onClick={onCancel}>{t('Cancel')}</button><button className="btn btn-primary" disabled={busy}>{t('Send request')}</button></div>
    </form>
  );
}

export default function Support() {
  const t = useT();
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
        <div><h1>{t(title)}</h1><p>{t(intro)}</p></div>
        <span className="spacer" />
        {!staff && !creating && <button className="btn btn-primary" onClick={() => setParams({ new: '' })}><Plus size={16} /> {t('New request')}</button>}
      </div>

      {creating && <NewTicket onCancel={() => setParams({})} />}

      {data?.stats && (
        <div className="stats">
          <div className="stat"><b>{data.stats.open}</b><span>{t('Need a reply')}</span></div>
          <div className="stat"><b>{data.stats.answered}</b><span>{t('Waiting on customer')}</span></div>
          <div className="stat"><b>{data.stats.resolved}</b><span>{t('Resolved')}</span></div>
          <div className="stat"><b>{data.stats.avgFirstResponseHours ?? '—'}{data.stats.avgFirstResponseHours != null && 'h'}</b><span>{t('Avg. first response')}</span></div>
        </div>
      )}

      <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
        <div className="tabs">
          {[['active', 'Active'], ['open', staff ? 'Needs reply' : 'Waiting for support'], ['answered', staff ? 'Waiting on customer' : 'Replied'], ['resolved', 'Resolved'], ['all', 'All']].map(([k, l]) => (
            <button key={k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{t(l)}</button>
          ))}
        </div>
        {user.role === 'super_admin' && (
          <select className="select" style={{ width: 'auto' }} value={channel} onChange={(e) => setChannel(e.target.value)} aria-label={t('Channel')}>
            <option value="">{t('All channels')}</option>
            <option value="platform">{t('Platform support')}</option>
            <option value="course">{t('Course questions')}</option>
          </select>
        )}
      </div>

      <ErrorBox>{error}</ErrorBox>
      {loading ? <div className="card"><Loader rows={4} /></div> : !data?.tickets.length ? (
        <div className="card empty">
          <LifeBuoy style={{ margin: '0 auto 8px' }} />
          <h3>{staff ? t('Nothing waiting') : t('No requests yet')}</h3>
          <p>{staff ? t('New questions will show up here.') : t('When you need help, open a request — you’ll get a reply right here.')}</p>
        </div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead><tr><th>{t('Request')}</th>{staff && <th>{t('From')}</th>}<th>{t('Channel')}</th><th>{t('Status')}</th><th>{t('Last activity')}</th></tr></thead>
            <tbody>
              {data.tickets.map((tk) => (
                <tr key={tk._id} className="clickable">
                  <td data-label="Request">
                    <Link to={`/support/${tk._id}`} className="ticket-link">
                      <MessageCircle size={15} /> <span><span className="muted">#{tk.number}</span> {tk.subject}</span>
                    </Link>
                    {['high', 'urgent'].includes(tk.priority) && <span className={`chip ${tk.priority === 'urgent' ? 'chip-danger' : 'chip-warn'}`} style={{ marginTop: 4 }}>{tk.priority}</span>}
                  </td>
                  {staff && <td data-label="From">{tk.requester?.name}<div className="small muted">{tk.company?.name || '—'}</div></td>}
                  <td data-label="Channel">{tk.channel === 'course' ? <span className="chip chip-info">{tk.course?.code || 'Course'}</span> : <span className="chip">{t('Platform')}</span>}</td>
                  <td data-label="Status"><span className={`chip ${labels[tk.status][1]}`}>{t(labels[tk.status][0])}</span></td>
                  <td data-label="Last activity" className="muted">{fmtDate(tk.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
