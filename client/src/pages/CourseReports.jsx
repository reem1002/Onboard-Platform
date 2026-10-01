import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { Loader, ErrorBox, Progress, PageSkeleton } from '../components/ui';
import { useT } from '../lib/i18n';

/** Employees in a course the caller can report on (scoped by the API per role). */
export default function CourseReports() {
  const t = useT();
  const { id } = useParams();
  const { data, error, loading } = useFetch(`/reports/course/${id}`);

  if (loading) return <PageSkeleton variant="table" />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;

  return (
    <div className="page">
      <Link to={`/courses/${id}`} className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> {t('Back to course')}</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div><span className="small muted">{data.course.code}</span><h1>{t('Progress reports')}</h1><p>{t('Generate an on-the-job training progress report for any employee in this course.')}</p></div>
      </div>
      {!data.rows.length ? (
        <div className="card empty"><p>{t('No employees are enrolled in this course yet.')}</p></div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead><tr><th>{t('Employee')}</th><th>{t('Company')}</th><th style={{ width: '24%' }}>{t('Progress')}</th><th>{t('Avg grade')}</th><th>{t('Current milestone')}</th><th /></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.student._id}>
                  <td data-label="Employee"><strong>{r.student.name}</strong><div className="small muted">{r.student.jobTitle || r.student.email}</div></td>
                  <td data-label="Company">{r.company || '—'}</td>
                  <td data-label="Progress">
                    <div style={{ flex: 1 }}>
                      <div className="row small" style={{ flexWrap: 'nowrap' }}><span>{r.completed}/{r.total}</span><span className="spacer" /><strong>{r.pct}%</strong></div>
                      <Progress value={r.pct} ok={r.pct === 100} />
                    </div>
                  </td>
                  <td data-label="Avg grade">{r.avgScore ?? '—'}</td>
                  <td data-label="Current milestone" className="small muted">{r.currentMilestone || '—'}</td>
                  <td><Link className="btn btn-sm btn-primary" to={`/reports?student=${r.student._id}&course=${id}`}><FileText size={14} /> {t('Report')}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
