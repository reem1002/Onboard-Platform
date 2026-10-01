import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AR } from './ar';
import { AR_STAFF } from './ar-staff';

const DICT = { ...AR_STAFF, ...AR };

/**
 * Tiny i18n: the English text is the key, so anything not translated yet simply shows in English.
 *   const t = useT();  t('Dashboard')  t('{n} new', { n: 3 })
 * Arabic switches the whole layout to right-to-left (the CSS uses logical properties throughout).
 */
const I18n = createContext({ lang: 'en', setLang: () => {}, t: (s) => s });

const read = () => { try { return localStorage.getItem('lms.lang') === 'ar' ? 'ar' : 'en'; } catch { return 'en'; } };

export function applyLang(lang) {
  const root = document.documentElement;
  root.lang = lang;
  root.dir = lang === 'ar' ? 'rtl' : 'ltr';
  try { localStorage.setItem('lms.lang', lang); } catch { /* ignore */ }
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(read);
  useEffect(() => applyLang(lang), [lang]);
  const setLang = useCallback((l) => setLangState(l === 'ar' ? 'ar' : 'en'), []);
  const t = useCallback((s, vars) => {
    let out = (lang === 'ar' && DICT[s]) || s;
    if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, v);
    return out;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);
export const useT = () => useContext(I18n).t;
/** Locale for dates: Arabic month names with Western digits (scores and dates stay easy to compare). */
export const dateLocale = () => (document.documentElement.lang === 'ar' ? 'ar-EG-u-nu-latn' : undefined);
