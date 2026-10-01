import { Languages } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../lib/i18n';

/** EN ⇄ عربي. Saved to the account when signed in (follows you to other devices), else to this browser. */
export default function LanguageToggle({ className = 'btn btn-ghost btn-sm lang-btn' }) {
  const { lang, setLang } = useI18n();
  const { user, applySession } = useAuth();
  const next = lang === 'ar' ? 'en' : 'ar';
  const flip = async () => {
    setLang(next);
    if (user) api.patch('/auth/me/preferences', { language: next }, { silent: true }).then(({ data }) => applySession(data)).catch(() => {});
  };
  return (
    <button type="button" className={className} onClick={flip} aria-label={next === 'ar' ? 'التبديل إلى العربية' : 'Switch to English'} title={next === 'ar' ? 'العربية' : 'English'}>
      <Languages size={16} /> <span lang={next}>{next === 'ar' ? 'عربي' : 'EN'}</span>
    </button>
  );
}
