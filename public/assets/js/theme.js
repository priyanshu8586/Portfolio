// Runs early (blocking, in <head>) so the saved theme is applied before first paint.
(function () {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
      return;
    }
  } catch (e) { /* storage blocked: fall through */ }
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
