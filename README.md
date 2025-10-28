# Ad-Vantage — Smart Ad Blocking Chrome Extension (MV3)

This repository contains a powerful Chrome extension that uses the declarativeNetRequest API to provide a cleaner browsing experience by blocking common ad hostnames.

Files:
- `manifest.json` — extension manifest (MV3)
- `rules.json` — static rule resource referenced by the manifest
- `background.js` — service worker (manages settings)
- `popup.html` / `popup.js` — small UI to toggle blocking (stores flag in chrome.storage)

How to load locally:
1. Open Chrome and go to chrome://extensions
2. Enable Developer mode (top-right)
3. Click "Load unpacked" and select this project folder
4. Open the extension popup and toggle "Enable blocking"

Notes:
- MV3 static rule resources referenced in the manifest are loaded by Chrome on install/update. Changing `rules.json` requires reloading the extension or using dynamic rules API.
- For more advanced rule management, use the `declarativeNetRequest.updateDynamicRules` API in the service worker to push rules programmatically.
 
This project uses the dynamic rules API: the service worker (`background.js`) reads `rules.json` at startup and pushes the rules via `declarativeNetRequest.updateDynamicRules`. Use the popup to enable/disable rules at runtime. If you edit `rules.json` you'll need to either reload the extension in chrome://extensions or use the "Reload rules" button in the popup.
