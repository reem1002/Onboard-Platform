import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Award, ShieldAlert, ShieldCheck } from 'lucide-react';
import { fmtDate } from '../components/ui';
import { useT } from '../lib/i18n';

/** Public page behind the QR code on every certificate — no sign-in needed. */
export default function Verify() {
  const t = useT();
  const { code } = useParams();
  const [state, setState] = useState(null);
  useEffect(() => {
    axios.get(`/api/certificates/verify/${encodeURIComponent(code)}`).then(({ data }) => setState(data)).catch(() => setState({ valid: false, notFound: true }));
  }, [code]);
  return (
    <div className="verify-wrap">
      <div className="card verify-card">
        {!state ? <p className="muted">{t('Checking…')}</p> : state.notFound ? (
          <>
            <ShieldAlert size={36} className="text-danger" />
            <h1>{t('Certificate not found')}</h1>
            <p className="muted">{t('This verification code doesn’t match any certificate. Check the link or ask the holder for a new copy.')}</p>
          </>
        ) : (
          <>
            {state.valid ? <ShieldCheck size={36} className="text-ok" /> : <ShieldAlert size={36} className="text-danger" />}
            <span className={`chip ${state.valid ? 'chip-ok' : 'chip-danger'}`}>{state.valid ? t('Valid certificate') : t('This certificate was revoked')}</span>
            <h1>{state.studentName}</h1>
            <p>{t('completed')} <strong>{state.courseTitle}</strong> ({state.courseCode}){state.certificationTarget ? `, aligned to ${state.certificationTarget}` : ''}.</p>
            <dl className="meta-strip" style={{ width: '100%' }}>
              <div><dt>{t('Certificate no.')}</dt><dd>{state.number}</dd></div>
              <div><dt>{t('Issued')}</dt><dd>{fmtDate(state.issuedAt)}</dd></div>
              <div><dt>{t('Issued by')}</dt><dd>{state.issuer}</dd></div>
            </dl>
          </>
        )}
        <p className="small muted" style={{ marginTop: 12 }}><Award size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {t('Certificate verification')}</p>
      </div>
    </div>
  );
}
