const STORAGE_KEY = "trafficState";
const LOG_STORAGE_KEY = "trafficEventLog";
const API_STATE_ID_KEY = "trafficApiStateId";
const API_BASE = "https://jsonplaceholder.typicode.com/posts";

const TIMER_YELLOW_SECONDS = 3;

let currentGreen = "NS";
let isTransitioning = false;
let transitionEndMs = null;
let transitionFromDir = null;
let transitionTimeoutId = null;
let transitionPurpose = null;

let pendingPedestrian = false;
let pedestrianActive = false;
let pedestrianSecondsLeft = 0;
let pedestrianIntervalId = null;

let countdownIntervalId = null;
let goPhaseEndMs = null;
let goPhaseTimeoutId = null;

let mode = "manual";
let timerStarted = false;

const config = {
  pedWalkSeconds: 15,
  queueClearanceSeconds: 2,
  nsGoSeconds: 12,
  ewGoSeconds: 12,
};

function clampSeconds(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, parsed);
}

function dirShort(direction) {
  return direction === "NS" ? "N–S" : "E–W";
}

function otherDir(direction) {
  return direction === "NS" ? "EW" : "NS";
}

function nowStamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getGoSeconds(direction) {
  return direction === "NS" ? config.nsGoSeconds : config.ewGoSeconds;
}

function buildStatePayload() {
  return {
    currentGreen,
    mode,
    timerStarted,
    config: { ...config },
    savedAt: new Date().toISOString(),
  };
}

function setBadge(elementId, text, variant) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = text;
  el.className = `badge badge--${variant}`;
}

function updateModeBadge() {
  const label = mode === "timer" ? (timerStarted ? "Timer · Running" : "Timer · Idle") : "Manual";
  const variant = mode === "timer" ? "timer" : "manual";
  setBadge("modeBadge", label, variant);
}

function logEvent(message, { persist = true } = {}) {
  const list = document.getElementById("eventLogList");
  if (!list) return;

  const entry = { time: nowStamp(), message };

  const li = document.createElement("li");
  li.className = "event-log__item";

  const meta = document.createElement("div");
  meta.className = "event-log__meta";

  const time = document.createElement("span");
  time.className = "event-log__time";
  time.textContent = entry.time;

  meta.appendChild(time);

  const msg = document.createElement("div");
  msg.className = "event-log__msg";
  msg.textContent = entry.message;

  li.appendChild(meta);
  li.appendChild(msg);
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;

  if (persist) {
    saveEventLog();
  }
}

function getEventLogEntries() {
  const list = document.getElementById("eventLogList");
  if (!list) return [];

  return Array.from(list.querySelectorAll(".event-log__item")).map((item) => ({
    time: item.querySelector(".event-log__time")?.textContent || "",
    message: item.querySelector(".event-log__msg")?.textContent || "",
  }));
}

function renderEventLog(entries) {
  const list = document.getElementById("eventLogList");
  if (!list) return;

  list.innerHTML = "";
  entries.forEach((entry) => {
    logEvent(entry.message, { persist: false });
  });
}

function saveEventLog() {
  try {
    const entries = getEventLogEntries().slice(-50);
    localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("Could not save event log:", error);
  }
}

function loadEventLog() {
  try {
    const saved = localStorage.getItem(LOG_STORAGE_KEY);
    if (!saved) return;

    const entries = JSON.parse(saved);
    if (!Array.isArray(entries)) return;

    renderEventLog(entries.slice(-50));
  } catch (error) {
    console.warn("Could not load event log:", error);
  }
}

function saveState({ log = true } = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildStatePayload()));
    setBadge("storageBadge", "Storage: Saved", "ok");
    if (log) {
      logEvent("Local storage: state saved");
    }
    return true;
  } catch (error) {
    setBadge("storageBadge", "Storage: Error", "warn");
    logEvent("Local storage: save failed");
    return false;
  }
}

function applyLoadedState(state) {
  if (state.currentGreen === "NS" || state.currentGreen === "EW") {
    currentGreen = state.currentGreen;
  }

  if (state.mode === "manual" || state.mode === "timer") {
    mode = state.mode;
  }

  timerStarted = false;

  if (state.config && typeof state.config === "object") {
    config.pedWalkSeconds = clampSeconds(state.config.pedWalkSeconds, config.pedWalkSeconds);
    config.queueClearanceSeconds = clampSeconds(
      state.config.queueClearanceSeconds,
      config.queueClearanceSeconds
    );
    config.nsGoSeconds = clampSeconds(state.config.nsGoSeconds, config.nsGoSeconds);
    config.ewGoSeconds = clampSeconds(state.config.ewGoSeconds, config.ewGoSeconds);
  }

  const modeToggle = document.getElementById("modeToggle");
  const pedWalkInput = document.getElementById("pedWalkInput");
  const queueInput = document.getElementById("queueClearanceInput");
  const nsGoInput = document.getElementById("nsGoInput");
  const ewGoInput = document.getElementById("ewGoInput");

  if (modeToggle) modeToggle.checked = mode === "timer";
  if (pedWalkInput) pedWalkInput.value = String(config.pedWalkSeconds);
  if (queueInput) queueInput.value = String(config.queueClearanceSeconds);
  if (nsGoInput) nsGoInput.value = String(config.nsGoSeconds);
  if (ewGoInput) ewGoInput.value = String(config.ewGoSeconds);
}

function loadState({ log = true } = {}) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      setBadge("storageBadge", "Storage: Empty", "neutral");
      return false;
    }

    const state = JSON.parse(saved);
    applyLoadedState(state);
    setBadge("storageBadge", "Storage: Loaded", "ok");
    if (log) {
      logEvent("Local storage: state loaded");
    }
    return true;
  } catch (error) {
    setBadge("storageBadge", "Storage: Error", "warn");
    if (log) {
      logEvent("Local storage: load failed");
    }
    return false;
  }
}

function clearLocalStorage() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LOG_STORAGE_KEY);
  localStorage.removeItem(API_STATE_ID_KEY);
  setBadge("storageBadge", "Storage: Cleared", "neutral");
  setBadge("apiBadge", "API: —", "neutral");

  const list = document.getElementById("eventLogList");
  if (list) list.innerHTML = "";

  logEvent("Local storage: all data cleared");
}

async function syncStateToAPI() {
  setBadge("apiBadge", "API: Syncing…", "neutral");

  try {
    const payload = buildStatePayload();
    const savedId = localStorage.getItem(API_STATE_ID_KEY);
    const endpoint = savedId ? `${API_BASE}/${savedId}` : API_BASE;
    const method = savedId ? "PUT" : "POST";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Traffic Control State",
        body: JSON.stringify(payload),
        userId: 1,
      }),
    });

    if (!response.ok) throw new Error("API sync failed");

    const result = await response.json();
    if (result.id) {
      localStorage.setItem(API_STATE_ID_KEY, String(result.id));
    }

    setBadge("apiBadge", "API: Synced", "ok");
    logEvent(`API: state synced (id ${result.id || savedId})`);
    return true;
  } catch (error) {
    setBadge("apiBadge", "API: Failed", "warn");
    logEvent("API: sync failed");
    return false;
  }
}

async function loadStateFromAPI() {
  const savedId = localStorage.getItem(API_STATE_ID_KEY);
  if (!savedId) {
    setBadge("apiBadge", "API: No ID", "warn");
    logEvent("API: no saved id — sync first");
    return false;
  }

  setBadge("apiBadge", "API: Loading…", "neutral");

  try {
    const response = await fetch(`${API_BASE}/${savedId}`);
    if (!response.ok) throw new Error("API load failed");

    const result = await response.json();
    const state = JSON.parse(result.body);
    applyLoadedState(state);
    resetToInitialState();
    applyModeUI();
    setBadge("apiBadge", "API: Loaded", "ok");
    logEvent(`API: state loaded (id ${savedId})`);
    saveState({ log: false });
    return true;
  } catch (error) {
    setBadge("apiBadge", "API: Failed", "warn");
    logEvent("API: load failed");
    return false;
  }
}

function getCounterPhase(direction) {
  const prefix = direction === "NS" ? "ns" : "ew";
  const yellow = document.getElementById(`${prefix}-yellow`);
  const green = document.getElementById(`${prefix}-green`);

  if (yellow?.classList.contains("active")) return "yellow";
  if (green?.classList.contains("active")) return "green";
  return "red";
}

function setCounter(counterId, seconds, direction) {
  const counter = document.getElementById(counterId);
  if (!counter) return;

  const phase = getCounterPhase(direction);
  counter.textContent = `${Math.max(0, Math.ceil(seconds))}s`;
  counter.classList.remove("countdown--green", "countdown--yellow", "countdown--red");
  counter.classList.add(`countdown--${phase}`);
}

function setPedestrianSignal(isWalk, seconds) {
  const display = document.getElementById("pedestrianDisplay");
  const text = document.getElementById("pedestrianSignalText");
  const countdown = document.getElementById("pedestrianCountdown");
  if (!display || !text || !countdown) return;

  display.classList.toggle("walk", isWalk);
  display.classList.toggle("dont-walk", !isWalk);
  text.textContent = isWalk ? "WALK" : "DON'T WALK";
  countdown.textContent = `${Math.max(0, Math.ceil(seconds))}s`;
}

function updateCounters() {
  let nsSeconds = 0;
  let ewSeconds = 0;

  if (pedestrianActive) {
    nsSeconds = pedestrianSecondsLeft;
    ewSeconds = pedestrianSecondsLeft;
  } else if (isTransitioning && transitionEndMs) {
    const remaining = Math.max(0, (transitionEndMs - Date.now()) / 1000);
    nsSeconds = transitionFromDir === "NS" ? remaining : 0;
    ewSeconds = transitionFromDir === "EW" ? remaining : 0;
  } else if (mode === "timer" && timerStarted && goPhaseEndMs) {
    const remaining = Math.max(0, (goPhaseEndMs - Date.now()) / 1000);
    nsSeconds = currentGreen === "NS" ? remaining : 0;
    ewSeconds = currentGreen === "EW" ? remaining : 0;
  }

  setCounter("ns-counter", nsSeconds, "NS");
  setCounter("ew-counter", ewSeconds, "EW");
}

function setLights(direction, color) {
  const prefix = direction === "NS" ? "ns" : "ew";
  const red = document.getElementById(`${prefix}-red`);
  const yellow = document.getElementById(`${prefix}-yellow`);
  const green = document.getElementById(`${prefix}-green`);
  if (!red || !yellow || !green) return;

  red.classList.remove("active");
  yellow.classList.remove("active");
  green.classList.remove("active");

  if (color === "red") red.classList.add("active");
  if (color === "yellow") yellow.classList.add("active");
  if (color === "green") green.classList.add("active");
}

function setBothRed() {
  setLights("NS", "red");
  setLights("EW", "red");
}

function updateLabel() {
  const label = document.getElementById("currentGreenLabel");
  if (!label) return;
  label.textContent = currentGreen === "NS" ? "North-South" : "East-West";
}

function setControlsDisabled(disabled) {
  const switchButton = document.getElementById("switchButton");
  const pedestrianButton = document.getElementById("pedestrianButton");

  if (switchButton) {
    switchButton.disabled = disabled || mode === "timer" || isTransitioning || pedestrianActive;
  }

  if (pedestrianButton) {
    const timerPedDisabled = mode === "timer" && !timerStarted;
    pedestrianButton.disabled =
      disabled || pendingPedestrian || pedestrianActive || isTransitioning || timerPedDisabled;
  }
}

function clearGoPhaseTimers() {
  if (goPhaseTimeoutId) {
    clearTimeout(goPhaseTimeoutId);
    goPhaseTimeoutId = null;
  }
  goPhaseEndMs = null;
}

function clearTransitionTimer() {
  if (transitionTimeoutId) {
    clearTimeout(transitionTimeoutId);
    transitionTimeoutId = null;
  }
  transitionEndMs = null;
  transitionFromDir = null;
  transitionPurpose = null;
}

function onTransitionComplete() {
  if (pendingPedestrian) {
    startPedestrianClearance();
    return;
  }

  if (mode === "timer" && timerStarted) {
    startGoPhase();
  }
}

function runYellowClearance(fromDir, purpose, onDone) {
  if (isTransitioning || pedestrianActive) return false;

  clearGoPhaseTimers();
  clearTransitionTimer();

  isTransitioning = true;
  transitionPurpose = purpose;
  setControlsDisabled(true);

  const clearanceSeconds =
    mode === "timer" && purpose === "switch"
      ? TIMER_YELLOW_SECONDS
      : config.queueClearanceSeconds;

  transitionFromDir = fromDir;
  transitionEndMs = Date.now() + clearanceSeconds * 1000;

  setLights(fromDir, "yellow");
  setLights(otherDir(fromDir), "red");
  updateCounters();

  logEvent(
    purpose === "pedestrian"
      ? `Pedestrian clearance — ${dirShort(fromDir)} WARNING`
      : `Transition — ${dirShort(fromDir)} WARNING`
  );

  transitionTimeoutId = setTimeout(() => {
    isTransitioning = false;
    transitionTimeoutId = null;
    transitionEndMs = null;
    transitionFromDir = null;
    transitionPurpose = null;
    onDone();
    setControlsDisabled(false);
    updateCounters();
  }, clearanceSeconds * 1000);

  return true;
}

function switchSequence() {
  if (isTransitioning || pedestrianActive || pendingPedestrian) return;

  const fromDir = currentGreen;
  const toDir = otherDir(fromDir);

  runYellowClearance(fromDir, "switch", () => {
    setLights(fromDir, "red");
    logEvent(`${dirShort(fromDir)} → STOP`);

    setLights(toDir, "green");
    logEvent(`${dirShort(toDir)} → GO`);

    currentGreen = toDir;
    updateLabel();
    saveState({ log: false });
    updateCounters();
    onTransitionComplete();
  });
}

function startPedestrianClearance() {
  if (pedestrianActive) return;

  if (isTransitioning) return;

  const activeDir = currentGreen;

  runYellowClearance(activeDir, "pedestrian", () => {
    setBothRed();
    logEvent("All traffic STOP — pedestrian phase starting");
    activatePedestrianCrossing();
  });
}

function startGoPhase() {
  if (mode !== "timer" || !timerStarted || isTransitioning || pedestrianActive || pendingPedestrian) {
    return;
  }

  clearGoPhaseTimers();
  const goSeconds = getGoSeconds(currentGreen);
  goPhaseEndMs = Date.now() + goSeconds * 1000;
  updateCounters();

  goPhaseTimeoutId = setTimeout(() => {
    if (mode !== "timer" || !timerStarted || isTransitioning || pedestrianActive || pendingPedestrian) {
      return;
    }
    switchSequence();
  }, goSeconds * 1000);
}

function activatePedestrianCrossing() {
  if (!pendingPedestrian || pedestrianActive) return;

  clearGoPhaseTimers();
  pendingPedestrian = false;
  pedestrianActive = true;
  pedestrianSecondsLeft = config.pedWalkSeconds;
  setControlsDisabled(true);

  setBothRed();
  setPedestrianSignal(true, pedestrianSecondsLeft);
  logEvent("Pedestrian crossing active — WALK");
  updateCounters();

  pedestrianIntervalId = setInterval(() => {
    pedestrianSecondsLeft -= 1;
    setPedestrianSignal(true, pedestrianSecondsLeft);
    updateCounters();

    if (pedestrianSecondsLeft <= 0) {
      clearInterval(pedestrianIntervalId);
      pedestrianIntervalId = null;

      pedestrianActive = false;
      setPedestrianSignal(false, 0);
      setLights(currentGreen, "green");
      setLights(otherDir(currentGreen), "red");
      setControlsDisabled(false);
      updateCounters();
      logEvent("Pedestrian crossing complete — traffic resumed");
      saveState({ log: false });

      if (mode === "timer" && timerStarted) {
        startGoPhase();
      }
    }
  }, 1000);
}

function requestPedestrianCrossing() {
  if (pendingPedestrian || pedestrianActive) return;
  if (mode === "timer" && !timerStarted) return;

  pendingPedestrian = true;
  logEvent("Pedestrian crossing requested");
  setControlsDisabled(false);

  if (!isTransitioning) {
    startPedestrianClearance();
  }
}

function resetToInitialState() {
  isTransitioning = false;
  pendingPedestrian = false;
  pedestrianActive = false;
  pedestrianSecondsLeft = 0;

  clearTransitionTimer();

  if (pedestrianIntervalId) {
    clearInterval(pedestrianIntervalId);
    pedestrianIntervalId = null;
  }
  clearGoPhaseTimers();

  setLights(currentGreen, "green");
  setLights(otherDir(currentGreen), "red");
  setPedestrianSignal(false, 0);
  updateLabel();
  updateCounters();
  setControlsDisabled(false);
}

function stopTimerMode() {
  timerStarted = false;
  resetToInitialState();
  updateModeBadge();
  logEvent("Timer stopped — simulation reset");
  saveState({ log: false });
}

function startTimerMode() {
  if (mode !== "timer") return;

  timerStarted = true;
  pendingPedestrian = false;
  updateModeBadge();
  logEvent("Timer started");
  setControlsDisabled(false);
  startGoPhase();
  saveState({ log: false });
}

function refreshConfigFromInputs() {
  const pedWalkInput = document.getElementById("pedWalkInput");
  const queueInput = document.getElementById("queueClearanceInput");
  const nsGoInput = document.getElementById("nsGoInput");
  const ewGoInput = document.getElementById("ewGoInput");

  config.pedWalkSeconds = clampSeconds(pedWalkInput?.value, config.pedWalkSeconds);
  config.queueClearanceSeconds = clampSeconds(queueInput?.value, config.queueClearanceSeconds);
  config.nsGoSeconds = clampSeconds(nsGoInput?.value, config.nsGoSeconds);
  config.ewGoSeconds = clampSeconds(ewGoInput?.value, config.ewGoSeconds);

  if (pedWalkInput) pedWalkInput.value = String(config.pedWalkSeconds);
  if (queueInput) queueInput.value = String(config.queueClearanceSeconds);
  if (nsGoInput) nsGoInput.value = String(config.nsGoSeconds);
  if (ewGoInput) ewGoInput.value = String(config.ewGoSeconds);
}

function applyModeUI() {
  const timerPanel = document.getElementById("timerPanel");
  if (timerPanel) {
    timerPanel.classList.toggle("hidden", mode !== "timer");
  }
  updateModeBadge();
  setControlsDisabled(false);
  updateCounters();
}

function setMode(newMode) {
  if (mode === newMode) return;

  mode = newMode;
  timerStarted = false;
  clearGoPhaseTimers();
  clearTransitionTimer();

  logEvent(`Mode changed to ${mode === "timer" ? "Timer" : "Manual"}`);
  applyModeUI();
  saveState({ log: false });
}

function initModeControls() {
  const modeToggle = document.getElementById("modeToggle");
  const pedWalkInput = document.getElementById("pedWalkInput");
  const queueInput = document.getElementById("queueClearanceInput");
  const nsGoInput = document.getElementById("nsGoInput");
  const ewGoInput = document.getElementById("ewGoInput");
  const timerStartButton = document.getElementById("timerStartButton");
  const timerStopButton = document.getElementById("timerStopButton");

  modeToggle?.addEventListener("change", () => {
    setMode(modeToggle.checked ? "timer" : "manual");
    resetToInitialState();
  });

  [pedWalkInput, queueInput, nsGoInput, ewGoInput].forEach((input) => {
    input?.addEventListener("change", () => {
      refreshConfigFromInputs();
      saveState({ log: false });
      if (mode === "timer" && timerStarted && !isTransitioning && !pedestrianActive) {
        startGoPhase();
      }
    });
  });

  timerStartButton?.addEventListener("click", () => {
    refreshConfigFromInputs();
    startTimerMode();
  });

  timerStopButton?.addEventListener("click", () => {
    stopTimerMode();
  });
}

function initPersistControls() {
  document.getElementById("saveLocalButton")?.addEventListener("click", () => {
    refreshConfigFromInputs();
    saveState();
  });

  document.getElementById("loadLocalButton")?.addEventListener("click", () => {
    if (loadState()) {
      resetToInitialState();
      applyModeUI();
    }
  });

  document.getElementById("clearLocalButton")?.addEventListener("click", () => {
    clearLocalStorage();
    resetToInitialState();
    applyModeUI();
  });

  document.getElementById("syncApiButton")?.addEventListener("click", () => {
    refreshConfigFromInputs();
    syncStateToAPI();
  });

  document.getElementById("loadApiButton")?.addEventListener("click", () => {
    loadStateFromAPI();
  });
}

function init() {
  const hadSavedState = loadState({ log: false });
  loadEventLog();
  resetToInitialState();
  refreshConfigFromInputs();
  initModeControls();
  initPersistControls();
  applyModeUI();

  if (countdownIntervalId) clearInterval(countdownIntervalId);
  countdownIntervalId = setInterval(updateCounters, 250);

  if (!hadSavedState) {
    logEvent(`${dirShort(currentGreen)} → GO`);
    logEvent(`${dirShort(otherDir(currentGreen))} → STOP`);
    setBadge("storageBadge", "Storage: Ready", "neutral");
  } else {
    logEvent("Session restored from local storage");
    setBadge("storageBadge", "Storage: Restored", "ok");
  }

  if (localStorage.getItem(API_STATE_ID_KEY)) {
    setBadge("apiBadge", "API: Ready", "neutral");
  }

  document.getElementById("switchButton")?.addEventListener("click", switchSequence);
  document.getElementById("pedestrianButton")?.addEventListener("click", requestPedestrianCrossing);

  document.getElementById("clearLogButton")?.addEventListener("click", () => {
    const list = document.getElementById("eventLogList");
    if (list) list.innerHTML = "";
    saveEventLog();
    logEvent("Event log cleared");
    logEvent(`${dirShort(currentGreen)} is currently GO`);
    logEvent(`${dirShort(otherDir(currentGreen))} is currently STOP`);
  });
}

document.addEventListener("DOMContentLoaded", init);
