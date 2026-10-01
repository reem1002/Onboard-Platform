import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ErrorBox } from '../components/ui';
import PasswordField, { passwordOk } from '../components/PasswordField';
import { useT } from '../lib/i18n';
import { AuthShell } from './Login';

/** Shown after signing in with a temporary password chosen by an admin. */
export default function ForceChangePassword() {
  const t = useT();
  const { user, applySession, logout } = useAuth();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return setError(t('The two passwords don’t match.'));
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: cur, newPassword: pw });
      applySession(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form onSubmit={submit} className="stack">
        <h2>{t('Welcome, {name}', { name: user.name.split(' ')[0] })}</h2>
        <p className="muted small">{t('Your account was set up with a temporary password. Choose your own to continue — nobody else will know it.')}</p>
        <ErrorBox>{error}</ErrorBox>
        <PasswordField id="cur" label="Temporary password" autoComplete="current-password" value={cur} onChange={setCur} />
        <PasswordField id="pw" label="New password" value={pw} onChange={setPw} showRules />
        <PasswordField id="pw2" label="Repeat new password" value={pw2} onChange={setPw2} />
        <button className="btn btn-primary" disabled={busy || !cur || !passwordOk(pw) || !pw2}>{busy ? t('Saving…') : t('Save and continue')}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>{t('Sign out')}</button>
      </form>
    </AuthShell>
  );
}
