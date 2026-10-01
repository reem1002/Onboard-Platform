import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { inkOn, luminance, shade } from '../lib/color';

const BrandingContext = createContext({ branding: null, refresh: () => {} });

/** Apply a company's accent to the CSS tokens (customers only — platform staff keep the platform look). */
function apply(b) {
  const root = document.documentElement;
  const props = ['--accent', '--accent-ink', '--accent-hover', '--brand'];
  if (!b?.accentColor) {
    props.forEach((p) => root.style.removeProperty(p));
    root.classList.remove('branded');
    return;
  }
  const c = b.accentColor;
  root.style.setProperty('--accent', c);
  root.style.setProperty('--accent-ink', inkOn(c));
  root.style.setProperty('--accent-hover', shade(c, luminance(c) > 0.4 ? -0.08 : 0.08));
  root.style.setProperty('--brand', c);
  root.classList.add('branded');
}

export function BrandingProvider({ children }) {
  const { user } = useAuth();
  const [branding, setBranding] = useState(null);
  const refresh = useCallback(() => {
    if (!user?.company) { setBranding(null); apply(null); return; }
    api.get('/branding/me', { silent: true }).then(({ data }) => { setBranding(data.branding); apply(data.branding); }).catch(() => {});
  }, [user?.company]);
  useEffect(() => { refresh(); }, [refresh, user?._id]);
  useEffect(() => () => apply(null), []);
  return <BrandingContext.Provider value={{ branding, refresh }}>{children}</BrandingContext.Provider>;
}

export const useBranding = () => useContext(BrandingContext);
