// Background service worker for Chrome extension
// Opens side panel when extension icon is clicked

// Enable side panel to open when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

const NATIVE_HOST_NAME = 'io.neevs.serverless_llm';

function sendNativeMessage(payload) {
  return new Promise((resolve) => {
    try {
      const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      let settled = false;

      const finish = (response) => {
        if (settled) return;
        settled = true;
        try {
          port.disconnect();
        } catch {}
        resolve(response);
      };

      port.onMessage.addListener((message) => finish(message));
      port.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError?.message;
        finish({ ok: false, error: err || 'Native host disconnected' });
      });

      port.postMessage(payload);
    } catch (e) {
      resolve({ ok: false, error: e?.message || String(e) });
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;
  if (message.type !== 'native_backend') return;

  (async () => {
    const response = await sendNativeMessage(message.payload || {});
    sendResponse(response);
  })();

  return true;
});
