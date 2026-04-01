// Track which direction is currently green: "NS" or "EW"
let currentGreen = "NS";
let isTransitioning = false;
let transitionStartMs = null;
let transitionEndMs = null;
let transitionFromDir = null;
let transitionToDir = null;
let pendingPedestrian = false;
let pedestrianActive = false;
let pedestrianSecondsLeft = 0;
const TRANSITION_SECONDS = 2;
const PEDESTRIAN_WALK_SECONDS = 15;
let pedestrianIntervalId = null;
let countdownIntervalId = null;

function dirShort(direction) {
  return direction === "NS" ? "N–S" : "E–W";
}

function dirLong(direction) {
  return direction === "NS" ? "North-South" : "East-West";
}

function nowStamp() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
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

  // Keep newest visible
  list.scrollTop = list.scrollHeight;
}

function setCounter(counterId, seconds) {
  const counter = document.getElementById(counterId);
  if (!counter) return;
  const value = Math.max(0, Math.ceil(seconds));
  counter.textContent = `${value}s`;
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
    nsSeconds = transitionToDir === "NS" ? remaining : 0;
    ewSeconds = transitionFromDir === "EW" ? remaining : 0;
  }

  setCounter("ns-counter", nsSeconds);
  setCounter("ew-counter", ewSeconds);
}

// Helper to set the active light for one direction
function setLights(direction, color) {
  const redId = direction === "NS" ? "ns-red" : "ew-red";
  const yellowId = direction === "NS" ? "ns-yellow" : "ew-yellow";
  const greenId = direction === "NS" ? "ns-green" : "ew-green";

  const red = document.getElementById(redId);
  const yellow = document.getElementById(yellowId);
  const green = document.getElementById(greenId);

  red.classList.remove("active");
  yellow.classList.remove("active");
  green.classList.remove("active");

  if (color === "red") red.classList.add("active");
  if (color === "yellow") yellow.classList.add("active");
  if (color === "green") green.classList.add("active");
}

// Update the label showing which direction is green
function updateLabel() {
  const label = document.getElementById("currentGreenLabel");
  if (currentGreen === "NS") {
    label.textContent = "North-South";
  } else {
    label.textContent = "East-West";
  }
}

function setControlsDisabled(disabled) {
  const switchButton = document.getElementById("switchButton");
  const pedestrianButton = document.getElementById("pedestrianButton");
  if (switchButton) switchButton.disabled = disabled;
  if (pedestrianButton) pedestrianButton.disabled = disabled || pendingPedestrian;
}

function activatePedestrianCrossing() {
  if (!pendingPedestrian || pedestrianActive) return;

  pendingPedestrian = false;
  pedestrianActive = true;
  pedestrianSecondsLeft = PEDESTRIAN_WALK_SECONDS;
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
    }
  }, 1000);
}

function onTransitionComplete() {
  transitionStartMs = null;
  transitionEndMs = null;
  transitionFromDir = null;
  transitionToDir = null;
  updateCounters();

  if (pendingPedestrian) {
    activatePedestrianCrossing();
  }
}

function switchSequence() {
  if (isTransitioning || pedestrianActive) return;

  isTransitioning = true;
  setControlsDisabled(true);

  const fromDir = currentGreen;
  const toDir = currentGreen === "NS" ? "EW" : "NS";
  transitionFromDir = fromDir;
  transitionToDir = toDir;
  transitionStartMs = Date.now();
  transitionEndMs = transitionStartMs + TRANSITION_SECONDS * 1000;
  updateCounters();

  // Step 1: current green -> yellow
  setLights(fromDir, "yellow");
  logEvent(`Transition triggered — ${dirShort(fromDir)} going to WARNING`);

  // Wait 2 seconds
  setTimeout(() => {
    // Step 2: current direction -> red
    setLights(fromDir, "red");
    logEvent(`${dirShort(fromDir)} → STOP`);

    // Step 3: opposite direction -> green
    setLights(toDir, "green");
    logEvent(`${dirShort(toDir)} → GO`);
    currentGreen = toDir;
    updateLabel();

    isTransitioning = false;
    setControlsDisabled(false);
    onTransitionComplete();
  }, 2000);
}

function requestPedestrianCrossing() {
  if (pendingPedestrian || pedestrianActive) return;

  pendingPedestrian = true;
  logEvent("Pedestrian crossing requested");
  setControlsDisabled(false);

  if (!isTransitioning) {
    switchSequence();
  }
}

function init() {
  // Initial state: NS green, EW red (set in HTML & CSS, but ensure here too)
  setLights("NS", "green");
  setLights("EW", "red");
  updateLabel();
  setPedestrianSignal(false, 0);
  updateCounters();
  if (countdownIntervalId) clearInterval(countdownIntervalId);
  countdownIntervalId = setInterval(updateCounters, 250);
  logEvent(`${dirShort("NS")} → GO`);
  logEvent(`${dirShort("EW")} → STOP`);

  const button = document.getElementById("switchButton");
  button.addEventListener("click", switchSequence);
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
}

document.addEventListener("DOMContentLoaded", init);