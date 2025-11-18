/* Page context script injected by Ad-Vantage. This file is loaded via a <script src="chrome-extension://.../content/injected.js"> element
   to avoid CSP blocking of inline scripts on pages like YouTube. */
(function(){
  try {
    // Separate concerns: hard-block ad networks vs rewrite YouTube JSON APIs
    const HARD_BLOCK_PARTS = [
      '/pagead/',
      '/pagead/gen_204',
      '/pagead/adview',
      '/get_midroll_',
      '/doubleclick/',
      'pagead2.googlesyndication.com',
      'googleads.g.doubleclick.net',
      'googleadservices.com',
      'ads.youtube.com'
    ];
    const JSON_REWRITE_PARTS = [
      '/youtubei/v1/player',
      '/youtubei/v1/next',
      '/youtubei/v1/get_video_info'
    ];

    function containsAny(url, parts){
      if(!url) return false;
      try{ url = String(url); }catch(e){ return false; }
      return parts.some(p => url.indexOf(p) !== -1);
    }

    function scrubAdFields(obj){
      if(!obj || typeof obj !== 'object') return obj;
      try {
        const removeKeys = (o) => {
          if(!o || typeof o !== 'object') return;
          // Known ad-related keys
          const keys = ['adPlacements','adBreaks','adSlots','playerAds','adSafetyReason','adPlaybackContext','adDeviceContext'];
          for(const k of keys){ if(k in o) try{ o[k] = Array.isArray(o[k]) ? [] : undefined; }catch(_){} }
          // Recursively walk nested objects/arrays
          if(Array.isArray(o)) { o.forEach(removeKeys); return; }
          for(const k in o){ if(Object.prototype.hasOwnProperty.call(o,k)) removeKeys(o[k]); }
        };
        removeKeys(obj);
      } catch(_) {}
      // Also normalize playabilityStatus
      try{
        if(obj.playabilityStatus && obj.playabilityStatus.status) obj.playabilityStatus.status = 'OK';
        if(obj.playerResponse && obj.playerResponse.playabilityStatus && obj.playerResponse.playabilityStatus.status) {
          obj.playerResponse.playabilityStatus.status = 'OK';
        }
      }catch(_){}
      return obj;
    }

    // Patch fetch: hard-block ad networks, rewrite JSON for YouTube APIs
    (function(){
      const origFetch = window.fetch;
      window.fetch = function(input, init){
        let url = '';
        try{
          if(typeof input === 'string') url = input;
          else if(input && input.url) url = input.url;
        }catch(_){}

        try{
          // Hard block ad script/metrics endpoints
          if(containsAny(url, HARD_BLOCK_PARTS)){
            const isScript = /pagead|googlesyndication|doubleclick|googleadservices|pagead2/i.test(url);
            if(isScript){
              const js = '/* Ad-Vantage stub */window.google_ad_status=1;';
              return Promise.resolve(new Response(js, { status: 200, headers: { 'Content-Type': 'application/javascript' } }));
            }
            // For non-scripts, return empty 204
            return Promise.resolve(new Response('', { status: 204 }));
          }

          // Rewrite YouTube JSON API responses to strip ads without breaking structure
          if(containsAny(url, JSON_REWRITE_PARTS)){
            return origFetch.apply(this, arguments).then(async (resp) => {
              try {
                const ct = resp.headers.get('content-type') || '';
                if(ct.includes('json')){
                  const data = await resp.clone().json();
                  const cleaned = scrubAdFields(data);
                  const body = JSON.stringify(cleaned);
                  const headers = new Headers(resp.headers);
                  headers.set('content-type','application/json');
                  headers.delete('content-length');
                  return new Response(body, { status: resp.status, statusText: resp.statusText, headers });
                }
              } catch(_) { /* fallthrough to original resp */ }
              return resp;
            });
          }
        }catch(_){}

        return origFetch.apply(this, arguments);
      };
    })();

    // Patch XMLHttpRequest: only hard-block ad networks, avoid stubbing player APIs
    (function(){
      const XHR = window.XMLHttpRequest;
      const origOpen = XHR.prototype.open;
      const origSend = XHR.prototype.send;

      XHR.prototype.open = function(method, url){
        try{ this.__ad_block_url = url; }catch(e){}
        return origOpen.apply(this, arguments);
      };

      XHR.prototype.send = function(body){
        try{
          const url = this.__ad_block_url || '';
          if(containsAny(url, HARD_BLOCK_PARTS)){
            const isScript = /pagead|googlesyndication|doubleclick|googleadservices|pagead2/i.test(url);
            const responseBody = isScript ? '/* Ad-Vantage stub */window.google_ad_status=1;' : '';
            try{ this.readyState = 4; }catch(e){}
            try{ this.status = isScript ? 200 : 204; }catch(e){}
            try{ this.response = responseBody; }catch(e){}
            try{ this.responseText = responseBody; }catch(e){}
            try{ if(typeof this.onreadystatechange === 'function') this.onreadystatechange(); }catch(e){}
            try{ if(typeof this.onload === 'function') this.onload(); }catch(e){}
            return;
          }
        }catch(e){ /* swallow */ }
        return origSend.apply(this, arguments);
      };
    })();

    // Neutralize ytInitialPlayerResponse when set synchronously by inline scripts
    try{
      Object.defineProperty(window, 'ytInitialPlayerResponse', {
        configurable: true,
        get: function(){ return this.__ytInitialPlayerResponse; },
        set: function(val){
          try{
            if(val && typeof val === 'object') scrubAdFields(val);
          }catch(e){}
          this.__ytInitialPlayerResponse = val;
        }
      });
    }catch(e){}

    // Intercept navigator.sendBeacon for ad pings
    (function(){
      const origBeacon = navigator.sendBeacon;
      try{
        navigator.sendBeacon = function(url, data){
          try{ if(containsAny(url, HARD_BLOCK_PARTS)) return true; }catch(e){}
          return origBeacon.apply(this, arguments);
        };
      }catch(e){}
    })();

    // Dynamically remove/hide ad UI components that appear after navigation or async loads
    (function(){
      const SELECTORS = [
        // Common YT ad renderers/containers
        '#masthead-ad',
        '#player-ads',
        'ytd-ad-slot-renderer',
        'ytd-display-ad-renderer',
        'ytd-in-feed-ad-layout-renderer',
        'ytd-promoted-video-renderer',
        'ytd-promoted-sparkles-text-search-renderer',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-statement-banner-renderer',
        'ytd-compact-promoted-video-renderer',
        'ytd-compact-promoted-item-renderer',
        'ytd-companion-slot-renderer',
        '.ytd-player-legacy-desktop-watch-ads-renderer',
        '[is-promoted]',
        '[has-advertiser]',
        // Player overlay ad bits (shouldn’t appear, but hide just in case)
        '.ytp-ad-module',
        '.ytp-ad-player-overlay',
        '.ytp-ad-overlay-slot',
        '.ytp-ad-text',
        '.ytp-ad-skip-button-slot'
      ];

      function hideNode(node){
        try{
          if(!node || node.__adVantageHidden) return;
          node.style.setProperty('display','none','important');
          node.setAttribute('aria-hidden','true');
          node.__adVantageHidden = true;
        }catch(_){/* ignore */}
      }

      function sweep(root){
        try{
          for(const sel of SELECTORS){
            const list = (root || document).querySelectorAll(sel);
            for(const el of list) hideNode(el);
          }
        }catch(_){/* ignore */}
      }

      // Initial sweep
      sweep(document);

      // Observe DOM for future insertions
      try{
        const mo = new MutationObserver((mutations) => {
          for(const m of mutations){
            if(m.type === 'childList'){
              m.addedNodes && m.addedNodes.forEach(n => {
                if(n && n.nodeType === 1){
                  sweep(n);
                }
              });
            } else if(m.type === 'attributes'){
              if(m.target) sweep(m.target);
            }
          }
        });
        mo.observe(document.documentElement || document, { subtree: true, childList: true, attributes: true });
        try{ console.log('[Ad-Vantage] UI ad observer attached'); }catch(_){ }
      }catch(_){/* ignore */}

      // YouTube SPA navigation events
      try{
        window.addEventListener('yt-navigate-finish', () => sweep(document), true);
        window.addEventListener('yt-page-data-updated', () => sweep(document), true);
      }catch(_){/* ignore */}
    })();

    try{ console.log('[Ad-Vantage] injected page script installed'); }catch(e){}
  }catch(e){ console.error('[Ad-Vantage] injected script failed', e); }
})();
