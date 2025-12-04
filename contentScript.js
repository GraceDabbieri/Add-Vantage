// contentScript.js (merged injector)
// - Injects mainWorldInjection.js into the page (web_accessible_resources).
// - Avoids double-injection and uses try/catch for robustness.

(function () {
  try {
    // Avoid duplicate injection
    if (window.__maybe_malware_mainworld_injected__) return;
    window.__maybe_malware_mainworld_injected__ = true;

    // Check for an existing script with the same src (best-effort)
    const existing = Array.from(document.getElementsByTagName('script')).some(s => {
      try {
        const src = s.src || (s.getAttribute && s.getAttribute('src')) || '';
        return src && src.indexOf('mainWorldInjection.js') !== -1;
      } catch (e) {
        return false;
      }
    });
    if (existing) return;

    const scriptElement = document.createElement('script');
    scriptElement.src = chrome.runtime.getURL('mainWorldInjection.js');
    scriptElement.onload = function () { try { this.remove(); } catch (e) {} };
    (document.head || document.documentElement).appendChild(scriptElement);
  } catch (e) {
    // swallow injection errors to avoid breaking the page
  }
})();
