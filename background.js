// background.js — MV3 service worker
// Combines enhanced error handling, messaging (including ping), and safe dynamic rule ID assignment
// while avoiding conflicts with static rule_resources loaded from manifest (rules.json).

// ---- Helpers ---------------------------------------------------------------
async function loadRulesFromFile() {
  try {
    const url = chrome.runtime.getURL('rules.json');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Failed to fetch rules.json (HTTP ' + resp.status + ')');
    const rules = await resp.json();
    if (!Array.isArray(rules)) throw new Error('rules.json must be a JSON array of rule objects');
    // Offset IDs to avoid collisions with static rule_resources (which use low IDs from the file)
    const dynamicRules = rules.map((rule, i) => ({ ...rule, id: 10000 + i }));
    console.log('Prepared ' + dynamicRules.length + ' dynamic rules from rules.json');
    return dynamicRules;
  } catch (err) {
    console.error('Failed to load rules.json:', err);
    return [];
  }
}

function getEnabledState() {
  return new Promise(resolve => chrome.storage.local.get({ enabled: true }, resolve));
}

function setEnabledState(enabled) {
  return new Promise(resolve => chrome.storage.local.set({ enabled: !!enabled }, resolve));
}

// ---- Core logic ------------------------------------------------------------
async function applyRules(enabled) {
  const dnr = chrome.declarativeNetRequest;
  if (!dnr) {
    console.warn('declarativeNetRequest API not available');
    return;
  }
  try {
    // Remove existing dynamic rules (only our high-offset IDs)
    const existing = await dnr.getDynamicRules();
    const toRemove = existing.filter(r => r.id >= 10000).map(r => r.id);
    if (toRemove.length) {
      await dnr.updateDynamicRules({ removeRuleIds: toRemove });
      console.log('Removed ' + toRemove.length + ' existing dynamic rules');
    }
    if (!enabled) {
      console.log('Blocking disabled — no dynamic rules applied (static rules remain)');
      return;
    }
    const rules = await loadRulesFromFile();
    if (!rules.length) {
      console.warn('No dynamic rules to apply (empty or failed load)');
      return;
    }
    await dnr.updateDynamicRules({ addRules: rules });
    console.log('Successfully applied ' + rules.length + ' dynamic rules');
  } catch (err) {
    console.error('Error applying rules:', err && err.message ? err.message : err);
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
