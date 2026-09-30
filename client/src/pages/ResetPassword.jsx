import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { ErrorBox, Loader } from '../components/ui';
import PasswordField, { passwordOk } from '../components/PasswordField';
import { AuthShell } from './Login';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const nav = useNavigate();
  const [check, setCheck] = useState({ loading: true });
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Keep the token out of browser history / referrers once read
    window.history.replaceState(null, '', '/reset-password');
    api.get('/auth/reset-password/check', { params: { token } })
      .then(({ data }) => setCheck({ ok: true, email: data.email }))
      .catch((e) => setCheck({ ok: false, error: errorMessage(e) }));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) return setError('The two passwords don’t match.');
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password: pw });
      nav('/login', { replace: true, state: { notice: 'Password updated. Sign in with your new password.' } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      {check.loading ? <Loader /> : !check.ok ? (
        <div className="stack" style={{ width: 'min(100%, 380px)' }}>
          <h2>This link doesn’t work anymore</h2>
          <p>{check.error}</p>
          <Link to="/forgot-password" className="btn btn-primary">Request a new link</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          <h2>Choose a new password</h2>
          {check.email && <p className="muted small">For {check.email}</p>}
          <ErrorBox>{error}</ErrorBox>
          <PasswordField id="pw" label="New password" value={pw} onChange={setPw} showRules />
          <PasswordField id="pw2" label="Repeat new password" value={pw2} onChange={setPw2} />
          <button className="btn btn-primary" disabled={busy || !passwordOk(pw) || !pw2}>{busy ? 'Saving…' : 'Save new password'}</button>
          <p className="small muted">You’ll be signed out of every other device.</p>
        </form>
      )}
    </AuthShell>
  );
}
