import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../api/client';
import { ErrorBox } from '../components/ui';
import { useT } from '../lib/i18n';
import PasswordField from '../components/PasswordField';
import LanguageToggle from '../components/LanguageToggle';

export function AuthShell({ children }) {
  const t = useT();
  return (
    <div className="auth-wrap">
      <section className="auth-art">
        <div className="brand" style={{ paddingInline: 0 }}>
          <span className="brand-mark"><ShieldCheck size={18} /></span> Onboard
        </div>
        <div>
          <h1>{t('Your first weeks, one clear path.')}</h1>
          <p>{t('See exactly what to finish, submit your work, and get reviewed feedback from your instructor.')}</p>
        </div>
        <p className="foot small" style={{ color: 'var(--ink-2)' }}>{t('Employee training for security teams')}</p>
      </section>
      <main className="auth-form"><div className="auth-lang"><LanguageToggle /></div>{children}</main>
    </div>
  );
}

export default function Login() {
  const t = useT();
  const { user, login } = useAuth();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password, remember);
    } catch (err) {
      setError(errorMessage(err, t('Sign-in failed.')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <form onSubmit={submit} className="stack" noValidate>
        <h2>{t('Sign in')}</h2>
        <p className="muted small">{t('Use the account your company created for you.')}</p>
        {loc.state?.notice && <div className="alert alert-ok">{t(loc.state.notice)}</div>}
        <ErrorBox>{error}</ErrorBox>
        <div className="field">
          <label htmlFor="email">{t('Work email')}</label>
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <PasswordField id="password" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <label className="row small" style={{ gap: 8 }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> {t('Remember me for 30 days')}
          </label>
          <Link to="/forgot-password" className="small">{t('Forgot password?')}</Link>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>{t('Only tick “remember me” on your own device.')}</p>
        <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !email || !password}>
          {busy ? t('Signing in…') : t('Sign in')}
        </button>
      </form>
    </AuthShell>
  );
}
