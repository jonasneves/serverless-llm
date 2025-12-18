// Background service worker for Chrome extension
// Opens side panel when extension icon is clicked

// Enable side panel to open when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

const NATIVE_HOST_NAME = 'io.neevs.serverless_llm';

function sendNativeMessage(payload) {
  console.log('[sendNativeMessage] Starting with payload:', payload);
  return new Promise((resolve) => {
    if (chrome.runtime.sendNativeMessage) {
      console.log('[sendNativeMessage] Using sendNativeMessage API');
      chrome.runtime.sendNativeMessage(NATIVE_HOST_NAME, payload, (response) => {
        const err = chrome.runtime.lastError?.message;
        console.log('[sendNativeMessage] Response:', response, 'Error:', err);
        if (err) resolve({ ok: false, error: err });
        else resolve(response);
      });
      return;
    }

    console.log('[sendNativeMessage] Falling back to connectNative');
    try {
      const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
      console.log('[sendNativeMessage] Connected to native host');
      let settled = false;
      let receivedMessage = false;
      let disconnectTimer = null;

      const finish = (response) => {
        if (settled) return;
        settled = true;
        if (disconnectTimer) {
          clearTimeout(disconnectTimer);
          disconnectTimer = null;
        }
        try {
          port.disconnect();
        } catch {}
        resolve(response);
      };

      port.onMessage.addListener((message) => {
        receivedMessage = true;
        finish(message);
      });
      port.onDisconnect.addListener(() => {
        const err = chrome.runtime.lastError?.message;
        if (receivedMessage) return;

        // In practice the native host can exit quickly after replying; Chrome may fire onDisconnect
        // before onMessage, so wait briefly before reporting an error.
        disconnectTimer = setTimeout(() => {
          if (receivedMessage) return;
          finish({ ok: false, error: err || 'Native host disconnected' });
        }, 50);
      });

      port.postMessage(payload);
    } catch (e) {
      resolve({ ok: false, error: e?.message || String(e) });
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log('[background] Received message:', message);
  if (!message || typeof message !== 'object') {
    console.log('[background] Invalid message, ignoring');
    return;
  }
  if (message.type !== 'native_backend') {
    console.log('[background] Not a native_backend message, ignoring');
    return;
  }

  console.log('[background] Calling native host with payload:', message.payload);
  (async () => {
    const response = await sendNativeMessage(message.payload || {});
    console.log('[background] Native host response:', response);
    sendResponse(response);
  })();

  return true;
});
