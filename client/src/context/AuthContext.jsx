import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, setAccessToken, setSessionLostHandler } from '../api/client';
import { applyTheme } from '../lib/theme';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  // Each account carries its own theme; signing out keeps the last one on this device
  useEffect(() => { if (user?.preferences?.theme) applyTheme(user.preferences.theme); }, [user?.preferences?.theme]);

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
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  // After a profile edit or password change
  const applySession = useCallback((data) => {
    if (data.accessToken) setAccessToken(data.accessToken);
    if (data.user) setUser(data.user);
  }, []);

  const value = useMemo(() => ({ user, booting, login, logout, applySession }), [user, booting, login, logout, applySession]);
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
