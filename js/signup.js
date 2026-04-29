import { createCloudClient } from "./domain/cloud.js";
import { detectRuntimeMode, validateTeamPin } from "./domain/runtime.js";

const dom = {
  teamName: document.getElementById("team-name"),
  teamPin: document.getElementById("team-pin"),
  coachEmail: document.getElementById("coach-email"),
  register: document.getElementById("register-team"),
  reset: document.getElementById("reset-form"),
  runtimeNote: document.getElementById("runtime-note"),
  error: document.getElementById("signup-error"),
  success: document.getElementById("signup-success")
};

const runtime = detectRuntimeMode(window.location);
const cloud = createCloudClient({ runtime });

const state = {
  turnstileToken: ""
};

window.onTurnstileSuccess = function (token) {
  state.turnstileToken = token || "";
};

window.onTurnstileExpired = function () {
  state.turnstileToken = "";
};

window.onTurnstileError = function () {
  state.turnstileToken = "";
};

function setMessage(el, text) {
  if (!text) {
    el.style.display = "none";
    el.textContent = "";
    return;
  }
  el.style.display = "block";
  el.textContent = text;
}

function resetTurnstile() {
  state.turnstileToken = "";
  try {
    if (window.turnstile && typeof window.turnstile.reset === "function") {
      window.turnstile.reset();
    }
  } catch (error) {
    // ignore
  }
}

async function registerTeam() {
  setMessage(dom.error, "");
  setMessage(dom.success, "");

  const teamName = dom.teamName.value.trim();
  const pin = dom.teamPin.value.trim();
  const coachEmail = dom.coachEmail.value.trim();

  if (!teamName || !pin || !coachEmail) {
    setMessage(dom.error, "Enter team name, PIN, and coach email.");
    return;
  }
  if (!validateTeamPin(pin)) {
    setMessage(dom.error, "PIN must be exactly 4 digits.");
    return;
  }
  if (!state.turnstileToken) {
    setMessage(dom.error, "Complete the Turnstile check first.");
    return;
  }
  if (!runtime.allowsCloudSync) {
    setMessage(dom.error, "Team signup requires the hosted site.");
    return;
  }

  dom.register.disabled = true;
  dom.register.textContent = "Registering...";

  try {
    const data = await cloud.registerTeam({
      teamName,
      pin,
      coachEmail,
      turnstileToken: state.turnstileToken
    });
    if (!data?.ok) {
      setMessage(dom.error, data?.error || "Registration failed.");
      return;
    }

    setMessage(dom.success, `Team "${teamName}" registered successfully. Connect from the Mission Tool.`);
    resetTurnstile();
  } catch (error) {
    setMessage(dom.error, "Network error registering team.");
  } finally {
    dom.register.disabled = !runtime.allowsCloudSync;
    dom.register.textContent = "Register Team";
  }
}

function resetForm() {
  dom.teamName.value = "";
  dom.teamPin.value = "";
  dom.coachEmail.value = "";
  setMessage(dom.error, "");
  setMessage(dom.success, "");
  resetTurnstile();
}

function init() {
  dom.runtimeNote.textContent = runtime.detail;
  dom.register.disabled = !runtime.allowsCloudSync;
  dom.register.addEventListener("click", registerTeam);
  dom.reset.addEventListener("click", resetForm);
}

init();
