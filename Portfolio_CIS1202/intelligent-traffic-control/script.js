let currentGreen = "NS";
let isTransitioning = false;
let transitionEndMs = null;
let transitionFromDir = null;
let transitionToDir = null;
let transitionTimeoutId = null;

let pendingPedestrian = false;
let pedestrianActive = false;
let pedestrianSecondsLeft = 0;
let pedestrianIntervalId = null;

let countdownIntervalId = null;
let goPhaseEndMs = null;
let goPhaseTimeoutId = null;

let mode = "manual";
let timerStarted = false;
const TIMER_YELLOW_SECONDS = 3;

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

function nowStamp() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getGoSeconds(direction) {
  return direction === "NS" ? config.nsGoSeconds : config.ewGoSeconds;
}

function logEvent(message) {
  const list = document.getElementById("eventLogList");
  if (!list) return;

  const li = document.createElement("li");
  li.className = "event-log__item";

  const meta = document.createElement("div");
  meta.className = "event-log__meta";

  const time = document.createElement("span");
  time.className = "event-log__time";
  time.textContent = nowStamp();

  meta.appendChild(time);

  const msg = document.createElement("div");
  msg.className = "event-log__msg";
  msg.textContent = message;

  li.appendChild(meta);
  li.appendChild(msg);
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;
}

function setCounter(counterId, seconds) {
  const counter = document.getElementById(counterId);
  if (!counter) return;
  counter.textContent = `${Math.max(0, Math.ceil(seconds))}s`;
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
    nsSeconds = currentGreen === "NS" ? pedestrianSecondsLeft : 0;
    ewSeconds = currentGreen === "EW" ? pedestrianSecondsLeft : 0;
  } else if (isTransitioning && transitionEndMs) {
    const remaining = Math.max(0, (transitionEndMs - Date.now()) / 1000);
    // During transition, the "from" direction is yellow, so keep timer aligned with that color state.
    nsSeconds = transitionFromDir === "NS" ? remaining : 0;
    ewSeconds = transitionFromDir === "EW" ? remaining : 0;
  } else if (mode === "timer" && timerStarted && goPhaseEndMs) {
    const remaining = Math.max(0, (goPhaseEndMs - Date.now()) / 1000);
    nsSeconds = currentGreen === "NS" ? remaining : 0;
    ewSeconds = currentGreen === "EW" ? remaining : 0;
  }

  setCounter("ns-counter", nsSeconds);
  setCounter("ew-counter", ewSeconds);
}

function setLights(direction, color) {
  const redId = direction === "NS" ? "ns-red" : "ew-red";
  const yellowId = direction === "NS" ? "ns-yellow" : "ew-yellow";
  const greenId = direction === "NS" ? "ns-green" : "ew-green";

  const red = document.getElementById(redId);
  const yellow = document.getElementById(yellowId);
  const green = document.getElementById(greenId);
  if (!red || !yellow || !green) return;

  red.classList.remove("active");
  yellow.classList.remove("active");
  green.classList.remove("active");

  if (color === "red") red.classList.add("active");
  if (color === "yellow") yellow.classList.add("active");
  if (color === "green") green.classList.add("active");
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
    const shouldDisableSwitch = disabled || mode === "timer";
    switchButton.disabled = shouldDisableSwitch;
  }

  if (pedestrianButton) {
    const timerPedDisabled = mode === "timer" && !timerStarted;
    pedestrianButton.disabled = disabled || pendingPedestrian || timerPedDisabled;
  }
}

function clearGoPhaseTimers() {
  if (goPhaseTimeoutId) {
    clearTimeout(goPhaseTimeoutId);
    goPhaseTimeoutId = null;
  }
  goPhaseEndMs = null;
}

function onTransitionComplete() {
  transitionEndMs = null;
  transitionFromDir = null;
  transitionToDir = null;
  transitionTimeoutId = null;
  updateCounters();

  if (pendingPedestrian) {
    activatePedestrianCrossing();
    return;
  }

  if (mode === "timer" && timerStarted) {
    startGoPhase();
  }
}

function switchSequence() {
  if (isTransitioning || pedestrianActive) return;

  clearGoPhaseTimers();
  isTransitioning = true;
  setControlsDisabled(true);

  const transitionSeconds = mode === "timer" ? TIMER_YELLOW_SECONDS : config.queueClearanceSeconds;

  const fromDir = currentGreen;
  const toDir = currentGreen === "NS" ? "EW" : "NS";
  transitionFromDir = fromDir;
  transitionToDir = toDir;
  transitionEndMs = Date.now() + transitionSeconds * 1000;
  updateCounters();

  setLights(fromDir, "yellow");
  logEvent(`Transition triggered — ${dirShort(fromDir)} going to WARNING`);

  transitionTimeoutId = setTimeout(() => {
    setLights(fromDir, "red");
    logEvent(`${dirShort(fromDir)} → STOP`);

    setLights(toDir, "green");
    logEvent(`${dirShort(toDir)} → GO`);

    currentGreen = toDir;
    updateLabel();
    isTransitioning = false;
    setControlsDisabled(false);
    onTransitionComplete();
  }, transitionSeconds * 1000);
}

function startGoPhase() {
  if (mode !== "timer" || !timerStarted || isTransitioning || pedestrianActive) return;

  clearGoPhaseTimers();
  const goSeconds = getGoSeconds(currentGreen);
  goPhaseEndMs = Date.now() + goSeconds * 1000;
  updateCounters();

  goPhaseTimeoutId = setTimeout(() => {
    if (mode !== "timer" || !timerStarted || isTransitioning || pedestrianActive) return;
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

  setLights("NS", "red");
  setLights("EW", "red");
  setPedestrianSignal(true, pedestrianSecondsLeft);
  logEvent("Pedestrian Crossing Activated — all traffic STOP");
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
      setLights(currentGreen === "NS" ? "EW" : "NS", "red");
      setControlsDisabled(false);
      updateCounters();
      logEvent("Pedestrian Crossing Complete — normal traffic resumed");

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
    switchSequence();
  }
}

function resetToInitialState() {
  currentGreen = "NS";
  isTransitioning = false;
  pendingPedestrian = false;
  pedestrianActive = false;
  pedestrianSecondsLeft = 0;
  transitionEndMs = null;
  transitionFromDir = null;
  transitionToDir = null;

  if (transitionTimeoutId) {
    clearTimeout(transitionTimeoutId);
    transitionTimeoutId = null;
  }
  if (pedestrianIntervalId) {
    clearInterval(pedestrianIntervalId);
    pedestrianIntervalId = null;
  }
  clearGoPhaseTimers();

  setLights("NS", "green");
  setLights("EW", "red");
  setPedestrianSignal(false, 0);
  updateLabel();
  updateCounters();
}

function stopTimerMode() {
  timerStarted = false;
  resetToInitialState();
  setControlsDisabled(false);
  logEvent("Timer stopped and simulation reset");
}

function startTimerMode() {
  if (mode !== "timer") return;
  timerStarted = true;
  pendingPedestrian = false;
  setControlsDisabled(false);
  logEvent("Timer started");
  startGoPhase();
}

function refreshConfigFromInputs() {
  const pedWalkInput = document.getElementById("pedWalkInput");
  const queueInput = document.getElementById("queueClearanceInput");
  const nsGoInput = document.getElementById("nsGoInput");
  const ewGoInput = document.getElementById("ewGoInput");

  config.pedWalkSeconds = clampSeconds(pedWalkInput ? pedWalkInput.value : config.pedWalkSeconds, 15);
  config.queueClearanceSeconds = clampSeconds(queueInput ? queueInput.value : config.queueClearanceSeconds, 2);
  config.nsGoSeconds = clampSeconds(nsGoInput ? nsGoInput.value : config.nsGoSeconds, 12);
  config.ewGoSeconds = clampSeconds(ewGoInput ? ewGoInput.value : config.ewGoSeconds, 12);

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
  setControlsDisabled(false);
  updateCounters();
}

function setMode(newMode) {
  if (mode === newMode) return;
  mode = newMode;

  if (mode === "manual") {
    timerStarted = false;
    clearGoPhaseTimers();
    logEvent("Mode changed to Manual");
  } else {
    timerStarted = false;
    clearGoPhaseTimers();
    logEvent("Mode changed to Timer");
  }

  applyModeUI();
}

function initModeControls() {
  const modeToggle = document.getElementById("modeToggle");
  const pedWalkInput = document.getElementById("pedWalkInput");
  const queueInput = document.getElementById("queueClearanceInput");
  const nsGoInput = document.getElementById("nsGoInput");
  const ewGoInput = document.getElementById("ewGoInput");
  const timerStartButton = document.getElementById("timerStartButton");
  const timerStopButton = document.getElementById("timerStopButton");

  if (modeToggle) {
    modeToggle.addEventListener("change", () => {
      setMode(modeToggle.checked ? "timer" : "manual");
      if (mode === "timer") {
        stopTimerMode();
      } else {
        resetToInitialState();
      }
    });
  }

  [pedWalkInput, queueInput, nsGoInput, ewGoInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("change", () => {
      refreshConfigFromInputs();
      if (mode === "timer" && timerStarted) {
        startGoPhase();
      }
    });
  });

  if (timerStartButton) {
    timerStartButton.addEventListener("click", () => {
      refreshConfigFromInputs();
      startTimerMode();
    });
  }

  if (timerStopButton) {
    timerStopButton.addEventListener("click", () => {
      stopTimerMode();
    });
  }
}

function init() {
  resetToInitialState();
  if (countdownIntervalId) clearInterval(countdownIntervalId);
  countdownIntervalId = setInterval(updateCounters, 250);
  logEvent(`${dirShort("NS")} → GO`);
  logEvent(`${dirShort("EW")} → STOP`);

  const switchButton = document.getElementById("switchButton");
  if (switchButton) {
    switchButton.addEventListener("click", switchSequence);
  }

  const pedestrianButton = document.getElementById("pedestrianButton");
  if (pedestrianButton) {
    pedestrianButton.addEventListener("click", requestPedestrianCrossing);
  }

  const clearButton = document.getElementById("clearLogButton");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      const list = document.getElementById("eventLogList");
      if (list) list.innerHTML = "";
      logEvent("Event log cleared");
      logEvent(`${dirShort(currentGreen)} is currently GO`);
      logEvent(`${dirShort(currentGreen === "NS" ? "EW" : "NS")} is currently STOP`);
    });
  }

  refreshConfigFromInputs();
  initModeControls();
  applyModeUI();
}

document.addEventListener("DOMContentLoaded", init);