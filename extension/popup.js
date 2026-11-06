// Twitch Channel Keeper - popup UI (EN / PT-BR)

const DEFAULTS = {
  enabled: false, channels: [], currentIndex: 0, managedTabId: null,
  closeOthers: false, muteTab: false, lang: null
};

const $ = (id) => document.getElementById(id);

const I18N = {
  en: {
    keep: "Keep a live channel open",
    close: "Close other Twitch tabs",
    mute: "Open tab muted (the browser tab, not the Twitch player)",
    hint: 'One channel per line, in priority order (top = highest). "@" is optional.',
    save: "Save list",
    check: "Check now",
    off: "Off.",
    onPrefix: "On. Currently watching: ",
    noneYet: "(none yet)",
    saved: (n) => `Saved ${n} channel(s).`,
    checking: "Checking..."
  },
  pt: {
    keep: "Manter um canal ao vivo aberto",
    close: "Fechar outras abas da Twitch",
    mute: "Abrir aba muda (a aba do navegador, não o player da Twitch)",
    hint: 'Um canal por linha, em ordem de prioridade (topo = maior). O "@" é opcional.',
    save: "Salvar lista",
    check: "Verificar agora",
    off: "Desligado.",
    onPrefix: "Ligado. Assistindo: ",
    noneYet: "(nenhum ainda)",
    saved: (n) => `${n} canal(is) salvo(s).`,
    checking: "Verificando..."
  }
};

let LANG = "en";
const t = () => I18N[LANG];

function sanitizeLogin(x) {
  return String(x || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
}
function parseList(text) {
  return text.split(/\r?\n/).map(sanitizeLogin).filter(Boolean);
}

function applyLang() {
  const d = t();
  $("l_keep").textContent = d.keep;
  $("l_close").textContent = d.close;
  $("l_mute").textContent = d.mute;
  $("l_hint").textContent = d.hint;
  $("save").textContent = d.save;
  $("checkNow").textContent = d.check;
  $("lang").value = LANG;
}

function reflect(enabled) {
  $("dot").classList.toggle("on", !!enabled);
}

async function refreshStatus() {
  const s = await chrome.storage.local.get(DEFAULTS);
  if (!s.enabled) { $("status").textContent = t().off; return; }
  let current = t().noneYet;
  if (s.managedTabId != null) {
    try {
      const tab = await chrome.tabs.get(s.managedTabId);
      const seg = new URL(tab.url).pathname.split("/").filter(Boolean)[0];
      if (seg) current = seg;
    } catch { /* tab gone */ }
  }
  $("status").innerHTML = t().onPrefix + "<b>" + current + "</b>";
}

async function load() {
  const s = await chrome.storage.local.get(DEFAULTS);
  LANG = s.lang || (navigator.language && navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en");
  applyLang();
  $("enabled").checked = !!s.enabled;
  $("closeOthers").checked = !!s.closeOthers;
  $("muteTab").checked = !!s.muteTab;
  $("channels").value = (s.channels || []).join("\n");
  reflect(s.enabled);
  await refreshStatus();
}

$("lang").addEventListener("change", async (e) => {
  LANG = e.target.value;
  await chrome.storage.local.set({ lang: LANG });
  applyLang();
  await refreshStatus();
});

$("enabled").addEventListener("change", async (e) => {
  await chrome.storage.local.set({ enabled: e.target.checked });
  reflect(e.target.checked);
  setTimeout(refreshStatus, 900);
});

$("closeOthers").addEventListener("change", (e) =>
  chrome.storage.local.set({ closeOthers: e.target.checked }));

$("muteTab").addEventListener("change", (e) =>
  chrome.storage.local.set({ muteTab: e.target.checked }));

$("save").addEventListener("click", async () => {
  const channels = parseList($("channels").value);
  await chrome.storage.local.set({ channels, currentIndex: 0 });
  $("channels").value = channels.join("\n");
  $("status").textContent = t().saved(channels.length);
  setTimeout(refreshStatus, 1300);
});

$("checkNow").addEventListener("click", async () => {
  $("status").textContent = t().checking;
  await chrome.runtime.sendMessage({ type: "runNow" });
  setTimeout(refreshStatus, 1300);
});

load();
