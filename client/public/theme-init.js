// Runs before the app paints so the saved theme never flashes. Mirrors src/lib/theme.js.
(function () {
  try {
    var pref = localStorage.getItem('lms.theme') || 'default';
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var t = pref === 'system' ? (dark ? 'dark' : 'default') : pref;
    if (t !== 'default') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: default theme */ }
})();
