/* Ad-Vantage content script for comprehensive ad blocking on all websites */
// Top-level debug and host safelist
const DEBUG_COSMETIC = false; // set to true while debugging to log attempted removals
const HOST_SAFELIST = ['github.com', 'www.github.com'];
(function() {
  'use strict';

  // Comprehensive ad container selectors for all website types
  const AD_SELECTORS = [
    // Generic ad classes and IDs (more specific to avoid false positives)
    '[id*="google_ads"]',
    '[id*="google-ads"]',
    '[class*="google_ads"]',
    '[class*="google-ads"]',
    '[id*="ad-container"]',
    '[id*="ad_container"]',
    '[class*="ad-container"]',
    '[class*="ad_container"]',
    '[id*="ad-wrapper"]',
    '[id*="ad_wrapper"]',
    '[class*="ad-wrapper"]',
    '[class*="ad_wrapper"]',
    '[class*="advertisement"]',
    '[class*="ad-slot"]',
    '[class*="ad_slot"]',
    '[class*="ad-banner"]',
    '[class*="ad_banner"]',
    '[class*="ad-frame"]',
    '[class*="ad_frame"]',
    
    // Taboola, Outbrain, and similar content recommendation ads
    '[id*="taboola"]',
    '[class*="taboola"]',
    '[id*="outbrain"]',
    '[class*="outbrain"]',
    '[id*="revcontent"]',
    '[class*="revcontent"]',
    '[id*="mgid"]',
    '[class*="mgid"]',
    '[data-ad-unit]',
    '[data-ad-client]',
    
    // Video ads (pre-roll, mid-roll, overlay)
    '[class*="video-ad"]',
    '[class*="video_ad"]',
    '[id*="video-ad"]',
    '[id*="video_ad"]',
    '[class*="preroll"]',
    '[class*="pre-roll"]',
    '[class*="midroll"]',
    '[class*="mid-roll"]',
    '[class*="ad-overlay"]',
    '[class*="ad_overlay"]',
    
    // Sticky/fixed/floating ads
    '[class*="sticky-ad"]',
    '[class*="sticky_ad"]',
    '[class*="fixed-ad"]',
    '[class*="fixed_ad"]',
    '[class*="floating-ad"]',
    '[class*="floating_ad"]',
    '[class*="sidebar-ad"]',
    '[class*="sidebar_ad"]',
    
    // Native advertising & sponsored content
    '[class*="native-ad"]',
    '[class*="native_ad"]',
    '[class*="sponsored-content"]',
    '[class*="sponsored_content"]',
    '[class*="sponsored-post"]',
    '[class*="sponsored_post"]',
    '[class*="promoted-content"]',
    '[class*="promoted_content"]',
    '[data-native-ad]',
    '[data-sponsored]',
    
    // Display ads (Google AdSense, etc.)
    'ins.adsbygoogle',
    'ins[class*="adsbygoogle"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="googleadservices.com"]',
    
    // Common ad divs with various naming patterns
    'div[id^="ad-"]',
    'div[id^="ad_"]',
    'div[id^="ads-"]',
    'div[class^="ad-"]',
    'div[class^="ad_"]',
    'div[class^="ads-"]',
    'div[class*="-ad-"]',
    'div[class*="_ad_"]',
    
    // Specific ad networks and exchanges
    '[class*="teads"]',
    '[id*="teads"]',
    '[class*="pubmatic"]',
    '[id*="pubmatic"]',
    '[class*="criteo"]',
    '[id*="criteo"]',
    '[class*="appnexus"]',
    '[id*="appnexus"]',
    '[class*="rubicon"]',
    '[id*="rubicon"]',
    '[class*="openx"]',
    '[id*="openx"]',
    '[class*="indexExchange"]',
    '[class*="casalemedia"]',
    '[class*="bidswitch"]',
    '[class*="adform"]',
    '[class*="adsrvr"]',
    
    // News site specific
    '[class*="story-ad"]',
    '[class*="article-ad"]',
    '[class*="inline-ad"]',
    '[class*="content-ad"]',
    '[class*="leaderboard"]',
    '[class*="skyscraper"]',
    
    // E-commerce site ads
    '[class*="product-ad"]',
    '[class*="shopping-ad"]',
    '[class*="deals-ad"]',
    
    // Blog and content site specific
    '[class*="sidebar-widget"][class*="ad"]',
    '[class*="widget_ad"]',
    
    // Popups and interstitials
    '[class*="popup-ad"]',
    '[class*="pop-up-ad"]',
    '[class*="interstitial"]',
    '[class*="modal-ad"]',
    
    // Mobile-specific ads
    '[class*="mobile-ad"]',
    '[class*="mobile_ad"]',
    
    // Generic patterns (data attributes only)
    '[data-ad-name]',
    '[data-ad-id]',
    '[data-ad-slot]',
    '[data-ad-region]'
  ];

  // Function to hide an element
  function hideElement(el, reason) {
    if (!el) return;
    try {
      // Basic structural safelist by tag name
      const tag = el.tagName && el.tagName.toUpperCase();
      if (!tag) return;
  
      const STRUCTURAL_TAGS = ['NAV','HEADER','MAIN','FOOTER','TITLE','H1','H2','H3','ARTICLE','SECTION'];
      if (STRUCTURAL_TAGS.includes(tag)) {
        if (DEBUG_COSMETIC) console.log('[Ad-Vantage] skip structural element', tag, reason, el);
        return;
      }
  
      // Host safelist guard
      try {
        const hostname = (location && location.hostname) ? location.hostname.toLowerCase() : '';
        if (HOST_SAFELIST.some(h => hostname === h || hostname.endsWith('.' + h))) {
          if (DEBUG_COSMETIC) console.log('[Ad-Vantage] host safelisted — skip hide on', hostname, reason, el);
          return;
        }
      } catch (e) {
        // on error, be conservative and skip removal
        if (DEBUG_COSMETIC) console.warn('[Ad-Vantage] hideElement: host check failed, skipping removal', e);
        return;
      }
  
      if (DEBUG_COSMETIC) {
        console.group('[Ad-Vantage] hideElement');
        console.log('reason:', reason || 'unspecified', 'host:', location.hostname);
        console.log(el);
        console.groupEnd();
        // For debug preview-only mode, uncomment the next line to avoid actual removals:
        // return;
      }
  
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      } else if (el.style) {
        el.style.display = 'none';
      }
    } catch (e) {
      try { if (el && el.style) el.style.display = 'none'; } catch (_){}
    }
  }

  // Function to check if element looks like an ad based on content and attributes
  function looksLikeAd(element) {
    try {
      const text = element.innerText || element.textContent || '';
      const lower = text.toLowerCase();
      
      // Check for ad-related text patterns
      const adTextPatterns = [
        'advertisement',
        'sponsored',
        'promoted',
        'adchoices',
        'ad choices',
        'why this ad',
        'sponsored by',
        'promoted by',
        'ads by',
        'advertising',
        'partner content',
        'recommended for you'
      ];
      
      for (const pattern of adTextPatterns) {
        if (lower.includes(pattern)) {
          return true;
        }
      }
      
      // Short "ad" text likely indicates an ad label
      if (lower.includes('ad') && text.length < 50) {
        return true;
      }
      
      // Check attributes for ad-related data
      const adAttributes = [
        'data-ad',
        'data-google',
        'data-taboola',
        'data-outbrain',
        'data-mgid',
        'data-revcontent',
        'data-ad-name',
        'data-ad-id',
        'data-ad-slot',
        'data-ad-client',
        'data-ad-unit',
        'data-ad-channel',
        'data-ad-region',
        'data-ad-type',
        'data-sponsored',
        'data-native-ad'
      ];
      
      for (const attr of adAttributes) {
        if (element.hasAttribute(attr)) return true;
      }
      
      // Check class and id for ad patterns - only check for very specific patterns to avoid false positives
      const className = element.className || '';
      const id = element.id || '';
      const combined = (className + ' ' + id).toLowerCase();
      
      // Only match very specific ad-related patterns, not just any "ad" substring
      const adPatterns = [
        /\bads?[-_]?slot/i,
        /\bads?[-_]?unit/i,
        /\bads?[-_]?banner/i,
        /\bads?[-_]?container/i,
        /\bads?[-_]?wrapper/i,
        /\bads?[-_]?frame/i,
        /\bads?[-_]?region/i,
        /\bads?[-_]?space/i,
        /\bsponsored?[-_]?(content|post)/i,
        /\bnative?[-_]?ad/i,
        /\bleaderboard/i,
        /\bskyscraper/i
      ];
      
      for (const pattern of adPatterns) {
        if (pattern.test(combined)) {
          return true;
        }
      }
      
      // Check for tracking pixels and tiny iframes (1x1 or very small)
      if (element.tagName === 'IMG' || element.tagName === 'IFRAME') {
        const width = parseInt(element.getAttribute('width')) || element.offsetWidth;
        const height = parseInt(element.getAttribute('height')) || element.offsetHeight;
        if ((width <= 1 && height <= 1) || (width * height < 10)) {
          return true;
        }
      }
      
      // Check iframe src for ad domains
      if (element.tagName === 'IFRAME') {
        const src = element.src || element.getAttribute('src') || '';
        const adDomains = [
          'doubleclick',
          'googlesyndication',
          'googleadservices',
          'taboola',
          'outbrain',
          'revcontent',
          'mgid',
          'advertising',
          'adserver',
          'adsystem'
        ];
        
        for (const domain of adDomains) {
          if (src.includes(domain)) return true;
        }
      }
      
      // Check for elements with aria-label indicating ads
      const ariaLabel = element.getAttribute('aria-label') || '';
      if (ariaLabel && /ad|sponsor|promot/i.test(ariaLabel)) {
        return true;
      }
      
    } catch (e) {
      // Silently fail
    }
    
    return false;
  }

  // Main sweep function
  function sweepAds(root) {
    try {
      const hostname = (location && location.hostname) ? location.hostname.toLowerCase() : '';
      if (HOST_SAFELIST.some(h => hostname === h || hostname.endsWith('.' + h))) {
        if (DEBUG_COSMETIC) console.log('[Ad-Vantage] sweepAds skipped on safelisted host:', hostname);
        return;
      }
  
      const context = root || document;
  
      // 1) Remove explicit ad selectors (safe)
      const EXPLICIT_AD_SELECTORS = [
        'ins.adsbygoogle',
        '.adsbygoogle',
        '.ad-slot',
        '.ad-placeholder',
        '.ad-banner',
        '.banner-ad',
        '.leaderboard-ad',
        '.mpu-ad',
        '.ad-container--ad'
      ].join(',');
  
      try {
        context.querySelectorAll(EXPLICIT_AD_SELECTORS).forEach(el => {
          try { hideElement(el, 'explicit-selector'); } catch(_) {}
        });
      } catch (e) {
        if (DEBUG_COSMETIC) console.warn('[Ad-Vantage] explicit selector pass failed', e);
      }
  
      // 2) Conservative heuristic pass: only examine iframes, ins elements, and elements with exact tokens
      const candidates = context.querySelectorAll('iframe, ins, [class], [id]');
      const KNOWN_IFRAME_HOSTS = ['doubleclick','googlesyndication','amazon-adsystem','adnxs','adform'];
  
      for (const el of candidates) {
        try {
          // Skip structural elements quickly
          const tag = el.tagName && el.tagName.toUpperCase();
          if (['NAV','HEADER','MAIN','FOOTER','TITLE','H1','H2','H3','ARTICLE','SECTION'].includes(tag)) continue;
  
          // Exact token class checks (avoid substring matches)
          const cls = (el.className || '').toString();
          if (/\badsbygoogle\b/i.test(cls) || /\bad-slot\b/i.test(cls) || /\bad-placeholder\b/i.test(cls) || /\bad-banner\b/i.test(cls)) {
            hideElement(el, 'exact-class-token');
            continue;
          }
  
          // If element contains an iframe from a known ad host, remove the container
          const iframe = el.querySelector && el.querySelector('iframe');
          if (iframe && iframe.src) {
            try {
              const url = new URL(iframe.src, location.href);
              const host = (url.hostname || '').toLowerCase();
              if (KNOWN_IFRAME_HOSTS.some(tok => host.includes(tok))) {
                hideElement(el, 'iframe-known-host');
                continue;
              }
            } catch (e) {
              // ignore URL parse errors
            }
          }
  
          // small tracking images
          if (tag === 'IMG') {
            const w = el.getAttribute && el.getAttribute('width');
            const h = el.getAttribute && el.getAttribute('height');
            if ((w === '1' && h === '1') || (w === '0' && h === '0')) {
              hideElement(el, 'tiny-pixel');
              continue;
            }
          }
  
          // size-based banner heuristic: only remove if element does not look like navigation/header and has few anchors
          if (el.getBoundingClientRect) {
            const rect = el.getBoundingClientRect();
            if (rect && rect.width && rect.height) {
              const sizes = [[728,90],[300,250],[320,50],[970,90]];
              for (const s of sizes) {
                const tolW = Math.max(8, Math.round(s[0]*0.12));
                const tolH = Math.max(8, Math.round(s[1]*0.12));
                if (Math.abs(rect.width - s[0]) <= tolW && Math.abs(rect.height - s[1]) <= tolH) {
                  try {
                    const anchors = el.querySelectorAll && el.querySelectorAll('a');
                    if (!anchors || anchors.length < 3) {
                      hideElement(el, 'size-match');
                      break;
                    }
                  } catch (e) {
                    hideElement(el, 'size-match');
                    break;
                  }
                }
              }
            }
          }
        } catch (e) {
          // per-element failure: continue
          if (DEBUG_COSMETIC) console.warn('[Ad-Vantage] candidate check failed', e);
        }
      }
  
      // Keep any further logic (AdSense container removal, empty iframe cleanup) but ensure they use hideElement() and conservative checks.
    } catch (e) {
      if (DEBUG_COSMETIC) console.error('[Ad-Vantage] sweepAds error', e);
    }
  }

  // Block common ad-related JavaScript objects
  function blockAdAPIs() {
    try {
      // Stub out common ad APIs
      if (typeof window.googletag === 'undefined') {
        window.googletag = {
          cmd: [],
          defineSlot: function() { return this; },
          addService: function() { return this; },
          enableServices: function() {},
          display: function() {},
          pubads: function() { return this; },
          setTargeting: function() { return this; },
          collapseEmptyDivs: function() {}
        };
      }
      
      // Stub AdSense
      if (typeof window.adsbygoogle === 'undefined') {
        window.adsbygoogle = [];
      }
      
    } catch (e) {
      // Silently fail
    }
  }

  // Initial sweep
  function init() {
    console.log('[Ad-Vantage] Comprehensive ad blocker initialized on', window.location.hostname);
    blockAdAPIs();
    sweepAds(document);
    
    // Clean up body overflow in case ads added restrictions
    try {
      document.body.style.removeProperty('overflow');
    } catch (e) {
      // Silently fail
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch for new ads being added dynamically
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) { // Element node
            sweepAds(node);
          }
        });
      }
    });
  });

  // Start observing the DOM for dynamic changes
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Run periodic sweeps (some ads load with delays or after user interaction)
  setInterval(() => sweepAds(document), 2000);

  // Also sweep on scroll (lazy-loaded ads)
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => sweepAds(document), 500);
  }, { passive: true });

  // Sweep on page visibility change (some ads wait for tab to be active)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      setTimeout(() => sweepAds(document), 500);
    }
  });

  console.log('[Ad-Vantage] Ad blocker fully active and monitoring', window.location.hostname);
})();
