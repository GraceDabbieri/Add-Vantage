// background.js — MV3 service worker (merged)
// Combines robust loading + dedupe of rules.json, safe high-offset dynamic IDs
// (avoid colliding with static rule_resources), improved error handling and messaging,
// and straightforward lifecycle handling from both versions.

// ---- Configuration --------------------------------------------------------
const OFFSET = 10000; // high-offset base for dynamic rule ids to avoid collision

// ---- Helpers ---------------------------------------------------------------
async function loadRulesFromFile() {
  try {
    const url = chrome.runtime.getURL('rules.json');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to fetch rules.json (HTTP ' + resp.status + ')');
    const rules = await resp.json();

    if (!Array.isArray(rules)) {
      throw new Error('rules.json must be a JSON array of rule objects');
    }

    // Deduplicate by urlFilter + action.type + serialized resourceTypes to avoid redundant rules
    const seen = new Set();
    const deduped = [];
    for (const rule of rules) {
      try {
        const urlFilter = (rule && rule.condition && rule.condition.urlFilter) ? String(rule.condition.urlFilter) : '';
        const actionType = (rule && rule.action && rule.action.type) ? String(rule.action.type) : '';
        const resourceTypes = (rule && rule.condition && Array.isArray(rule.condition.resourceTypes))
          ? rule.condition.resourceTypes.slice().sort().join(',')
          : '';
        const key = urlFilter + '|' + actionType + '|' + resourceTypes;
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(rule);
      } catch (e) {
        // skip problematic rule but continue processing others
        console.warn('Skipping malformed rule during dedupe', e);
      }
    }

    // Assign high-offset sequential IDs so dynamic rules won't collide with static rules
    const dynamicRules = deduped.map((rule, i) => {
      // deep-clone to avoid mutating source object (JSON approach is simple and reliable here)
      let cloned;
      try {
        cloned = JSON.parse(JSON.stringify(rule));
      } catch (e) {
        // fallback to shallow clone if structured cloning fails
        cloned = Object.assign({}, rule);
      }
      cloned.id = OFFSET + i;
      return cloned;
    });

    console.log('Prepared ' + dynamicRules.length + ' dynamic rules from rules.json (deduped)');
    return dynamicRules;
  } catch (err) {
    console.error('Failed to load rules.json:', err);
    return [];
  }
}

function getEnabledState() {
  // returns the full object from storage (e.g. {enabled: true})
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get({ enabled: true }, resolve);
    } catch (e) {
      // best-effort fallback
      resolve({ enabled: true });
    }
  });
}

function setEnabledState(enabled) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ enabled: !!enabled }, resolve);
    } catch (e) {
      // best-effort: swallow storage errors and resolve
      resolve();
    }
  });
}

// ---- Core logic ------------------------------------------------------------
async function applyRules(enabled) {
  const dnr = chrome.declarativeNetRequest;
  if (!dnr) {
    console.warn('declarativeNetRequest API not available');
    return;
  }

  try {
    // Remove existing dynamic rules we previously added (those with high-offset IDs)
    const existing = await dnr.getDynamicRules();
    const toRemove = (existing || []).filter(r => {
      try {
        return Number(r.id) >= OFFSET;
      } catch (e) {
        return false;
      }
    }).map(r => r.id);

    if (toRemove.length > 0) {
      await dnr.updateDynamicRules({ removeRuleIds: toRemove });
      console.log('Removed ' + toRemove.length + ' existing dynamic rules (ids >= ' + OFFSET + ')');
    } else {
      console.log('No existing high-offset dynamic rules to remove');
    }

    if (!enabled) {
      console.log('Blocking disabled — no dynamic rules applied (static rules remain)');
      return;
    }

    const rules = await loadRulesFromFile();
    if (!rules.length) {
      console.warn('No dynamic rules to apply (rules.json empty or failed to load)');
      return;
    }

    // add dynamic rules
    await dnr.updateDynamicRules({ addRules: rules });
    console.log('Successfully applied ' + rules.length + ' dynamic rules (ids starting at ' + OFFSET + ')');
  } catch (err) {
    console.error('Error applying rules:', (err && err.message) ? err.message : err);
  }
}

// ---- Lifecycle -------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const state = await getEnabledState();
    await applyRules(!!state.enabled);
  } catch (e) {
    console.error('onInstalled error:', e);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    const state = await getEnabledState();
    await applyRules(!!state.enabled);
  } catch (e) {
    console.error('onStartup error:', e);
  }
});

// ---- Messaging API ---------------------------------------------------------
// Supported message types:
// { type: 'set-enabled', enabled: boolean }
// { type: 'reload-rules' }
// { type: 'ping' }
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'set-enabled') {
    const enabled = !!msg.enabled;
    setEnabledState(enabled).then(async () => {
      try {
        await applyRules(enabled);
        sendResponse({ ok: true });
      } catch (e) {
        console.error('set-enabled apply error:', e);
        sendResponse({ ok: false, error: String(e) });
      }
    });
    return true; // async response
  }

  if (msg.type === 'reload-rules') {
    getEnabledState().then(async (state) => {
      try {
        await applyRules(!!state.enabled);
        sendResponse({ ok: true });
      } catch (e) {
        console.error('reload-rules apply error:', e);
        sendResponse({ ok: false, error: String(e) });
      }
    });
    return true; // async response
  }

  if (msg.type === 'ping') {
    sendResponse({ ok: true, ts: Date.now() });
    return true;
  }

  sendResponse({ ok: false, error: 'Unknown message type' });
  return false;
});
