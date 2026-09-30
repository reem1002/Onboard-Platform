import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { Loader, ErrorBox, StatusChip, fmtDate } from '../components/ui';

const TABS = [
  ['pending', 'Needs review'],
  ['ai_grading', 'AI grading'],
  ['returned', 'Returned'],
  ['approved', 'Graded'],
];

export default function ReviewQueue() {
  const [status, setStatus] = useState('pending');
  const { data, error, loading } = useFetch(`/submissions/queue?status=${status}`, [status]);
  const stats = useFetch('/dashboard/instructor');

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Review queue</h1>
          <p>AI drafts a grade for each submission against the rubric. Nothing reaches the employee until you approve it.</p>
        </div>
      </div>

      {stats.data && (
        <div className="stats">
          <div className="stat"><b>{(stats.data.counts.ai_graded || 0) + (stats.data.counts.submitted || 0) + (stats.data.counts.ai_failed || 0)}</b><span>Waiting for you</span></div>
          <div className="stat"><b>{stats.data.counts.ai_grading || 0}</b><span>Being graded by AI</span></div>
          <div className="stat"><b>{stats.data.counts.approved || 0}</b><span>Approved</span></div>
          <div className="stat"><b>{stats.data.aiAgreementRate ?? '—'}{stats.data.aiAgreementRate != null && '%'}</b><span>Approved without changes</span></div>
        </div>
      )}

      <div className="row" role="tablist" style={{ marginBottom: 'var(--sp-3)' }}>
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={status === k} className={`btn btn-sm ${status === k ? 'btn-primary' : ''}`} onClick={() => setStatus(k)}>{label}</button>
        ))}
      </div>

      <ErrorBox>{error}</ErrorBox>
      {loading ? <div className="card"><Loader rows={4} /></div> : !data?.items.length ? (
        <div className="card empty"><h3>All caught up</h3><p>No submissions in this list.</p></div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead><tr><th>Employee</th><th>Assignment</th><th>Submitted</th><th>AI draft</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data.items.map((s) => (
                <tr key={s._id}>
                  <td data-label="Employee"><strong>{s.student?.name}</strong><div className="small muted">{s.student?.department}</div></td>
                  <td data-label="Assignment">{s.assignment?.code} <span className="muted">{s.assignment?.title}</span></td>
                  <td data-label="Submitted">{fmtDate(s.createdAt)}{s.attempt > 1 && <span className="small muted"> · attempt {s.attempt}</span>}</td>
                  <td data-label="AI draft">
                    {s.ai?.totalScore != null ? (
                      <span className="ai-badge"><Sparkles size={13} /> {s.ai.totalScore} · {s.ai.confidence} confidence</span>
                    ) : <span className="muted">—</span>}
                    {s.ai?.flags?.length > 0 && <div className="small" style={{ color: 'var(--warning)' }}>{s.ai.flags.join(', ').replaceAll('_', ' ')}</div>}
                  </td>
                  <td data-label="Status"><StatusChip status={s.status} /></td>
                  <td><Link className="btn btn-sm" to={`/review/${s._id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
