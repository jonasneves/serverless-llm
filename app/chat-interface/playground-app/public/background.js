// Background service worker for Chrome extension
// Opens side panel when extension icon is clicked

// Enable side panel to open when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));
