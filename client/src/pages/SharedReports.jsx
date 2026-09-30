import { useEffect, useMemo, useState } from 'react';
import { FileDown, FileText, Search } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { downloadSavedReport } from '../api/files';
import { useAuth } from '../context/AuthContext';
import { ErrorBox, Loader, fmtDate } from '../components/ui';

/** Progress reports the training team saved and shared. Company admins get PDF; staff also get Word. */
export default function SharedReports() {
  const { user } = useAuth();
  const staff = ['super_admin', 'instructor'].includes(user.role);
  const [reports, setReports] = useState(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api.get('/reports/saved').then(({ data }) => setReports(data.reports)).catch((e) => setErr(errorMessage(e)));
  }, []);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (reports || []).filter((r) => !t || `${r.student?.name} ${r.course?.code} ${r.course?.title}`.toLowerCase().includes(t));
  }, [reports, q]);

  const dl = async (id, format) => {
    setBusy(`${id}.${format}`);
    setErr('');
    try { await downloadSavedReport(id, format); } catch (e) { setErr(errorMessage(e, 'Download failed.')); } finally { setBusy(''); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Progress reports</h1>
          <p>{staff ? 'Reports you and other instructors have shared with customer companies.' : 'Official progress reports shared by your training team. Each one is a signed-off snapshot — download it as PDF to forward or file.'}</p>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {!reports ? (!err && <div className="card"><Loader rows={4} /></div>) : reports.length === 0 ? (
        <div className="card empty">
          <FileText size={28} style={{ margin: '0 auto 8px' }} />
          <p>No reports have been shared yet.{staff ? ' Open an employee’s progress report and choose “Share with company”.' : ' You’ll get a notification when your instructor shares one.'}</p>
        </div>
      ) : (
        <div className="card card-flush">
          <div className="row" style={{ padding: 'var(--sp-3)' }}>
            <div className="search">
              <Search size={15} />
              <input className="input" placeholder="Search by employee or course" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search reports" />
            </div>
            <span className="spacer" />
            <span className="small muted">{rows.length} report{rows.length === 1 ? '' : 's'}</span>
          </div>
          <table className="table">
            <thead><tr><th>Employee</th><th>Course</th><th>Shared</th><th>By</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td data-label="Employee"><strong>{r.student?.name || '—'}</strong>{r.student?.jobTitle && <div className="small muted">{r.student.jobTitle}</div>}</td>
                  <td data-label="Course"><span className="item-code">{r.course?.code}</span> <span className="small">{r.course?.title}</span></td>
                  <td data-label="Shared">{fmtDate(r.createdAt)}</td>
                  <td data-label="By">{r.createdBy?.name || '—'}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      {staff && <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => dl(r._id, 'docx')}><FileText size={14} /> Word</button>}
                      <button className="btn btn-sm btn-primary" disabled={Boolean(busy)} onClick={() => dl(r._id, 'pdf')}><FileDown size={14} /> {busy === `${r._id}.pdf` ? '…' : 'PDF'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
