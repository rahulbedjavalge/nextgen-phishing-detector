chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ enabled: true, threshold: 0.55 });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'getConfig') {
    chrome.storage.sync.get(['enabled','threshold'], (cfg) => sendResponse({ enabled: cfg.enabled ?? true, threshold: cfg.threshold ?? 0.55 }));
    return true;
  }
});
