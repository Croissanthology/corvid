// Evil Crow — service worker. Clicking the toolbar crow summons one more crow into the current tab.

const FILES = ['sprites.js', 'crow.js'];

async function inTab(tabId, method, arg) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: FILES });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (m, a) => (window.__evilCrow ? window.__evilCrow[m](a) : -1),
      args: [method, arg ?? null],
    });
    const n = res && typeof res.result === 'number' ? res.result : 0;
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b3122a' });
    await chrome.action.setBadgeText({ tabId, text: n > 0 ? String(n) : '' });
    return n;
  } catch (e) {
    // chrome:// pages, the Web Store, PDFs etc. are off-limits to extensions. The crow sulks.
    try {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#555' });
      await chrome.action.setBadgeText({ tabId, text: 'no' });
      setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 2500);
    } catch (_) { /* tab closed */ }
    return -1;
  }
}

// exposed for testing from the service worker console
self.evilCrowInTab = inTab;

chrome.action.onClicked.addListener((tab) => { if (tab.id != null) inTab(tab.id, 'summon', 1); });

async function buildMenus() {
  const { sound, autoBsky } = await chrome.storage.local.get({ sound: true, autoBsky: false });
  await chrome.contextMenus.removeAll();
  const ctx = ['action'];
  chrome.contextMenus.create({ id: 'murder', title: 'Summon a murder (5 crows)', contexts: ctx });
  chrome.contextMenus.create({ id: 'banish', title: 'Banish the crows', contexts: ctx });
  chrome.contextMenus.create({ id: 'repair', title: 'Repair the page (undo the havoc)', contexts: ctx });
  chrome.contextMenus.create({ id: 'sound', title: 'Caw out loud (sound)', type: 'checkbox', checked: sound, contexts: ctx });
  chrome.contextMenus.create({ id: 'autoBsky', title: 'Crow lives on Bluesky (auto-summon)', type: 'checkbox', checked: autoBsky, contexts: ctx });
}

chrome.runtime.onInstalled.addListener(buildMenus);
chrome.runtime.onStartup.addListener(buildMenus);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const id = tab && tab.id;
  switch (info.menuItemId) {
    case 'murder': if (id != null) inTab(id, 'summon', 5); break;
    case 'banish': if (id != null) { await inTab(id, 'banish'); chrome.action.setBadgeText({ tabId: id, text: '' }); } break;
    case 'repair': if (id != null) inTab(id, 'repair'); break;
    case 'sound': await chrome.storage.local.set({ sound: !!info.checked }); break;
    case 'autoBsky': await chrome.storage.local.set({ autoBsky: !!info.checked }); break;
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab || tab.id == null) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;
  if (command === 'summon-crow') inTab(tab.id, 'summon', 1);
  if (command === 'banish-crows') { await inTab(tab.id, 'banish'); chrome.action.setBadgeText({ tabId: tab.id, text: '' }); }
});
