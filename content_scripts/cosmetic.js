// Safer cosmetic content script
// - Avoids removing nav/menu elements by safelisting navigation roles and common menu classes.
// - Uses URL parsing for script src detection (only blocks well-known ad hostnames).
// - Inline script blocking only for specific ad snippets (e.g. adsbygoogle), not generic "ads".

(function () {
  if (typeof window === 'undefined') return;
  if (window.__maybe_malware_cosmetic_installed__) return;
  window.__maybe_malware_cosmetic_installed__ = true;

  // Defensive storage reader
  function getStorage(key, fallback) {
    return new Promise((resolve) => {
      try {
        if (!chrome || !chrome.storage || !chrome.storage.local) return resolve(fallback);
        chrome.storage.local.get({ [key]: fallback }, (res) => resolve(res ? res[key] : fallback));
      } catch (e) {
        resolve(fallback);
      }
    });
  }

  // Known ad host tokens and exact hostnames
  const KNOWN_AD_HOST_TOKENS = [
    'doubleclick',
    'googlesyndication',
    'googleadservices',
    'pagead2',
    'amazon-adsystem',
    'adnxs',
    'adroll',
    'adsafeprotected'
  ];

  // Explicit inline ad keywords (avoid generic "ads")
  const INLINE_AD_KEYWORDS = [
    'adsbygoogle',
    'googlesyndication',
    'googletag.pubads',
    'googletag.defineSlot',
    'googletag.cmd.push'
  ];

  function isHostnameAdLike(urlStr) {
    try {
      const url = new URL(urlStr, location.href);
      const host = (url.hostname || '').toLowerCase();
      // Check for known tokens anywhere in hostname (doubleclick, etc.)
      return KNOWN_AD_HOST_TOKENS.some(token => host.includes(token));
    } catch (e) {
      // if it isn't a full URL, do a simple substring check but still conservative
      const s = String(urlStr || '').toLowerCase();
      return KNOWN_AD_HOST_TOKENS.some(token => s.includes(token));
    }
  }

  function isInlineAdScriptText(text) {
    try {
      if (!text) return false;
      const lc = text.toLowerCase();
      return INLINE_AD_KEYWORDS.some(k => lc.includes(k));
    } catch (e) {
      return false;
    }
  }

  // Safelist check: don't treat navigation/menu elements as ads
  function isNavigationElement(el) {
    if (!el || !el.nodeType) return false;
    try {
      // role or semantic element types
      if (el.getAttribute && (el.getAttribute('role') === 'navigation' || el.getAttribute('role') === 'menu')) return true;
      const tag = (el.tagName || '').toLowerCase();
      if (tag === 'nav' || tag === 'menu') return true;

      // common class/id tokens for nav/menus — keep list conservative
      const cls = (el.className || '') + ' ' + (el.id || '');
      const navTokens = ['nav', 'navbar', 'navigation', 'menu', 'dropdown', 'site-nav'];
      for (const t of navTokens) {
        // match whole tokens to avoid partial matches (e.g. "megamenu" still allowed but "ad-nav" not accidentally)
        const re = new RegExp('(?:\\b|-)'+t+'(?:\\b|-)','i');
        if (re.test(cls)) return true;
      }

      // if the element contains interactive menu items or many anchors, it's probably navigation
      if (el.querySelectorAll) {
        const anchors = el.querySelectorAll('a');
        if (anchors && anchors.length >= 3) return true;
      }
    } catch (e) {}
    return false;
  }

  // Remove/hide only if element is strongly ad-like
  function isLikelyAdElement(el) {
    if (!el) return false;
    try {
      if (isNavigationElement(el) || el.closest && el.closest('nav, [role="navigation"], [role="menu"], .menu, .navbar')) {
        return false;
      }

      // explicit markers in class/id
      const idCls = ((el.className && String(el.className)) || '') + ' ' + ((el.id && String(el.id)) || '');
      // match tokens like "adsbygoogle" or "ad-slot" but avoid matching "dashboard" etc.
      if (/\badsbygoogle\b/i.test(idCls) || /\bad-slot\b/i.test(idCls) || /\bad__\b/i.test(idCls)) return true;

      // elements that contain iframes from known ad hosts
      const ifr = el.querySelector && el.querySelector('iframe');
      if (ifr && ifr.src && isHostnameAdLike(ifr.src)) return true;

      // very small pixel images
      if (el.tagName && el.tagName.toLowerCase() === 'img') {
        const w = el.getAttribute && el.getAttribute('width');
        const h = el.getAttribute && el.getAttribute('height');
        if ((w === '1' && h === '1') || (w === '0' && h === '0')) return true;
      }

      // check computed styles for placeholder-like size but avoid structural elements
      const rect = el.getBoundingClientRect && el.getBoundingClientRect();
      if (rect && rect.width && rect.height) {
        // treat a container as ad-like if it matches typical banner sizes AND it doesn't look like nav/header
        const common = [
          [728, 90],
          [300, 250],
          [320, 50],
          [970, 90]
        ];
        for (const s of common) {
          const tolW = Math.max(10, Math.round(s[0] * 0.12));
          const tolH = Math.max(10, Math.round(s[1] * 0.12));
          if (Math.abs(rect.width - s[0]) <= tolW && Math.abs(rect.height - s[1]) <= tolH) {
            // final guard: avoid if it contains several nav links
            try {
              const anchors = el.querySelectorAll && el.querySelectorAll('a');
              if (!anchors || anchors.length < 3) return true;
            } catch (e) {}
          }
        }
      }
    } catch (e) {}
    return false;
  }

  // Remove or hide element safely
  function removeOrHide(el) {
    if (!el) return;
    try {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
        return true;
      }
      if (el.style) el.style.display = 'none';
    } catch (e) {
      try { if (el.style) el.style.display = 'none'; } catch (e2) {}
    }
    return false;
  }

  // Attempt safe early injection of CSS (fallback inline)
  try {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content_scripts/cosmetic.css');
    link.type = 'text/css';
    (document.head || document.documentElement).appendChild(link);
  } catch (e) {
    const style = document.createElement('style');
    style.textContent = `.adsbygoogle, ins.adsbygoogle { display: none !important; }`;
    (document.head || document.documentElement).appendChild(style);
  }

  (async function main() {
    const enabled = await getStorage('cosmeticEnabled', true);
    if (!enabled) return;

    // Early removal of scripts with ad-like hostnames or explicit inline ad snippets
    try {
      const scripts = Array.from(document.getElementsByTagName('script') || []);
      for (const s of scripts) {
        try {
          const src = s.src || (s.getAttribute && s.getAttribute('src')) || '';
          if (src && isHostnameAdLike(src)) {
            s.remove && s.remove();
            continue;
          }
          if (!src) {
            const text = s.textContent || s.innerText || '';
            if (isInlineAdScriptText(text)) {
              s.remove && s.remove();
            }
          }
        } catch (e) {}
      }
    } catch (e) {}

    // Intercept node insertions but conservatively drop only scripts that match ad hostnames / inline ad snippets
    (function interceptNodeInsertions() {
      const origAppend = Node.prototype.appendChild;
      const origInsertBefore = Node.prototype.insertBefore;

      function shouldBlockScriptNode(node) {
        try {
          if (!node) return false;
          const tag = (node.tagName || '').toLowerCase();
          if (tag !== 'script') return false;
          const src = node.src || (node.getAttribute && node.getAttribute('src')) || '';
          if (src && isHostnameAdLike(src)) return true;
          const text = node.textContent || node.innerText || '';
          if (!src && isInlineAdScriptText(text)) return true;
        } catch (e) {}
        return false;
      }

      Node.prototype.appendChild = function (node) {
        try {
          if (shouldBlockScriptNode(node)) {
            return node;
          }
        } catch (e) {}
        return origAppend.call(this, node);
      };

      Node.prototype.insertBefore = function (node, refNode) {
        try {
          if (shouldBlockScriptNode(node)) {
            return node;
          }
        } catch (e) {}
        return origInsertBefore.call(this, node, refNode);
      };
    })();

    // MutationObserver fallback: remove newly-added script nodes that are clearly ad-related
    try {
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (!m.addedNodes) continue;
          for (const node of m.addedNodes) {
            try {
              if (node && node.tagName && node.tagName.toLowerCase() === 'script') {
                const src = node.src || (node.getAttribute && node.getAttribute('src')) || '';
                const text = node.textContent || node.innerText || '';
                if ((src && isHostnameAdLike(src)) || (!src && isInlineAdScriptText(text))) {
                  removeOrHide(node);
                  continue;
                }
              } else if (node && node.querySelectorAll) {
                // scan subtree for script tags
                const scripts = node.querySelectorAll('script');
                for (const s of scripts) {
                  try {
                    const src2 = s.src || (s.getAttribute && s.getAttribute('src')) || '';
                    const text2 = s.textContent || s.innerText || '';
                    if ((src2 && isHostnameAdLike(src2)) || (!src2 && isInlineAdScriptText(text2))) {
                      removeOrHide(s);
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {}
          }
        }
      });

      observer.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (e) {}

    // Periodic cleanup during warm-up to catch anything that slipped through
    const cleanupInterval = setInterval(() => {
      try {
        const scrips = Array.from(document.getElementsByTagName('script') || []);
        for (const s of scrips) {
          try {
            const src = s.src || (s.getAttribute && s.getAttribute('src')) || '';
            if ((src && isHostnameAdLike(src)) || (!src && isInlineAdScriptText(s.textContent || s.innerText || ''))) {
              removeOrHide(s);
            }
          } catch (e) {}
        }
      } catch (e) {}
    }, 1000);

    // stop periodic cleanup after warm-up period to reduce overhead
    setTimeout(() => clearInterval(cleanupInterval), 30 * 1000);

    // Lightweight banner detection/removal (conservative)
    const bannerClassSelectors = [
      '.ad-banner', '.banner-ad', '.leaderboard-ad', '.mpu-ad', '.ad-placeholder', '.adsbygoogle', 'ins.adsbygoogle'
    ].join(',');

    function collapseBanners() {
      try {
        // remove explicitly-known ad nodes first
        document.querySelectorAll(bannerClassSelectors).forEach(el => {
          try { if (isLikelyAdElement(el)) removeOrHide(el); } catch (e) {}
        });

        // size-based scan for likely banners but avoid nav/header elements
        const candidates = document.querySelectorAll('iframe, img, div, section, aside');
        const sizes = [[728,90],[300,250],[320,50],[970,90]];
        for (const el of candidates) {
          try {
            if (isNavigationElement(el)) continue;
            const rect = el.getBoundingClientRect && el.getBoundingClientRect();
            if (!rect || rect.width === 0 || rect.height === 0) continue;
            for (const s of sizes) {
              const tolW = Math.max(10, Math.round(s[0]*0.12));
              const tolH = Math.max(10, Math.round(s[1]*0.12));
              if (Math.abs(rect.width - s[0]) <= tolW && Math.abs(rect.height - s[1]) <= tolH) {
                // final guard: avoid if it contains several nav links
                try {
                  const anchors = el.querySelectorAll && el.querySelectorAll('a');
                  if (!anchors || anchors.length < 3) {
                    if (isLikelyAdElement(el)) removeOrHide(el);
                    break;
                  }
                } catch (e) { if (isLikelyAdElement(el)) removeOrHide(el); break; }
              }
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    collapseBanners();

    try {
      const bannerObserver = new MutationObserver(collapseBanners);
      bannerObserver.observe(document.documentElement || document, { childList: true, subtree: true });
    } catch (e) {}

  })();
})();
