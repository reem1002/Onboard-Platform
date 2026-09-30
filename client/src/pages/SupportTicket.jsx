import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle2, RotateCcw } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Loader, ErrorBox, PageSkeleton } from '../components/ui';
import { TICKET_STATUS } from './Support';

const ROLE = { super_admin: 'Platform support', instructor: 'Instructor', company_admin: 'Company admin', employee: 'Employee' };
const when = (d) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function SupportTicket() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useFetch(`/support/${id}`);
  const [reply, setReply] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const staff = ['super_admin', 'instructor'].includes(user.role);

  if (loading) return <PageSkeleton variant="detail" />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  const t = data.ticket;

  const act = async (fn) => {
    setBusy(true);
    setErr('');
    try { await fn(); reload(); } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const send = (e) => {
    e.preventDefault();
    act(async () => { await api.post(`/support/${id}/messages`, { body: reply }); setReply(''); });
  };

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <Link to="/support" className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> All requests</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <span className="small muted">#{t.number} · {t.channel === 'course' ? `Course question${t.course ? ` · ${t.course.code}` : ''}` : 'Platform support'}{t.assignment ? ` · ${t.assignment.code}` : ''}</span>
          <h1 style={{ fontSize: 'var(--fs-lg)' }}>{t.subject}</h1>
          <p className="small">{t.requester?.name}{t.company?.name ? ` · ${t.company.name}` : ''}</p>
        </div>
        <span className="spacer" />
        <span className={`chip ${TICKET_STATUS[t.status][1]}`}>{TICKET_STATUS[t.status][0]}</span>
      </div>
      <ErrorBox>{err}</ErrorBox>

      <div className="thread">
        {t.messages.map((m) => {
          const mine = String(m.author?._id) === String(user._id);
          const fromStaff = ['super_admin', 'instructor'].includes(m.author?.role);
          return (
            <div key={m._id} className={`msg ${mine ? 'mine' : ''} ${fromStaff ? 'staff' : ''}`}>
              <div className="msg-head"><strong>{mine ? 'You' : m.author?.name}</strong><span className="muted small">{ROLE[m.author?.role]} · {when(m.createdAt)}</span></div>
              <p>{m.body}</p>
            </div>
          );
        })}
      </div>

      <form className="card stack" onSubmit={send} style={{ marginTop: 'var(--sp-3)' }}>
        <label htmlFor="rep" className="small" style={{ fontWeight: 600 }}>{t.status === 'resolved' ? 'Reply to reopen this request' : 'Reply'}</label>
        <textarea id="rep" className="textarea" style={{ minHeight: 110 }} maxLength={5000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={staff ? 'Write your answer…' : 'Add more details or reply…'} />
        <div className="row">
          {staff && (
            <select className="select" style={{ width: 'auto' }} aria-label="Priority" value={t.priority} onChange={(e) => act(() => api.patch(`/support/${id}`, { priority: e.target.value }))}>
              {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>Priority: {p}</option>)}
            </select>
          )}
          <span className="spacer" />
          {t.status !== 'resolved'
            ? <button type="button" className="btn" disabled={busy} onClick={() => act(() => api.patch(`/support/${id}`, { status: 'resolved' }))}><CheckCircle2 size={15} /> Mark resolved</button>
            : <button type="button" className="btn" disabled={busy} onClick={() => act(() => api.patch(`/support/${id}`, { status: 'open' }))}><RotateCcw size={15} /> Reopen</button>}
          <button className="btn btn-primary" disabled={busy || !reply.trim()}><Send size={15} /> Send</button>
        </div>
      </form>
    </div>
  );
}
