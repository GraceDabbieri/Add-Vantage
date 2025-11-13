// contentScript.js

// 1. Create a <script> element
const scriptElement = document.createElement('script');

// 2. Set the 'src' attribute using chrome.runtime.getURL to point to the file
// listed in web_accessible_resources.
scriptElement.src = chrome.runtime.getURL('mainWorldInjection.js');

// 3. Optional: Clean up the DOM once the script has loaded
scriptElement.onload = function() {
    this.remove();
};

// 4. Inject the script element into the page's DOM (head or documentElement)
(document.head || document.documentElement).appendChild(scriptElement);

