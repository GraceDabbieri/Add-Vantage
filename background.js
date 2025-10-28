// background.js — MV3 service worker

// ---- Helpers ---------------------------------------------------------------

async function loadRulesFromFile() {
  try {
    const resp = await fetch(chrome.runtime.getURL('rules.json'));
    if (!resp.ok) throw new Error('Failed to fetch rules.json (HTTP ' + resp.status + ')');
    const rules = await resp.json();

    if (!Array.isArray(rules)) {
      throw new Error('rules.json must be a JSON array of rule objects');
    }

    // Assign sequential IDs starting at 1 so we can safely remove them later
    const dynamicRules = rules.map(function(rule, i) {
      const copy = Object.assign({}, rule);
      copy.id = i + 1;
      return copy;
    });
    console.log('Prepared ' + dynamicRules.length + ' dynamic rules from rules.json');
    return dynamicRules;
  } catch (err) {
    console.error('Failed to load rules.json:', err);
    return [];
  }
}

function getEnabledState() {
  return new Promise(function(resolve) {
    chrome.storage.local.get({ enabled: true }, resolve);
  });
}

function setEnabledState(enabled) {
  return new Promise(function(resolve) {
    chrome.storage.local.set({ enabled: !!enabled }, resolve);
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
    // Remove all existing dynamic rules to avoid duplicate IDs or stale entries
    const existing = await dnr.getDynamicRules();
    if (existing && existing.length > 0) {
      await dnr.updateDynamicRules({
        removeRuleIds: existing.map(function(r) { return r.id; })
      });
      console.log('Removed ' + existing.length + ' existing dynamic rules');
    }

    if (!enabled) {
      console.log('Blocking disabled — no rules applied');
      return;
    }

    const rules = await loadRulesFromFile();
    if (!rules.length) {
      console.warn('No rules to apply (rules.json empty or failed to load)');
      return;
    }

    await dnr.updateDynamicRules({ addRules: rules });
    console.log('Successfully applied ' + rules.length + ' dynamic rules');
  } catch (err) {
    console.error('Error applying rules:', (err && err.message) ? err.message : err);
  }
}

// ---- Lifecycle -------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async function() {
  try {
    const state = await getEnabledState();
    await applyRules(!!state.enabled);
  } catch (e) {
    console.error('onInstalled error:', e);
  }
});

chrome.runtime.onStartup.addListener(async function() {
  try {
    const state = await getEnabledState();
    await applyRules(!!state.enabled);
  } catch (e) {
    console.error('onStartup error:', e);
  }
});

// ---- Messaging API ---------------------------------------------------------

// Accepts:
// {type: 'set-enabled', enabled: boolean}
// {type: 'reload-rules'}
// {type: 'ping'}
chrome.runtime.onMessage.addListener(function(msg, _sender, sendResponse) {
  if (!msg || !msg.type) return false;

  if (msg.type === 'set-enabled') {
    const enabled = !!msg.enabled;
    setEnabledState(enabled).then(async function() {
      try {
        await applyRules(enabled);
        sendResponse({ ok: true });
      } catch (e) {
        console.error('set-enabled apply error:', e);
        sendResponse({ ok: false, error: String(e) });
      }
    });
    return true; // respond asynchronously
  }

  if (msg.type === 'reload-rules') {
    getEnabledState().then(async function(state) {
      try {
        await applyRules(!!state.enabled);
        sendResponse({ ok: true });
      } catch (e) {
        console.error('reload-rules apply error:', e);
        sendResponse({ ok: false, error: String(e) });
      }
    });
    return true; // respond asynchronously
  }

  if (msg.type === 'ping') {
    sendResponse({ ok: true, ts: Date.now() });
    return true;
  }

  sendResponse({ ok: false, error: 'Unknown message type' });
  return false;
});