// Track which direction is currently green: "NS" or "EW"
let currentGreen = "NS";
let isTransitioning = false;

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

function switchSequence() {
  if (isTransitioning) return;

  isTransitioning = true;
  const button = document.getElementById("switchButton");
  button.disabled = true;

  const fromDir = currentGreen;
  const toDir = currentGreen === "NS" ? "EW" : "NS";

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
    button.disabled = false;
  }, 2000);
}
function init() {
  // Initial state: NS green, EW red (set in HTML & CSS, but ensure here too)
  setLights("NS", "green");
  setLights("EW", "red");
  updateLabel();
  logEvent(`${dirShort("NS")} → GO`);
  logEvent(`${dirShort("EW")} → STOP`);

  const button = document.getElementById("switchButton");
  button.addEventListener("click", switchSequence);

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