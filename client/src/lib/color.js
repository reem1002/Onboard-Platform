/** Small colour helpers for company accent colours (WCAG relative luminance). */
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const luminance = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
/** Black or white text, whichever reads better on the colour */
export const inkOn = (h) => (contrast(h, '#ffffff') >= contrast(h, '#141414') ? '#ffffff' : '#141414');
export function shade(h, amt) {
  const [r, g, b] = hex(h).map((c) => Math.round(Math.min(1, Math.max(0, c + amt)) * 255));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
