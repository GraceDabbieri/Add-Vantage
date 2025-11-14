(function(){
try {
  const s = document.createElement('script');
  // load the actual file exposed by the manifest
  s.src = chrome.runtime.getURL('injected.js');
  s.type = 'text/javascript';
  s.async = false;
  (document.documentElement || document.head || document.body).appendChild(s);
  // optional: remove after load
  s.onload = function(){ try { console.log('[Ad-Vantage] injected script loaded'); } catch(e){} };
  s.onerror = function(){ try { console.warn('[Ad-Vantage] failed to load injected script'); } catch(e){} };
} catch (e) {
  // If chrome.runtime is not available for some reason, do nothing to avoid inline injection
  // Do not fallback to inline injection to stay compliant with strict CSP
  try { console.warn('[Ad-Vantage] exception creating script element', e); } catch(_){}
}
})();
