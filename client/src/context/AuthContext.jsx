import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, setAccessToken, setSessionLostHandler } from '../api/client';
import { applyTheme } from '../lib/theme';
import { useI18n } from '../lib/i18n';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [signedOut, setSignedOut] = useState(false); // after an explicit sign-out the next login starts at the dashboard

  // Each account carries its own theme and language; signing out keeps the last ones on this device
  const { setLang } = useI18n();
  useEffect(() => { if (user?.preferences?.theme) applyTheme(user.preferences.theme); }, [user?.preferences?.theme]);
  useEffect(() => { if (user?.preferences?.language) setLang(user.preferences.language); }, [user?.preferences?.language, setLang]);

  // Restore session on load using the httpOnly refresh cookie
  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
    refreshSession()
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  const login = useCallback(async (email, password, rememberMe = false) => {
    const { data } = await api.post('/auth/login', { email, password, rememberMe });
    setAccessToken(data.accessToken);
    setSignedOut(false);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setSignedOut(true);
      setUser(null);
    }
  }, []);

  // After a profile edit or password change
  const applySession = useCallback((data) => {
    if (data.accessToken) setAccessToken(data.accessToken);
    if (data.user) setUser(data.user);
  }, []);

  const value = useMemo(() => ({ user, booting, signedOut, login, logout, applySession }), [user, booting, signedOut, login, logout, applySession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const can = {
  // Platform admin: everything. Instructor: only assigned courses (the API decides per course).
  admin: (u) => u?.role === 'super_admin',
  author: (u) => ['super_admin', 'instructor'].includes(u?.role),
  grade: (u) => ['super_admin', 'instructor'].includes(u?.role),
  // Customer side: the company admin manages their own employees and assigns courses
  manageTeam: (u) => u?.role === 'company_admin',
  viewTeam: (u) => ['super_admin', 'company_admin'].includes(u?.role),
  report: (u) => ['super_admin', 'instructor', 'company_admin'].includes(u?.role),
};
