// Twitch Channel Keeper - content script (player health watcher)
//
// Runs on twitch.tv tabs but only ACTS when the background says this tab is the
// managed one AND the keeper is enabled (so it never touches your other Twitch tabs).
// It watches the <video> element; if playback stalls / the player errors, it tries
// a light in-page recovery (resume playback, dismiss gates). If it stays dead it
// reports to the background, which escalates: reload -> reload -> skip to next live.

(function () {
  const CHECK_MS = 3000;      // how often we inspect the player
  const STALL_LIMIT = 12000;  // unhealthy this long -> report "dead"
  const REPORT_COOLDOWN = 15000; // after reporting, wait before reporting again (let reload happen)

  let lastTime = -1;
  let stalledMs = 0;
  let lastReport = 0;

  function findVideo() {
    return document.querySelector("video");
  }

  function hasErrorOverlay() {
    const sels = [
      '[data-a-target="player-overlay-content-gate"]',
      '[data-a-target="player-error-content"]',
      ".content-overlay-gate",
      '[data-a-target="player-overlay-click-handler"] .tw-c-text-alt-2'
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && el.offsetParent !== null) {
        const txt = (el.textContent || "").toLowerCase();
        // treat only error-ish overlays as crashes, not generic overlays
        if (/error|unavailable|not available|try again|problema|indispon/.test(txt) || s.includes("content-gate")) {
          return true;
        }
      }
    }
    return false;
  }

  function tryRecover(v) {
    // 1) resume if paused (Twitch autoplay / "still watching?" pause)
    try { if (v && v.paused) v.play().catch(() => {}); } catch (e) {}
    // 2) click common play / gate buttons
    const clicks = [
      '[data-a-target="player-play-pause-button"][aria-label*="Play" i]',
      '[data-a-target="content-classification-gate-overlay-start-watching-button"]',
      '[data-a-target="player-overlay-mature-accept"]',
      'button[aria-label*="Start Watching" i]'
    ];
    for (const s of clicks) {
      const b = document.querySelector(s);
      if (b && b.offsetParent !== null) { try { b.click(); } catch (e) {} }
    }
  }

  function isHealthy() {
    const v = findVideo();
    if (!v) return false;
    if (hasErrorOverlay()) return false;
    const advanced = v.currentTime !== lastTime;
    lastTime = v.currentTime;
    // healthy = actively playing and the clock is moving
    return !v.paused && v.readyState >= 2 && advanced;
  }

  async function amActive() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "amIManaged" });
      return !!(res && res.active);
    } catch (e) {
      return false; // background asleep / context gone
    }
  }

  async function tick() {
    if (!(await amActive())) { stalledMs = 0; return; }

    if (isHealthy()) {
      if (stalledMs > 0) { stalledMs = 0; chrome.runtime.sendMessage({ type: "playerOk" }).catch(() => {}); }
      return;
    }

    // unhealthy: attempt in-page recovery first
    tryRecover(findVideo());
    stalledMs += CHECK_MS;

    if (stalledMs >= STALL_LIMIT && Date.now() - lastReport >= REPORT_COOLDOWN) {
      lastReport = Date.now();
      stalledMs = 0;
      chrome.runtime.sendMessage({ type: "playerDead" }).catch(() => {});
    }
  }

  setInterval(tick, CHECK_MS);
})();
