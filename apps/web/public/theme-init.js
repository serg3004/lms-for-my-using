/* Sets the light/dark theme before the first paint. Classic script on purpose: the CSP allows 'self' scripts only. */
(function () {
  var mode = 'system';
  try {
    var stored = window.localStorage.getItem('lms.themeMode');
    if (stored === 'light' || stored === 'dark') mode = stored;
  } catch (error) {
    mode = 'system';
  }
  var dark = mode === 'dark' || (mode === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
