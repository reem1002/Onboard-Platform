import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { Loader, ErrorBox, Progress, fmtDate, PageSkeleton } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import ResetPasswordButton from '../components/ResetPasswordButton';

export default function TeamDashboard() {
  const [params] = useSearchParams();
  const companyId = params.get('company');
  const { user } = useAuth();
  const isAdmin = user.role === 'super_admin';
  const { data, error, loading } = useFetch(`/dashboard/company${companyId ? `?company=${encodeURIComponent(companyId)}` : ''}`, [companyId]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const rows = useMemo(() => {
    if (!data) return [];
    const flat = data.rows.flatMap((r) =>
      r.courses.length ? r.courses.map((c) => ({ emp: r.employee, c })) : [{ emp: r.employee, c: null }]
    );
    return flat.filter(({ emp, c }) => {
      const s = q.toLowerCase();
      if (s && !`${emp.name} ${emp.email} ${emp.department || ''}`.toLowerCase().includes(s)) return false;
      if (filter === 'overdue') return c?.overdue;
      if (filter === 'notstarted') return c && c.submitted === 0;
      if (filter === 'review') return c?.pendingReview > 0;
      if (filter === 'unassigned') return !c;
      return true;
    });
  }, [data, q, filter]);

  if (loading) return <PageSkeleton variant="table" />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  const s = data.summary;

  return (
    <div className="page">
      {companyId && <Link to="/admin/companies" className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> Companies</Link>}
      <div className="page-head">
        <div>
          <h1>{data.company ? `${data.company.name} — team progress` : 'Team progress'}</h1>
          <p>Where every new hire is in their onboarding.</p>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b>{s.employees}</b><span>Employees{data.company ? ` · ${s.seatsUsed}/${data.company.seatLimit} seats` : ''}</span></div>
        <div className="stat"><b>{s.avgCompletion}%</b><span>Average completion</span></div>
        <div className="stat"><b style={{ color: s.overdue ? 'var(--warning)' : undefined }}>{s.overdue}</b><span>Overdue</span></div>
        <div className="stat"><b>{s.pendingReview}</b><span>Waiting for grading</span></div>
      </div>

      <div className="row" style={{ marginBottom: 'var(--sp-3)' }}>
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search by name, email or department" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search employees" />
        <select className="select" style={{ width: 'auto' }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter">
          <option value="all">Everyone</option>
          <option value="overdue">Overdue</option>
          <option value="notstarted">Not started</option>
          <option value="review">Has work waiting for grading</option>
          <option value="unassigned">No course assigned</option>
        </select>
      </div>

      {!rows.length ? (
        <div className="card empty"><p>No employees match this view.</p></div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead><tr><th>Employee</th><th>Course</th><th style={{ width: '22%' }}>Progress</th><th>Avg score</th><th>Due</th><th>Last sign-in</th><th /></tr></thead>
            <tbody>
              {rows.map(({ emp, c }, i) => (
                <tr key={`${emp._id}-${c?.courseId || i}`}>
                  <td data-label="Employee"><strong>{emp.name}</strong><div className="small muted">{emp.department || emp.email}</div></td>
                  <td data-label="Course">{c ? c.code : <span className="muted">Not assigned</span>}</td>
                  <td data-label="Progress">
                    {c ? (
                      <div style={{ flex: 1 }}>
                        <div className="row small" style={{ flexWrap: 'nowrap' }}><span>{c.approved}/{c.total} graded</span><span className="spacer" /><strong>{c.percent}%</strong></div>
                        <Progress value={c.percent} ok={c.percent === 100} />
                        {c.pendingReview > 0 && <div className="small muted" style={{ marginTop: 4 }}>{c.pendingReview} waiting for grading</div>}
                      </div>
                    ) : '—'}
                  </td>
                  <td data-label="Avg score">{c?.avgScore ?? '—'}</td>
                  <td data-label="Due">{c?.dueAt ? <span style={{ color: c.overdue ? 'var(--warning)' : undefined, fontWeight: c.overdue ? 600 : 400 }}>{fmtDate(c.dueAt)}{c.overdue && ' (overdue)'}</span> : '—'}</td>
                  <td data-label="Last sign-in" className="muted">{emp.lastLoginAt ? fmtDate(emp.lastLoginAt) : 'Never'}</td>
                  <td><div className="row" style={{ justifyContent: 'flex-end' }}>{c && <Link className="btn btn-sm" to={`/reports?student=${emp._id}&course=${c.courseId}`}><FileText size={14} /> Report</Link>}{isAdmin && <ResetPasswordButton user={emp} />}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
