// background service worker to manage ruleset enabling/disabling using dynamic rules
// Loads rules from rules.json and pushes them via declarativeNetRequest.updateDynamicRules

async function loadRulesFromFile() {
  try {
    const resp = await fetch(chrome.runtime.getURL('rules.json'));
    const rules = await resp.json();
    
    // Assign sequential IDs starting from 1 for each rule
    const dynamicRules = rules.map((rule, index) => ({
      ...rule,
      id: index + 1
    }));
    
    console.log(`Prepared ${dynamicRules.length} dynamic rules`);
    return dynamicRules;
  } catch (err) {
    console.error('Failed to load rules.json', err);
    return [];
  }
}

async function applyRules(enabled) {
  const dnr = chrome.declarativeNetRequest;
  if (!dnr) {
    console.warn('declarativeNetRequest API not available');
    return;
  }

  try {
    // First remove all existing rules
    const existing = await dnr.getDynamicRules();
    if (existing.length > 0) {
      await dnr.updateDynamicRules({
        removeRuleIds: existing.map(r => r.id)
      });
    }

    if (enabled) {
      const rules = await loadRulesFromFile();
      if (rules && rules.length) {
        await dnr.updateDynamicRules({ addRules: rules });
        console.log(`Successfully applied ${rules.length} rules`);
      }
    } else {
      console.log('Blocking disabled — no rules applied');
    }
  } catch (err) {
    console.error('Error applying rules:', err.message);
}

chrome.runtime.onInstalled.addListener(async () => {
  const state = await new Promise(res => chrome.storage.local.get({ enabled: true }, res));
  await applyRules(!!state.enabled);
});

chrome.runtime.onStartup.addListener(async () => {
  const state = await new Promise(res => chrome.storage.local.get({ enabled: true }, res));
  await applyRules(!!state.enabled);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'set-enabled') {
    const enabled = !!msg.enabled;
    chrome.storage.local.set({ enabled }, async () => {
      await applyRules(enabled);
      sendResponse({ ok: true });
    });
    return true; // will respond asynchronously
  }

  if (msg.type === 'reload-rules') {
    chrome.storage.local.get({ enabled: true }, async (res) => {
      await applyRules(!!res.enabled);
      sendResponse({ ok: true });
    });
    return true;
  }
});
