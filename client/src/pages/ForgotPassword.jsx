import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { ErrorBox } from '../components/ui';
import { AuthShell } from './Login';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <div className="stack" style={{ width: 'min(100%, 380px)' }}>
          <MailCheck size={32} />
          <h2>Check your email</h2>
          <p>If an account exists for <strong>{email}</strong>, we’ve sent a link to reset your password. It works once and expires in 30 minutes.</p>
          <p className="small muted">No email after a few minutes? Check spam, or ask your company admin to send you a reset link.</p>
          <Link to="/login" className="btn"><ArrowLeft size={15} /> Back to sign in</Link>
        </div>
      ) : (
        <form onSubmit={submit} className="stack">
          <h2>Reset your password</h2>
          <p className="muted small">Enter your work email and we’ll send you a link to choose a new password.</p>
          <ErrorBox>{error}</ErrorBox>
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn-primary" disabled={busy || !email}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <Link to="/login" className="small"><ArrowLeft size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}
