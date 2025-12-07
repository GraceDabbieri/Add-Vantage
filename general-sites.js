/* Ad-Vantage content script for comprehensive ad blocking on all websites */
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
  function hideElement(element) {
    if (!element || element.__adVantageHidden) return;
    
    try {
      element.style.setProperty('display', 'none', 'important');
      element.style.setProperty('visibility', 'hidden', 'important');
      element.style.setProperty('opacity', '0', 'important');
      element.style.setProperty('height', '0', 'important');
      element.style.setProperty('width', '0', 'important');
      element.style.setProperty('position', 'absolute', 'important');
      element.style.setProperty('pointer-events', 'none', 'important');
      element.setAttribute('aria-hidden', 'true');
      element.__adVantageHidden = true;
    } catch (e) {
      // Silently fail
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
      const context = root || document;
      
      // Remove known ad selectors (most reliable method)
      AD_SELECTORS.forEach(selector => {
        try {
          const elements = context.querySelectorAll(selector);
          elements.forEach(hideElement);
        } catch (e) {
          // Selector might be invalid, skip it
        }
      });
      
      // Check for elements that look like ads - be more selective
      const adContainers = context.querySelectorAll('div[id], div[class], aside, section[class], ins, iframe');
      adContainers.forEach(element => {
        if (looksLikeAd(element)) {
          hideElement(element);
        }
      });
      
      // Remove empty iframes that might be ad placeholders
      const iframes = context.querySelectorAll('iframe');
      iframes.forEach(iframe => {
        try {
          const src = iframe.src || iframe.getAttribute('src') || '';
          if (!src || src === 'about:blank' || src === '') {
            hideElement(iframe);
          }
        } catch (e) {
          // Might be cross-origin, skip
        }
      });
      
      // Remove AdSense containers specifically
      const adsenseElements = context.querySelectorAll('ins.adsbygoogle');
      adsenseElements.forEach(hideElement);
      
      // Remove sticky/fixed elements that are likely ads (more conservative)
      const allFixed = context.querySelectorAll('[style*="fixed"], [style*="sticky"]');
      allFixed.forEach(element => {
        try {
          if (looksLikeAd(element)) {
            hideElement(element);
          }
        } catch (e) {
          // Skip
        }
      });
      
    } catch (e) {
      console.error('[Ad-Vantage] Error during ad sweep:', e);
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
