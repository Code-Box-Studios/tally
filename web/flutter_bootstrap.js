{{flutter_js}}
{{flutter_build_config}}

// Compiled builds receive a versioned public-assets manifest. Flutter's live
// development server has no manifest and keeps its normal reload workflow.
(async () => {
  const version = document.querySelector('meta[name="tally-shell-version"]')?.content;
  if (version && 'serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register(`tally-shell-sw.js?v=${version}`);
      await Promise.race([navigator.serviceWorker.ready, new Promise(resolve => setTimeout(resolve, 10000))]);
    } catch (_) {
      // Online startup remains available when a browser refuses app-shell storage.
    }
  }
  await _flutter.loader.load();
})();
