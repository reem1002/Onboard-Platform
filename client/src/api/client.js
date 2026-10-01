import axios from 'axios';

/**
 * Access token lives ONLY in memory (never localStorage → not stealable by XSS persistence).
 * The refresh token is an httpOnly cookie the browser sends automatically to /api/auth/*.
 */
let accessToken = null;
let onSessionLost = () => {};

export const setAccessToken = (t) => {
  accessToken = t;
};
export const setSessionLostHandler = (fn) => {
  onSessionLost = fn;
};

export const api = axios.create({ baseURL: '/api', withCredentials: true, timeout: 30000 });

/* In-flight request counter → drives the thin activity bar at the top of the page.
   Background polls pass { silent: true } so they don't flicker the bar. */
let inFlight = 0;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(inFlight));
export const onActivity = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const done = (config) => { if (config && !config.silent && config._counted) { config._counted = false; inFlight = Math.max(0, inFlight - 1); emit(); } };

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (!config.silent && !config._counted) { config._counted = true; inFlight += 1; emit(); }
  return config;
});

// Single-flight refresh: many parallel 401s → one refresh call
let refreshing = null;
export function refreshSession() {
  if (!refreshing) {
    refreshing = axios
      .post('/api/auth/refresh', null, { withCredentials: true })
      .then((r) => {
        setAccessToken(r.data.accessToken);
        return r.data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.response.use(
  (r) => { done(r.config); return r; },
  async (error) => {
    done(error.config);
    const original = error.config;
    const status = error.response?.status;
    const isAuthCall = original?.url?.startsWith('/auth/');
    if (status === 401 && !original._retried && !isAuthCall) {
      original._retried = true;
      try {
        await refreshSession();
        return api(original);
      } catch {
        setAccessToken(null);
        onSessionLost();
      }
    }
    return Promise.reject(error);
  }
);

export const errorMessage = (e, fallback = 'Something went wrong. Try again.') => {
  if (e?.code === 'ERR_CANCELED') return 'Cancelled.';
  if (!e?.response) return 'Can’t reach the server — check your connection (or that the API is running) and try again.';
  const d = e.response.data;
  if (e.response.status === 429 && !d?.error) return 'Too many requests — please wait a minute and try again.';
  if (d?.details?.fieldErrors) {
    const first = Object.entries(d.details.fieldErrors)[0];
    if (first) return `${first[0]}: ${first[1][0]}`;
  }
  if (d?.details?.formErrors?.length) return d.details.formErrors[0];
  return d?.error || fallback;
};
