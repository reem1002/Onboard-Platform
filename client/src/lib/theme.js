/** Theme preference: 'default' (warm pastel), 'light', 'dark' or 'system' (follows the OS). */
export const THEMES = [
  { id: 'default', label: 'Default', hint: 'Warm pastel' },
  { id: 'light', label: 'Light', hint: 'Crisp white' },
  { id: 'dark', label: 'Dark', hint: 'Easy on the eyes' },
  { id: 'system', label: 'Match device', hint: 'Default or dark' },
];

const META = { default: '#f4efe9', light: '#eef1f5', dark: '#121212' };
let mq;
let current = 'default';

function resolve(pref) {
  if (pref !== 'system') return pref;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
}

function paint() {
  const t = resolve(current);
  const root = document.documentElement;
  if (t === 'default') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[t] || META.default);
}

export function applyTheme(pref = 'default') {
  current = THEMES.some((x) => x.id === pref) ? pref : 'default';
  try { localStorage.setItem('lms.theme', current); } catch { /* ignore */ }
  paint();
  if (!mq && window.matchMedia) {
    mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', () => current === 'system' && paint());
  }
}

export const currentTheme = () => current;
