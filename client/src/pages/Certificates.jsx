import { useState } from 'react';
import { Award, Copy, Check, FileDown, ShieldOff } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { downloadFile } from '../api/files';
import { useAuth } from '../context/AuthContext';
import { ErrorBox, PageSkeleton, fmtDate } from '../components/ui';
import { useT } from '../lib/i18n';

export default function Certificates() {
  const { user } = useAuth();
  const t = useT();
  const { data, error, loading, reload } = useFetch('/certificates');
  const [copied, setCopied] = useState('');
  const [err, setErr] = useState('');
  const isEmployee = user.role === 'employee';

  if (loading) return <PageSkeleton variant={isEmployee ? 'cards' : 'table'} />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  const certs = data.certificates;

  const pdf = (c) => downloadFile(`/certificates/${c._id}/pdf`, `Certificate ${c.courseCode}.pdf`).catch((e) => setErr(errorMessage(e)));
  const copy = async (c) => { try { await navigator.clipboard.writeText(c.verifyUrl); setCopied(c._id); setTimeout(() => setCopied(''), 1500); } catch { /* ignore */ } };
  const revoke = async (c) => {
    const reason = window.prompt(`Revoke certificate ${c.number}? Give a reason (shown on the verification page as “revoked”).`);
    if (!reason) return;
    try { await api.post(`/certificates/${c._id}/revoke`, { reason }); reload(); } catch (e) { setErr(errorMessage(e)); }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{isEmployee ? t('My certificates') : t('Certificates')}</h1>
          <p>{t(isEmployee ? 'Issued automatically when you complete every assignment and quiz of a course. Anyone can check them with the verification link.' : 'Issued automatically when an employee completes every graded item of a course.')}</p>
        </div>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {!certs.length ? (
        <div className="card empty"><Award size={30} style={{ margin: '0 auto 8px' }} /><p>{t(isEmployee ? 'No certificates yet — finish a course to earn one.' : 'No certificates issued yet.')}</p></div>
      ) : isEmployee ? (
        <div className="cert-grid">
          {certs.map((c) => (
            <article key={c._id} className={`cert-card ${c.revokedAt ? 'revoked' : ''}`}>
              <Award size={28} className="cert-icon" />
              <span className="small muted">{t('Certificate of completion')} · {c.number}</span>
              <h2 className="h-card">{c.courseTitle}</h2>
              {c.certificationTarget && <span className="small">{t('Aligned to {x}', { x: c.certificationTarget })}</span>}
              <div className="row small muted"><span>{t('Issued {date}', { date: fmtDate(c.issuedAt) })}</span>{c.avgScore != null && <span>· {t('Average grade {n}%', { n: c.avgScore })}</span>}</div>
              {c.revokedAt ? <span className="chip chip-danger"><ShieldOff size={12} /> {t('Revoked')}</span> : (
                <div className="row">
                  <button className="btn btn-primary btn-sm" onClick={() => pdf(c)}><FileDown size={14} /> {t('Download PDF')}</button>
                  <button className="btn btn-sm" onClick={() => copy(c)}>{copied === c._id ? <><Check size={14} /> {t('Copied')}</> : <><Copy size={14} /> {t('Copy verification link')}</>}</button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="card card-flush">
          <table className="table">
            <thead><tr><th>{t('Employee')}</th><th>{t('Course')}</th><th>{t('Number')}</th><th>{t('Issued')}</th><th>{t('Avg grade')}</th><th /></tr></thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c._id} style={{ opacity: c.revokedAt ? 0.55 : 1 }}>
                  <td data-label="Employee"><strong>{c.studentName}</strong><div className="small muted">{c.companyName}</div></td>
                  <td data-label="Course"><span className="item-code">{c.courseCode}</span></td>
                  <td data-label="Number">{c.number}{c.revokedAt && <span className="chip chip-danger" style={{ marginInlineStart: 6 }}>{t('Revoked')}</span>}</td>
                  <td data-label="Issued">{fmtDate(c.issuedAt)}</td>
                  <td data-label="Avg grade">{c.avgScore != null ? `${c.avgScore}%` : '—'}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      {!c.revokedAt && <button className="btn btn-sm" onClick={() => pdf(c)}><FileDown size={14} /> PDF</button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => copy(c)} title={t('Copy verification link')}>{copied === c._id ? <Check size={14} /> : <Copy size={14} />}</button>
                      {user.role === 'super_admin' && !c.revokedAt && <button className="btn btn-ghost btn-sm" onClick={() => revoke(c)}>{t('Revoke')}</button>}
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
