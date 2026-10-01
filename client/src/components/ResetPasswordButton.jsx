import { useState } from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { ErrorBox, fmtDate } from './ui';
import { useT } from '../lib/i18n';

/**
 * Emergency password reset by an admin.
 * The admin never sees or sets a password: the old one is disabled, every session is signed out,
 * and a single-use link (24 h) is created for the user to choose a new one.
 */
export default function ResetPasswordButton({ user, className = 'btn btn-sm btn-ghost' }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} title={`Reset password for ${user.name}`}>
        <KeyRound size={14} /> {t('Reset password')}
      </button>
      {open && <ResetModal user={user} onClose={() => setOpen(false)} />}
    </>
  );
}

function ResetModal({ user, onClose }) {
  const t = useT();
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const [copied, setCopied] = useState(false);

  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.post(`/users/${user._id}/reset-password`, { sendEmail });
      setRes(data);
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(res.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* select manually */ }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal stack" role="dialog" aria-modal="true" aria-labelledby="rp-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="rp-title">{t('Reset password')}</h2>
        {!res ? (
          <>
            <p className="small"><strong>{user.name}</strong> <span className="muted">· {user.email}</span></p>
            <ul className="bullets small">
              <li>{t('Their current password stops working immediately.')}</li>
              <li>{t('They’re signed out of every device.')}</li>
              <li>{t('You get a one-time link (valid 24 hours) so they can choose a new password. You never see it.')}</li>
            </ul>
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Also email the link to {user.email}
            </label>
            <p className="small muted">{t('Only do this when you’ve confirmed the request with the person (for example by phone). The action is recorded in the audit log.')}</p>
            <ErrorBox>{err}</ErrorBox>
            <div className="row"><span className="spacer" /><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-danger" disabled={busy} onClick={go}>{busy ? t('Resetting…') : t('Reset password')}</button></div>
          </>
        ) : (
          <>
            <div className="alert alert-ok">Password reset. {res.emailed ? `We emailed the link to ${user.email}.` : 'Send the link below to the person over a trusted channel.'}</div>
            <div className="field">
              <label htmlFor="rp-url">One-time link · expires {fmtDate(res.expiresAt)} {new Date(res.expiresAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</label>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input id="rp-url" className="input" readOnly value={res.url} onFocus={(e) => e.target.select()} />
                <button className="btn" onClick={copy}>{copied ? <><Check size={14} /> {t('Copied')}</> : <><Copy size={14} /> {t('Copy')}</>}</button>
              </div>
            </div>
            <p className="small muted">{t('The link works once. Closing this window won’t show it again — reset again if it gets lost.')}</p>
            <div className="row"><span className="spacer" /><button className="btn btn-primary" onClick={onClose}>{t('Done')}</button></div>
          </>
        )}
      </div>
    </div>
  );
}
