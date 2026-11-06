// Twitch Channel Keeper - background service worker (MV3)
//
// Keeps ONE dedicated Twitch tab parked on the first live channel in the user's
// list. Every minute (and on toggle) it checks: if the current channel is still
// live, leave it; otherwise scan the list circularly for the next live channel
// and navigate the managed tab there.
//
// Liveness uses Twitch's public web GraphQL endpoint with the public web Client-ID
// (the same the twitch.tv site uses for anonymous visitors). Read-only, no login.

const GQL_URL = "https://gql.twitch.tv/gql";
const PUBLIC_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
const ALARM = "twitch-keeper-tick";

const DEFAULTS = {
  enabled: false,
  channels: [],       // array of lowercase logins, in priority order
  currentIndex: 0,
  managedTabId: null,
  closeOthers: false, // if true, close any other twitch.tv tabs (keeps just the managed one)
  muteTab: false      // if true, mute the browser TAB (not the Twitch player). Default: volume on.
};

let running = false;   // simple mutex so alarm + storage-change don't overlap

// ---------- storage helpers ----------
async function getState() {
  const s = await chrome.storage.local.get(DEFAULTS);
  return s;
}
async function setState(patch) {
  await chrome.storage.local.set(patch);
}

// ---------- twitch helpers ----------
function sanitizeLogin(x) {
  return String(x || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}

async function isLive(login) {
  login = sanitizeLogin(login);
  if (!login) return false;
  try {
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: {
        "Client-ID": PUBLIC_CLIENT_ID,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        query: `query { user(login: "${login}") { stream { id } } }`
      })
    });
    if (!res.ok) return false;
    const json = await res.json();
    return !!(json && json.data && json.data.user && json.data.user.stream);
  } catch (e) {
    console.warn("isLive error for", login, e);
    return false;
  }
}

function channelFromUrl(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith("twitch.tv")) return null;
    const seg = u.pathname.split("/").filter(Boolean)[0] || "";
    return sanitizeLogin(seg);
  } catch {
    return null;
  }
}

// ---------- tab helpers ----------
async function getManagedTab() {
  const { managedTabId } = await getState();
  if (managedTabId == null) return null;
  try {
    return await chrome.tabs.get(managedTabId);
  } catch {
    await setState({ managedTabId: null });
    return null;
  }
}

async function focusTab(tabId, windowId) {
  // Twitch won't autostart playback in a background tab, so bring it to the
  // foreground and focus its window.
  try {
    await chrome.tabs.update(tabId, { active: true });
    if (windowId != null) await chrome.windows.update(windowId, { focused: true });
  } catch (e) {
    console.warn("focusTab error", e);
  }
}

async function openOrNavigate(login) {
  const url = `https://www.twitch.tv/${login}`;
  const { muteTab } = await getState();
  const tab = await getManagedTab();
  if (tab) {
    await chrome.tabs.update(tab.id, { url, active: true, muted: !!muteTab });
    await focusTab(tab.id, tab.windowId);
    return tab.id;
  }
  const created = await chrome.tabs.create({ url, active: true });
  await chrome.tabs.update(created.id, { muted: !!muteTab }); // tab-level mute, Twitch player stays unmuted
  await setState({ managedTabId: created.id });
  await focusTab(created.id, created.windowId);
  return created.id;
}

async function closeOtherTwitchTabs(keepId) {
  try {
    const tabs = await chrome.tabs.query({ url: ["*://*.twitch.tv/*", "*://twitch.tv/*"] });
    const toClose = tabs.filter((t) => t.id !== keepId).map((t) => t.id);
    if (toClose.length) await chrome.tabs.remove(toClose);
  } catch (e) {
    console.warn("closeOtherTwitchTabs error", e);
  }
}

// ---------- badge ----------
function setBadge(text, color) {
  chrome.action.setBadgeText({ text: text || "" });
  if (color) chrome.action.setBadgeBackgroundColor({ color });
}

// ---------- core ----------
async function manage() {
  if (running) return;
  running = true;
  try {
    const state = await getState();

    if (!state.enabled) {
      setBadge("off", "#777777");
      return;
    }

    const channels = (state.channels || []).map(sanitizeLogin).filter(Boolean);
    if (channels.length === 0) {
      setBadge("!", "#cc3333"); // no channels configured
      return;
    }

    const tab = await getManagedTab();
    const curLogin = tab ? channelFromUrl(tab.url) : null;

    // If current channel is in the list and still live, keep it.
    if (curLogin && channels.includes(curLogin) && (await isLive(curLogin))) {
      await setState({ currentIndex: channels.indexOf(curLogin) });
      if (state.closeOthers) await closeOtherTwitchTabs(tab.id);
      setBadge("live", "#3fb950");
      return;
    }

    // Otherwise scan circularly for the next live channel.
    const start =
      curLogin && channels.includes(curLogin)
        ? channels.indexOf(curLogin) + 1
        : state.currentIndex || 0;

    for (let k = 0; k < channels.length; k++) {
      const idx = (start + k) % channels.length;
      const login = channels[idx];
      if (await isLive(login)) {
        const id = await openOrNavigate(login);
        await setState({ currentIndex: idx });
        if (state.closeOthers) await closeOtherTwitchTabs(id);
        setBadge("live", "#3fb950");
        return;
      }
    }

    // Nobody live right now. Keep the tab as-is; retry next tick.
    setBadge("0", "#d29922");
  } finally {
    running = false;
  }
}

// ---------- wiring ----------
const SEED_CHANNELS = [
  "rubini",
  "kekedepatinete",
  "pacifistatibiano",
  "brederodess",
  "japabigodin",
  "minghetto",   // less important - only if none above are live
  "cateroide"    // less important - only if none above are live
];

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  const { channels } = await getState();
  if (!channels || channels.length === 0) {
    await setState({ channels: SEED_CHANNELS });
  }
  manage();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  manage();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === ALARM) manage();
});

// React immediately when the popup changes enabled/channels.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.enabled || changes.channels) manage();
});

// If the managed tab is closed, forget it (next tick re-creates when enabled).
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { managedTabId } = await getState();
  if (tabId === managedTabId) await setState({ managedTabId: null });
});

// Popup "Check now" button.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "runNow") {
    manage().then(() => sendResponse({ ok: true }));
    return true; // async response
  }
});
