import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Strength hint that mirrors the server rules (10+ chars, upper, lower, number). */
export function passwordChecks(v) {
  return [
    ['At least 10 characters', v.length >= 10],
    ['An uppercase letter', /[A-Z]/.test(v)],
    ['A lowercase letter', /[a-z]/.test(v)],
    ['A number', /[0-9]/.test(v)],
  ];
}
export const passwordOk = (v) => passwordChecks(v).every(([, ok]) => ok);

export default function PasswordField({ id, label, value, onChange, autoComplete = 'new-password', showRules = false, required = true }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input id={id} className="input" type={show ? 'text' : 'password'} autoComplete={autoComplete} required={required} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="pw-toggle" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {showRules && (
        <ul className="pw-rules" aria-live="polite">
          {passwordChecks(value).map(([t, ok]) => <li key={t} className={ok ? 'ok' : ''}>{ok ? '✓' : '•'} {t}</li>)}
        </ul>
      )}
    </div>
  );
}
