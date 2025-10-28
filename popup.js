document.addEventListener('DOMContentLoaded', () => {
  const checkbox = document.getElementById('enabled');
  const reloadBtn = document.getElementById('reload');

  // Load saved state
  chrome.storage.local.get({ enabled: true }, (res) => {
    checkbox.checked = res.enabled;
  });

  checkbox.addEventListener('change', () => {
    const enabled = checkbox.checked;
    chrome.storage.local.set({ enabled });
    // send message to service worker to enable/disable ruleset
    chrome.runtime.sendMessage({ type: 'set-enabled', enabled });
  });

  reloadBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'reload-rules' }, (resp) => {
      alert('Reload requested');
    });
  });
});
