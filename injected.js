/* Page context script injected by Ad-Vantage. This file is loaded via a <script src="chrome-extension://.../content/injected.js"> element
   to avoid CSP blocking of inline scripts on pages like YouTube. */
(function(){
  try {
    // Separate concerns: hard-block ad networks vs rewrite YouTube JSON APIs
    const HARD_BLOCK_PARTS = [
      '/pagead/',
      '/pagead/gen_204',
      '/pagead/adview',
      '/pcs/activeview',
      '/ad_data_204',
      '/get_midroll_',
      '/get_ads',
      '/api/stats/ads',
      '/api/stats/atr',
      '/doubleclick/',
      '/ad/',
      'pagead2.googlesyndication.com',
      'googleads.g.doubleclick.net',
      'googleadservices.com',
      'ads.youtube.com',
      'static.doubleclick.net'
    ];
    const JSON_REWRITE_PARTS = [
      '/youtubei/v1/player',
      '/youtubei/v1/next',
      '/youtubei/v1/get_video_info',
      '/youtubei/v1/browse'
    ];

    function containsAny(url, parts){
      if(!url) return false;
      try{ url = String(url); }catch(e){ return false; }
      return parts.some(p => url.indexOf(p) !== -1);
    }

    // Compatibility mode flag (set localStorage 'adVantageCompat' = '1' to relax rewrites)
    const COMPAT_MODE = (function(){
      try { return window.localStorage.getItem('adVantageCompat') === '1'; } catch(_) { return false; }
    })();

    function scrubAdFields(obj){
      if(!obj || typeof obj !== 'object') return obj;
      try {
        const removeKeys = (o, depth = 0) => {
          if(!o || typeof o !== 'object') return;
          if(depth > 20) return; // Prevent infinite recursion
          
          // Known ad-related keys - only remove these specific keys
          const keys = [
            'adPlacements','adBreaks','adSlots','playerAds','adSafetyReason','adPlaybackContext','adDeviceContext',
            'playerLegacyDesktopWatchAdsRenderer','adSlotRenderer','displayAdRenderer','promotedSparklesTextSearchRenderer',
            'promotedVideoRenderer','promotedSparklesWebRenderer','companionAdRenderer','linearAdSequence',
            'adSlotMetadata','instreamVideoAdRenderer','imageCompanionAdRenderer','carouselAdRenderer'
          ];
          
          // Don't touch critical keys that might contain "ad" but aren't ads
          const protectedKeys = [
            'videoDetails', 'streamingData', 'playabilityStatus', 'videoId', 'title', 
            'formats', 'adaptiveFormats', 'thumbnail', 'description', 'lengthSeconds',
            'viewCount', 'author', 'channelId', 'isLiveContent', 'microformat'
          ];
          
          for(const k of keys){
            if(k in o && !protectedKeys.includes(k)){
              try {
                delete o[k];
              } catch(_){}
            }
          }
          
          // Recursively walk nested objects/arrays
          if(Array.isArray(o)){
            // Filter out ad objects from arrays, but be conservative
            for(let i = o.length - 1; i >= 0; i--){
              try {
                const item = o[i];
                if(item && typeof item === 'object'){
                  // Only remove items that are clearly ads
                  if(item.adSlotRenderer || item.adPlacementRenderer || 
                     item.instreamVideoAdRenderer || item.displayAdRenderer){
                    o.splice(i, 1);
                    continue;
                  }
                  removeKeys(item, depth + 1);
                }
              } catch(_){}
            }
          } else {
            for(const k in o){ 
              if(Object.prototype.hasOwnProperty.call(o,k) && !protectedKeys.includes(k)) {
                removeKeys(o[k], depth + 1);
              }
            }
          }
        };
        removeKeys(obj);
      } catch(e) {
        try { console.warn('[Ad-Vantage] Error in scrubAdFields:', e); } catch(_){ }
      }
      // Also normalize playabilityStatus and remove ad params
      try{
        const maybeNormalize = (ps, hasStreaming) => {
          if(!ps || !ps.status) return;
          const reason = ps.reason || '';
          if(/adblock|ads?\s+blocked|advertising/i.test(reason)) {
            ps.status = 'OK'; ps.reason = 'OK'; return;
          }
          // If streamingData exists and status not OK, relax to OK in compatibility mode.
          if(COMPAT_MODE && hasStreaming && ps.status !== 'OK') {
            ps.status = 'OK';
          }
        };
        const hasStreaming = !!(obj.streamingData && (obj.streamingData.formats || obj.streamingData.adaptiveFormats));
        if(obj.playabilityStatus) maybeNormalize(obj.playabilityStatus, hasStreaming);
        if(obj.playerResponse && obj.playerResponse.playabilityStatus) {
          const hasInnerStreaming = !!(obj.playerResponse.streamingData && (obj.playerResponse.streamingData.formats || obj.playerResponse.streamingData.adaptiveFormats));
          maybeNormalize(obj.playerResponse.playabilityStatus, hasInnerStreaming);
        }
      }catch(_){}
      
      // Remove ad params from video URLs
      try {
        const cleanFormats = (formats) => {
          if(!Array.isArray(formats)) return;
          formats.forEach(fmt => {
            if(fmt && fmt.url){
              try {
                fmt.url = fmt.url.replace(/[?&](aitags|ad_tag|ad_flags|adsystem)=[^&]*/gi, '');
              } catch(_){}
            }
          });
        };
        if(obj.streamingData){
          cleanFormats(obj.streamingData.formats);
          cleanFormats(obj.streamingData.adaptiveFormats);
        }
        if(obj.playerResponse && obj.playerResponse.streamingData){
          cleanFormats(obj.playerResponse.streamingData.formats);
          cleanFormats(obj.playerResponse.streamingData.adaptiveFormats);
        }
      }catch(_){}
      
      return obj;
    }

    // Patch fetch: hard-block ad networks, rewrite JSON for YouTube APIs
    (function(){
      const origFetch = window.fetch;
      if (!origFetch) return; // Safety check
      
      function wrappedFetch(input, init){
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
              // Always return original response on error to prevent breakage
              if (!resp.ok) return resp;
              
              try {
                const ct = resp.headers.get('content-type') || '';
                if(ct.includes('json')){
                  const originalData = await resp.clone().json();
                  
                  // Don't modify if essential data is missing
                  if (!originalData || typeof originalData !== 'object') {
                    return resp;
                  }
                  
                  const dataClone = JSON.parse(JSON.stringify(originalData));
                  const cleaned = scrubAdFields(dataClone);
                  
                  // Multiple fallback checks to ensure we don't break video playback
                  const lostStreaming = (originalData.streamingData && !cleaned.streamingData);
                  const originalFormats = originalData.streamingData && (originalData.streamingData.formats || originalData.streamingData.adaptiveFormats);
                  const cleanedFormats = cleaned.streamingData && (cleaned.streamingData.formats || cleaned.streamingData.adaptiveFormats);
                  const lostVideoDetails = (originalData.videoDetails && !cleaned.videoDetails);
                  const lostPlayability = (originalData.playabilityStatus && !cleaned.playabilityStatus);
                  
                  // If we lost any critical data, return original
                  if(lostStreaming || (originalFormats && !cleanedFormats) || lostVideoDetails || lostPlayability) {
                    try { console.warn('[Ad-Vantage] Fallback to original response (critical data missing)'); } catch(_){ }
                    return resp;
                  }
                  
                  const body = JSON.stringify(cleaned);
                  const headers = new Headers(resp.headers);
                  headers.set('content-type','application/json');
                  headers.delete('content-length');
                  return new Response(body, { status: resp.status, statusText: resp.statusText, headers });
                }
              } catch(e) { 
                try { console.warn('[Ad-Vantage] Error processing response, using original:', e); } catch(_){ }
              }
              return resp;
            }).catch(err => {
              // On any promise rejection, fallback to original fetch
              try { console.warn('[Ad-Vantage] Fetch error, using original:', err); } catch(_){ }
              return origFetch.apply(this, arguments);
            });
          }
        }catch(_){}

        return origFetch.apply(this, arguments);
      }
      // Make wrapper look native
      try { wrappedFetch.toString = origFetch.toString.bind(origFetch); } catch(_){}
      try { window.fetch = wrappedFetch; } catch(_){}
    })();

    // Patch XMLHttpRequest: only hard-block ad networks, avoid stubbing player APIs
    (function(){
      const XHR = window.XMLHttpRequest;
      if (!XHR) return; // Safety check
      
      const origOpen = XHR.prototype.open;
      const origSend = XHR.prototype.send;
      
      if (!origOpen || !origSend) return; // Safety check

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
      // Make wrappers look native
      try { XHR.prototype.open.toString = Function.prototype.toString.bind(origOpen); } catch(_){}
      try { XHR.prototype.send.toString = Function.prototype.toString.bind(origSend); } catch(_){}
    })();

    // Neutralize ytInitialPlayerResponse and ytInitialData when set synchronously by inline scripts
    try{
      Object.defineProperty(window, 'ytInitialPlayerResponse', {
        configurable: true,
        get: function(){ return this.__ytInitialPlayerResponse; },
        set: function(val){
          try{
            if(val && typeof val === 'object'){
              scrubAdFields(val);
              console.log('[Ad-Vantage] Cleaned ytInitialPlayerResponse');
            }
          }catch(e){}
          this.__ytInitialPlayerResponse = val;
        }
      });
    }catch(e){}
    
    try{
      Object.defineProperty(window, 'ytInitialData', {
        configurable: true,
        get: function(){ return this.__ytInitialData; },
        set: function(val){
          try{
            if(val && typeof val === 'object'){
              scrubAdFields(val);
              console.log('[Ad-Vantage] Cleaned ytInitialData');
            }
          }catch(e){}
          this.__ytInitialData = val;
        }
      });
    }catch(e){}

    // Intercept navigator.sendBeacon for ad pings
    (function(){
      const origBeacon = navigator.sendBeacon;
      try{
        function wrappedBeacon(url, data){
          try{ if(containsAny(url, HARD_BLOCK_PARTS)) return true; }catch(e){}
          return origBeacon.apply(this, arguments);
        }
        // Make wrapper look native
        try { wrappedBeacon.toString = origBeacon.toString.bind(origBeacon); } catch(_){}
        navigator.sendBeacon = wrappedBeacon;
      }catch(e){}
    })();

    // Intercept <img src> beacons to YouTube ad stats endpoints and neuter them with a 1x1 pixel
    (function(){
      const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
      const matchAdBeacon = (url) => {
        try{
          if(!url) return false;
          url = String(url);
          return /\/api\/stats\/ads|pagead\/|googleads\./i.test(url);
        }catch(_){ return false; }
      };
      try {
        const proto = HTMLImageElement.prototype;
        const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
        if (srcDesc && srcDesc.set) {
          const origSet = srcDesc.set;
          srcDesc.set = function(v){
            try { if (matchAdBeacon(v)) v = PIXEL; } catch(_){ }
            return origSet.call(this, v);
          };
          Object.defineProperty(proto, 'src', srcDesc);
        }
        const origSetAttribute = proto.setAttribute;
        proto.setAttribute = function(name, value){
          if (name && name.toLowerCase() === 'src' && matchAdBeacon(value)) {
            return origSetAttribute.call(this, name, PIXEL);
          }
          return origSetAttribute.apply(this, arguments);
        };
        try { proto.setAttribute.toString = Function.prototype.toString.bind(origSetAttribute); } catch(_){}
      } catch(_){/* ignore */}
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
        'ytd-enforcement-message-view-model',
        'ytd-enforcement-message-renderer',
        'ytd-enforcement-message-view-model tp-yt-paper-dialog',
        'ytd-popup-container tp-yt-paper-dialog',
        'tp-yt-paper-dialog.ytd-popup-container',
        'yt-upsell-dialog-renderer',
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

  // Initial sweep and ensure body isn’t artificially blocked
  sweep(document);
  try { document.documentElement.classList.remove('style-scope','ytd-enforcement-message-view-model'); } catch(_){}
  try { document.body.style.setProperty('overflow','auto','important'); } catch(_){}

      // Observe DOM for future insertions
      try{
        const mo = new MutationObserver((mutations) => {
          for(const m of mutations){
            if(m.type === 'childList'){
              m.addedNodes && m.addedNodes.forEach(n => {
                if(n && n.nodeType === 1){
                  sweep(n);
                  try { if (n === document.body || n === document.documentElement) n.style.setProperty('overflow','auto','important'); } catch(_){}
                }
              });
            } else if(m.type === 'attributes'){
              if(m.target) {
                sweep(m.target);
                if(m.target === document.body || m.target === document.documentElement) {
                  try { m.target.style.setProperty('overflow','auto','important'); } catch(_){}
                }
              }
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

    // Video player ad skipper - monitor player state and force skip ads
    (function(){
      let lastCheck = 0;
      const checkInterval = 100; // Check more frequently
      
      function isAdPlaying(){
        try {
          const player = document.querySelector('.html5-video-player');
          if(!player) return false;
          
          // Check multiple ad indicators
          if(player.classList.contains('ad-showing')) return true;
          if(player.classList.contains('ad-interrupting')) return true;
          if(player.classList.contains('ad-showing-preview')) return true;
          
          // Check for ad text/overlay
          const adText = document.querySelector('.ytp-ad-text, .ytp-ad-preview-text');
          if(adText && adText.offsetParent !== null) return true;
          
          // Check for skip button (indicates ad)
          const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container');
          if(skipBtn && skipBtn.offsetParent !== null) return true;
          
          // Check player element attributes
          const moviePlayer = document.querySelector('#movie_player');
          if(moviePlayer){
            const adModule = moviePlayer.querySelector('.ytp-ad-module');
            if(adModule && adModule.offsetParent !== null) return true;
          }
          
          return false;
        } catch(_){ return false; }
      }
      
      function skipAd(){
        try {
          const now = Date.now();
          if(now - lastCheck < checkInterval) return;
          lastCheck = now;
          
          const video = document.querySelector('video.html5-main-video');
          const player = document.querySelector('.html5-video-player');
          
          if(!video || !player) return;
          
          // Check if ad is playing
          if(isAdPlaying()){
            // Try clicking skip button first
            const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button');
            if(skipBtn){
              try { 
                skipBtn.click();
                console.log('[Ad-Vantage] Clicked skip button');
              } catch(_){}
            }
            
            // Force video to end if no skip button or it didn't work
            if(video.duration && isFinite(video.duration) && video.duration > 0){
              try { 
                video.currentTime = video.duration;
                console.log('[Ad-Vantage] Skipped ad by jumping to end');
              } catch(_){}
            }
            
            // Mute ad audio
            try { video.muted = true; } catch(_){}
            
            // Speed up ad playback
            try { if(video.playbackRate < 16) video.playbackRate = 16; } catch(_){}
            
            // Remove ad classes
            player.classList.remove('ad-showing','ad-interrupting','ad-showing-preview');
            
            // Hide ad overlays
            const adOverlays = document.querySelectorAll('.ytp-ad-player-overlay, .ytp-ad-player-overlay-instream-info, .ytp-ad-text, .ytp-ad-preview-text, .ytp-ad-overlay-slot');
            adOverlays.forEach(el => {
              try { el.style.display = 'none'; } catch(_){}
            });
          } else {
            // Not an ad, restore normal playback
            try { if(video.muted && video.volume === 0) video.muted = false; } catch(_){}
            try { if(video.playbackRate > 1) video.playbackRate = 1; } catch(_){}
          }
        } catch(_){/* ignore */}
      }
      
      // Run checks on interval
      const adCheckInterval = setInterval(skipAd, checkInterval);
      
      // Also run on video events
      function attachVideoListeners(){
        try {
          const video = document.querySelector('video.html5-main-video');
          if(video && !video.__adVantageWatched){
            video.__adVantageWatched = true;
            video.addEventListener('timeupdate', skipAd);
            video.addEventListener('play', skipAd);
            video.addEventListener('playing', skipAd);
            video.addEventListener('loadedmetadata', skipAd);
            console.log('[Ad-Vantage] Attached video event listeners');
          }
        } catch(_){}
      }
      
      attachVideoListeners();
      
      // Watch for video element creation/changes
      try {
        const videoObserver = new MutationObserver(attachVideoListeners);
        videoObserver.observe(document.documentElement, { childList: true, subtree: true });
      } catch(_){}
      
      // Watch for navigation
      try {
        window.addEventListener('yt-navigate-finish', attachVideoListeners);
        window.addEventListener('yt-page-data-updated', attachVideoListeners);
      } catch(_){}
      
      try { console.log('[Ad-Vantage] Video ad skipper installed (aggressive mode)'); } catch(_){}
    })();

    try{ console.log('[Ad-Vantage] injected page script installed'); }catch(e){}
  }catch(e){ console.error('[Ad-Vantage] injected script failed', e); }
})();
