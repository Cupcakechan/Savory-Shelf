// Theme initialisation — runs synchronously before paint to prevent flash.
// Loaded as a nonce-gated external script so 'unsafe-inline' can be removed
// from script-src in the Content-Security-Policy.
(function () {
  try {
    var t = localStorage.getItem('savoryshelf-theme');
    if (t === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  } catch (_) {}
})();
