import { createCloudClient } from "./domain/cloud.js?v=cloud-diagnostics";
import {
  applyRobotToMission,
  buildReplayFrames,
  createBlankMission,
  createDefaultMission,
  normalizeMission,
  normalizeRobot,
  safeNum
} from "./domain/model.js";
import { detectRuntimeMode, validateTeamPin } from "./domain/runtime.js";
import { buildMissionShareLink, readMissionFromQuery } from "./domain/share.js";
import {
  consumeRobotTransfer,
  loadMissionDraft,
  loadRobotLibrary,
  loadTeamSession,
  saveMissionDraft,
  saveRobotLibrary,
  saveTeamSession
} from "./domain/storage.js";
import { FieldRenderer } from "./ui/field_renderer.js?v=front-indicator";

const dom = {
  fieldHost: document.getElementById("mission-field-host"),
  missionName: document.getElementById("mission-name"),
  traceColor: document.getElementById("trace-color"),
  startX: document.getElementById("start-x"),
  startY: document.getElementById("start-y"),
  startAngle: document.getElementById("start-angle"),
  loadDemo: document.getElementById("load-demo"),
  resetMission: document.getElementById("reset-mission"),
  robotWidth: document.getElementById("robot-width"),
  robotLength: document.getElementById("robot-length"),
  robotOffset: document.getElementById("robot-offset"),
  robotName: document.getElementById("robot-name"),
  saveRobotLocal: document.getElementById("save-robot-local"),
  applyLocalRobot: document.getElementById("apply-local-robot"),
  localRobotSelect: document.getElementById("local-robot-select"),
  addAttachment: document.getElementById("add-attachment"),
  attachmentList: document.getElementById("attachment-list"),
  attachmentCount: document.getElementById("attachment-count"),
  addMove: document.getElementById("add-move"),
  addRotate: document.getElementById("add-rotate"),
  addPause: document.getElementById("add-pause"),
  insertActionTop: document.getElementById("insert-action-top"),
  actionList: document.getElementById("action-list"),
  missionJson: document.getElementById("mission-json"),
  jsonError: document.getElementById("json-error"),
  applyJson: document.getElementById("apply-json"),
  copyLink: document.getElementById("copy-link"),
  emailLink: document.getElementById("email-link"),
  runtimeBadge: document.getElementById("runtime-badge"),
  runtimeDetail: document.getElementById("runtime-detail"),
  teamName: document.getElementById("team-name"),
  teamPin: document.getElementById("team-pin"),
  connectTeam: document.getElementById("connect-team"),
  refreshTeam: document.getElementById("refresh-team"),
  teamStatus: document.getElementById("team-status"),
  teamMissionSelect: document.getElementById("team-mission-select"),
  loadTeamMission: document.getElementById("load-team-mission"),
  saveTeamMission: document.getElementById("save-team-mission"),
  deleteTeamMission: document.getElementById("delete-team-mission"),
  teamRobotSelect: document.getElementById("team-robot-select"),
  loadTeamRobot: document.getElementById("load-team-robot"),
  saveTeamRobot: document.getElementById("save-team-robot"),
  deleteTeamRobot: document.getElementById("delete-team-robot"),
  startMission: document.getElementById("start-mission"),
  stopMission: document.getElementById("stop-mission"),
  clearField: document.getElementById("clear-field"),
  buildReplay: document.getElementById("build-replay"),
  playReplay: document.getElementById("play-replay"),
  pauseReplay: document.getElementById("pause-replay"),
  resetReplay: document.getElementById("reset-replay"),
  replaySlider: document.getElementById("replay-slider"),
  replayCount: document.getElementById("replay-count")
};

const runtime = detectRuntimeMode(window.location);
const cloud = createCloudClient({ runtime });
const renderer = new FieldRenderer(dom.fieldHost);

const state = {
  mission: createDefaultMission(),
  localRobots: [],
  teamSession: {
    name: "public",
    pin: "",
    connected: false,
    lastMode: runtime.kind
  },
  teamData: {
    missions: [],
    robots: []
  },
  replay: {
    frames: [],
    index: 0,
    playing: false,
    rafId: null,
    fps: 60
  },
  run: {
    frames: [],
    active: false,
    rafId: null,
    fps: 60,
    startTime: 0
  }
};

function setJsonError(message) {
  dom.jsonError.style.display = message ? "block" : "none";
  dom.jsonError.textContent = message || "";
}

function setTeamStatus(message) {
  dom.teamStatus.textContent = message;
}

function getCloudErrorMessage(result, fallback) {
  const message = String(result?.error || fallback || "Cloud request failed.");
  return result?.status ? `${message} (${result.status})` : message;
}

function stopReplay() {
  state.replay.playing = false;
  if (state.replay.rafId) {
    cancelAnimationFrame(state.replay.rafId);
  }
  state.replay.rafId = null;
}

function stopMissionRun() {
  state.run.active = false;
  if (state.run.rafId) {
    cancelAnimationFrame(state.run.rafId);
  }
  state.run.rafId = null;
  dom.stopMission.disabled = true;
}

function resetReplayState() {
  stopReplay();
  state.replay.frames = [];
  state.replay.index = 0;
  dom.replaySlider.value = "0";
  dom.replaySlider.max = "0";
  updateReplayControls();
  dom.replayCount.textContent = "0 / 0";
}

function setReplayFrames(frames) {
  state.replay.frames = Array.isArray(frames) ? frames : [];
  state.replay.index = 0;
  dom.replaySlider.value = "0";
  dom.replaySlider.max = String(Math.max(0, state.replay.frames.length - 1));
  updateReplayControls();
  dom.replayCount.textContent = state.replay.frames.length
    ? `0 / ${Math.max(0, state.replay.frames.length - 1)}`
    : "0 / 0";
}

function persistMission() {
  saveMissionDraft(window.localStorage, state.mission);
}

function persistTeamSession() {
  saveTeamSession(window.localStorage, state.teamSession);
}

function upsertRobot(list, robotLike) {
  const robot = normalizeRobot(robotLike);
  const next = [...list];
  const existingIndex = next.findIndex(
    (candidate) => candidate.name.trim().toLowerCase() === robot.name.trim().toLowerCase()
  );
  if (existingIndex >= 0) {
    next[existingIndex] = robot;
  } else {
    next.push(robot);
  }
  return next;
}

function createRobotFromMission() {
  return normalizeRobot({
    name: state.mission.robotName || `Robot ${state.localRobots.length + 1}`,
    robotWidthCm: state.mission.robotWidthCm,
    robotLengthCm: state.mission.robotLengthCm,
    offsetY: state.mission.offsetY,
    attachments: state.mission.attachments
  });
}

function withMissionRobot(nextMission) {
  const robot = normalizeRobot({
    ...(nextMission.robot || {}),
    name: nextMission.robotName || nextMission.robot?.name || "Mission Robot",
    robotWidthCm: nextMission.robotWidthCm,
    robotLengthCm: nextMission.robotLengthCm,
    offsetY: nextMission.offsetY,
    attachments: nextMission.attachments
  });

  return {
    ...nextMission,
    robotName: robot.name,
    robot,
    robotWidthCm: robot.robotWidthCm,
    robotLengthCm: robot.robotLengthCm,
    offsetY: robot.offsetY,
    attachments: robot.attachments
  };
}

function updateRuntimeBanner() {
  dom.runtimeBadge.textContent = runtime.label;
  dom.runtimeBadge.dataset.mode = runtime.kind;
  dom.runtimeDetail.textContent = runtime.detail;
}

function renderLocalRobots(selectedName = "") {
  const previousValue = selectedName || dom.localRobotSelect.value;
  dom.localRobotSelect.innerHTML = "";

  if (!state.localRobots.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "No saved robots yet";
    dom.localRobotSelect.appendChild(placeholder);
    dom.localRobotSelect.disabled = true;
    dom.applyLocalRobot.disabled = true;
    return;
  }

  dom.localRobotSelect.disabled = false;
  dom.applyLocalRobot.disabled = false;
  state.localRobots.forEach((robot, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = robot.name;
    if (robot.name === previousValue || String(index) === previousValue) {
      option.selected = true;
    }
    dom.localRobotSelect.appendChild(option);
  });
}

function renderTeamMissions() {
  dom.teamMissionSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.teamData.missions.length ? "-- select --" : "No team missions yet";
  dom.teamMissionSelect.appendChild(placeholder);

  state.teamData.missions.forEach((mission) => {
    const option = document.createElement("option");
    option.value = mission.name;
    option.textContent = mission.name;
    dom.teamMissionSelect.appendChild(option);
  });
}

function renderTeamRobots() {
  dom.teamRobotSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.teamData.robots.length ? "-- select --" : "No team robots yet";
  dom.teamRobotSelect.appendChild(placeholder);

  state.teamData.robots.forEach((robot) => {
    const option = document.createElement("option");
    option.value = robot.name;
    option.textContent = robot.name;
    dom.teamRobotSelect.appendChild(option);
  });
}

function updateReplayControls() {
  const hasFrames = state.replay.frames.length > 0;
  dom.playReplay.disabled = !hasFrames || state.replay.playing;
  dom.pauseReplay.disabled = !state.replay.playing;
  dom.resetReplay.disabled = !hasFrames;
}

function renderReplayFrame(index) {
  if (!state.replay.frames.length) return;
  const safeIndex = Math.max(0, Math.min(index, state.replay.frames.length - 1));
  state.replay.index = safeIndex;
  dom.replaySlider.value = String(safeIndex);
  dom.replayCount.textContent = `${safeIndex} / ${Math.max(0, state.replay.frames.length - 1)}`;
  renderer.renderFrameSequence(state.mission, state.replay.frames, safeIndex);
}

function syncMissionToInputs({ skipActions = false } = {}) {
  const mission = state.mission;
  dom.missionName.value = mission.name;
  dom.traceColor.value = mission.traceColor;
  dom.startX.value = String(mission.startX);
  dom.startY.value = String(mission.startY);
  dom.startAngle.value = String(mission.startAngle);
  dom.robotWidth.value = String(mission.robotWidthCm);
  dom.robotLength.value = String(mission.robotLengthCm);
  dom.robotOffset.value = String(mission.offsetY);
  dom.robotName.value = mission.robotName || "";

  if (document.activeElement !== dom.missionJson) {
    dom.missionJson.value = JSON.stringify(mission, null, 2);
  }

  renderAttachments();
  if (!skipActions) {
    renderActions();
  }
}

function renderMission() {
  renderer.renderMission(state.mission);
}

function commitMission(nextMission, { preserveReplay = false, skipActions = false } = {}) {
  state.mission = normalizeMission(nextMission);
  persistMission();
  if (!preserveReplay) {
    stopMissionRun();
    resetReplayState();
  }
  syncMissionToInputs({ skipActions });
  renderMission();
}

function updateMissionFromInputs() {
  commitMission(
    withMissionRobot({
      ...state.mission,
      name: dom.missionName.value.trim() || "Untitled Mission",
      traceColor: dom.traceColor.value,
      startX: safeNum(dom.startX.value, 0),
      startY: safeNum(dom.startY.value, 0),
      startAngle: safeNum(dom.startAngle.value, 0),
      robotWidthCm: safeNum(dom.robotWidth.value, 0),
      robotLengthCm: safeNum(dom.robotLength.value, 0),
      offsetY: safeNum(dom.robotOffset.value, 0),
      robotName: dom.robotName.value.trim()
    })
  );
}

function getActionUnit(type) {
  if (type === "rotate") return "°";
  if (type === "pause") return "sec";
  return "cm";
}

function createAction(type) {
  if (type === "rotate") return { type: "rotate", value: -90 };
  if (type === "pause") return { type: "pause", value: 1 };
  return { type: "move", value: 50 };
}

function insertActionAt(index, type) {
  const actions = [...state.mission.actions];
  actions.splice(index, 0, createAction(type));
  commitMission({ ...state.mission, actions });
}

function createIconButton({ label, title, icon }) {
  const button = document.createElement("button");
  button.className = "btn-ghost icon-button";
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = title || label;
  button.innerHTML = icon;
  return button;
}

function renderActions() {
  dom.actionList.innerHTML = "";

  state.mission.actions.forEach((action, index) => {
    const row = document.createElement("div");
    row.className = "action-item";

    const typeSelect = document.createElement("select");
    ["move", "rotate", "pause"].forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type.toUpperCase();
      if (action.type === type) option.selected = true;
      typeSelect.appendChild(option);
    });
    typeSelect.addEventListener("change", () => {
      const actions = [...state.mission.actions];
      actions[index] = { ...actions[index], type: typeSelect.value };
      commitMission({ ...state.mission, actions });
    });

    const valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.step = "1";
    valueInput.value = String(action.value);
    valueInput.addEventListener("input", () => {
      const actions = [...state.mission.actions];
      actions[index] = { ...actions[index], value: safeNum(valueInput.value, 0) };
      commitMission({ ...state.mission, actions }, { skipActions: true });
    });
    valueInput.addEventListener("blur", () => {
      renderActions();
    });

    const valueField = document.createElement("div");
    valueField.className = "action-value-field";
    const unitLabel = document.createElement("span");
    unitLabel.className = "action-unit";
    unitLabel.textContent = getActionUnit(action.type);
    valueField.append(valueInput, unitLabel);

    const insertButton = createIconButton({
      label: `Insert pause after action ${index + 1}`,
      title: "Insert pause",
      icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`
    });
    insertButton.addEventListener("click", () => {
      insertActionAt(index + 1, "pause");
    });

    const deleteButton = createIconButton({
      label: `Delete action ${index + 1}`,
      title: "Delete action",
      icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>`
    });
    deleteButton.addEventListener("click", () => {
      const actions = state.mission.actions.filter((_, actionIndex) => actionIndex !== index);
      commitMission({ ...state.mission, actions });
    });

    row.append(typeSelect, valueField, insertButton, deleteButton);
    dom.actionList.appendChild(row);
  });
}

function renderAttachments() {
  dom.attachmentList.innerHTML = "";
  const attachments = state.mission.attachments;
  dom.attachmentCount.textContent = `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`;

  attachments.forEach((attachment, index) => {
    const row = document.createElement("div");
    row.className = "attachment-item";

    const side = document.createElement("select");
    ["front", "rear", "left", "right"].forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      if (attachment.side === type) option.selected = true;
      side.appendChild(option);
    });
    side.addEventListener("change", () => {
      const attachmentsNext = [...state.mission.attachments];
      attachmentsNext[index] = { ...attachmentsNext[index], side: side.value };
      commitMission(withMissionRobot({ ...state.mission, attachments: attachmentsNext }));
    });

    const width = document.createElement("input");
    width.type = "number";
    width.step = "0.1";
    width.value = String(attachment.widthCm);
    width.addEventListener("input", () => {
      const attachmentsNext = [...state.mission.attachments];
      attachmentsNext[index] = { ...attachmentsNext[index], widthCm: safeNum(width.value, 0) };
      commitMission(withMissionRobot({ ...state.mission, attachments: attachmentsNext }));
    });

    const length = document.createElement("input");
    length.type = "number";
    length.step = "0.1";
    length.value = String(attachment.lengthCm);
    length.addEventListener("input", () => {
      const attachmentsNext = [...state.mission.attachments];
      attachmentsNext[index] = { ...attachmentsNext[index], lengthCm: safeNum(length.value, 0) };
      commitMission(withMissionRobot({ ...state.mission, attachments: attachmentsNext }));
    });

    const position = document.createElement("input");
    position.type = "number";
    position.step = "0.1";
    position.value = String(attachment.positionCm);
    position.addEventListener("input", () => {
      const attachmentsNext = [...state.mission.attachments];
      attachmentsNext[index] = { ...attachmentsNext[index], positionCm: safeNum(position.value, 0) };
      commitMission(withMissionRobot({ ...state.mission, attachments: attachmentsNext }));
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "btn-ghost";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      const attachmentsNext = state.mission.attachments.filter(
        (_, attachmentIndex) => attachmentIndex !== index
      );
      commitMission(withMissionRobot({ ...state.mission, attachments: attachmentsNext }));
    });

    row.append(side, width, length, position, deleteButton);
    dom.attachmentList.appendChild(row);
  });
}

function applyRobotProfile(robotLike) {
  commitMission(applyRobotToMission(state.mission, robotLike));
}

function saveLocalRobot() {
  const robot = createRobotFromMission();
  state.localRobots = upsertRobot(state.localRobots, robot);
  saveRobotLibrary(window.localStorage, state.localRobots);
  renderLocalRobots(robot.name);
  setJsonError("");
}

function applySelectedLocalRobot() {
  const index = parseInt(dom.localRobotSelect.value, 10);
  const robot = state.localRobots[index];
  if (!robot) return;
  applyRobotProfile(robot);
}

function applyTransferredRobotIfPresent() {
  const transferRobot = consumeRobotTransfer(window.localStorage);
  if (!transferRobot) return false;
  applyRobotProfile(transferRobot);
  return true;
}

function buildReplay() {
  stopMissionRun();
  stopReplay();
  setReplayFrames(buildReplayFrames(state.mission, { fps: state.replay.fps }));
  if (!state.replay.frames.length) {
    return;
  }
  renderReplayFrame(0);
}

function playReplay() {
  if (!state.replay.frames.length || state.replay.playing) return;
  stopMissionRun();
  state.replay.playing = true;
  const startedAt = performance.now();
  const startIndex = state.replay.index;

  const step = (now) => {
    if (!state.replay.playing) return;
    const elapsedMs = now - startedAt;
    const index = Math.min(
      state.replay.frames.length - 1,
      startIndex + Math.floor((elapsedMs / 1000) * state.replay.fps)
    );
    renderReplayFrame(index);
    if (index >= state.replay.frames.length - 1) {
      state.replay.playing = false;
      state.replay.rafId = null;
      updateReplayControls();
      return;
    }
    state.replay.rafId = requestAnimationFrame(step);
  };

  updateReplayControls();
  state.replay.rafId = requestAnimationFrame(step);
}

function resetReplay() {
  stopReplay();
  if (!state.replay.frames.length) return;
  renderReplayFrame(0);
  updateReplayControls();
}

function startMissionRun() {
  if (state.run.active) return;
  stopReplay();
  state.run.frames = buildReplayFrames(state.mission, { fps: state.run.fps });
  if (!state.run.frames.length) return;
  setReplayFrames(state.run.frames);
  state.run.active = true;
  state.run.startTime = performance.now();
  dom.stopMission.disabled = false;

  const step = (now) => {
    if (!state.run.active) return;
    const index = Math.min(
      state.run.frames.length - 1,
      Math.floor(((now - state.run.startTime) / 1000) * state.run.fps)
    );
    renderReplayFrame(index);
    if (index >= state.run.frames.length - 1) {
      stopMissionRun();
      return;
    }
    state.run.rafId = requestAnimationFrame(step);
  };

  state.run.rafId = requestAnimationFrame(step);
}

function updateTeamControls() {
  const connected = state.teamSession.connected;
  const hosted = runtime.allowsCloudSync;
  const enabled = connected && hosted;

  dom.refreshTeam.disabled = !enabled;
  dom.teamMissionSelect.disabled = !enabled;
  dom.loadTeamMission.disabled = !enabled;
  dom.saveTeamMission.disabled = !enabled;
  dom.deleteTeamMission.disabled = !enabled;
  dom.teamRobotSelect.disabled = !enabled;
  dom.loadTeamRobot.disabled = !enabled;
  dom.saveTeamRobot.disabled = !enabled;
  dom.deleteTeamRobot.disabled = !enabled;
}

async function connectTeam() {
  const name = dom.teamName.value.trim();
  const pin = dom.teamPin.value.trim();

  if (!name || !pin) {
    setTeamStatus("Enter a team name and PIN.");
    return;
  }
  if (!validateTeamPin(pin)) {
    setTeamStatus("PIN must be exactly 4 digits.");
    return;
  }

  state.teamSession = {
    name,
    pin,
    connected: true,
    lastMode: runtime.kind
  };
  persistTeamSession();
  updateTeamControls();

  if (!runtime.allowsCloudSync) {
    setTeamStatus("Local mode stores team info for handoff only. Open the hosted site for cloud sync.");
    return;
  }

  setTeamStatus(`Connected as ${name}. Syncing...`);
  const loaded = await refreshTeamData();
  if (!loaded) {
    state.teamSession = {
      ...state.teamSession,
      connected: false
    };
    persistTeamSession();
    updateTeamControls();
  }
}

async function refreshTeamData() {
  if (!state.teamSession.connected) return false;
  if (!runtime.allowsCloudSync) {
    setTeamStatus("Cloud sync is disabled in local mode.");
    return false;
  }

  try {
    const [missionsResult, robotsResult] = await Promise.all([
      cloud.listMissions(state.teamSession),
      cloud.listRobots(state.teamSession).catch((error) => ({
        ok: false,
        error: error.message || "Could not load robots."
      }))
    ]);

    if (!missionsResult?.ok) {
      throw new Error(getCloudErrorMessage(missionsResult, "Could not load missions."));
    }

    state.teamData.missions = (missionsResult?.missions || []).map((mission) => ({
      name: mission.name || mission.missionName || "Untitled"
    }));
    state.teamData.robots = robotsResult?.ok ? (robotsResult?.robots || []).map((robot) => ({
      name: robot.name || robot.robotName || "Untitled"
    })) : [];
    renderTeamMissions();
    renderTeamRobots();
    const robotNote = robotsResult?.ok
      ? `${state.teamData.robots.length} robots`
      : `robot sync unavailable: ${getCloudErrorMessage(robotsResult, "Could not load robots.")}`;
    setTeamStatus(`Loaded ${state.teamData.missions.length} missions and ${robotNote}.`);
    return true;
  } catch (error) {
    state.teamData.missions = [];
    state.teamData.robots = [];
    renderTeamMissions();
    renderTeamRobots();
    setTeamStatus(`Could not load team data: ${error.message}`);
    return false;
  }
}

async function loadTeamMission() {
  const missionName = dom.teamMissionSelect.value;
  if (!missionName) return;

  try {
    const data = await cloud.getMission(state.teamSession, missionName);
    if (!data?.ok || !data?.mission) {
      throw new Error(getCloudErrorMessage(data, "Mission not found."));
    }
    commitMission(data.mission);
    setTeamStatus(`Loaded mission "${missionName}".`);
  } catch (error) {
    setTeamStatus(`Could not load mission: ${error.message}`);
  }
}

async function saveTeamMission() {
  const missionName = state.mission.name.trim();
  if (!missionName) {
    setTeamStatus("Mission name is required.");
    return;
  }

  try {
    const result = await cloud.saveMission(state.teamSession, state.mission);
    if (!result?.ok) {
      throw new Error(getCloudErrorMessage(result, "Save failed."));
    }
    await refreshTeamData();
    dom.teamMissionSelect.value = missionName;
    setTeamStatus(`Saved mission "${missionName}".`);
  } catch (error) {
    setTeamStatus(`Could not save mission: ${error.message}`);
  }
}

async function deleteTeamMission() {
  const missionName = dom.teamMissionSelect.value;
  if (!missionName) return;
  if (!confirm(`Delete mission "${missionName}"?`)) return;

  try {
    const result = await cloud.deleteMission(state.teamSession, missionName);
    if (!result?.ok) {
      throw new Error(getCloudErrorMessage(result, "Delete failed."));
    }
    await refreshTeamData();
    setTeamStatus(`Deleted mission "${missionName}".`);
  } catch (error) {
    setTeamStatus(`Could not delete mission: ${error.message}`);
  }
}

async function loadTeamRobot() {
  const robotName = dom.teamRobotSelect.value;
  if (!robotName) return;

  try {
    const data = await cloud.getRobot(state.teamSession, robotName);
    if (!data?.ok || !data?.robot) {
      throw new Error(getCloudErrorMessage(data, "Robot not found."));
    }
    applyRobotProfile(data.robot);
    setTeamStatus(`Loaded robot "${robotName}".`);
  } catch (error) {
    setTeamStatus(`Could not load robot: ${error.message}`);
  }
}

async function saveTeamRobot() {
  const robot = createRobotFromMission();
  if (!robot.name.trim()) {
    setTeamStatus("Robot name is required.");
    return;
  }

  try {
    const result = await cloud.saveRobot(state.teamSession, robot);
    if (!result?.ok) {
      throw new Error(getCloudErrorMessage(result, "Save failed."));
    }
    await refreshTeamData();
    dom.teamRobotSelect.value = robot.name;
    setTeamStatus(`Saved robot "${robot.name}".`);
  } catch (error) {
    setTeamStatus(`Could not save robot: ${error.message}`);
  }
}

async function deleteTeamRobot() {
  const robotName = dom.teamRobotSelect.value;
  if (!robotName) return;
  if (!confirm(`Delete robot "${robotName}"?`)) return;

  try {
    const result = await cloud.deleteRobot(state.teamSession, robotName);
    if (!result?.ok) {
      throw new Error(getCloudErrorMessage(result, "Delete failed."));
    }
    await refreshTeamData();
    setTeamStatus(`Deleted robot "${robotName}".`);
  } catch (error) {
    setTeamStatus(`Could not delete robot: ${error.message}`);
  }
}

function hydrateInitialState() {
  state.localRobots = loadRobotLibrary(window.localStorage);
  state.teamSession = {
    ...state.teamSession,
    ...loadTeamSession(window.localStorage)
  };

  dom.teamName.value = state.teamSession.name || "public";
  dom.teamPin.value = state.teamSession.pin || "";

  const missionFromUrl = readMissionFromQuery(window.location.search);
  state.mission = missionFromUrl || loadMissionDraft(window.localStorage);
  applyTransferredRobotIfPresent();
}

function attachEventHandlers() {
  [
    dom.missionName,
    dom.traceColor,
    dom.startX,
    dom.startY,
    dom.startAngle,
    dom.robotWidth,
    dom.robotLength,
    dom.robotOffset,
    dom.robotName
  ].forEach((input) => input.addEventListener("input", updateMissionFromInputs));

  dom.loadDemo.addEventListener("click", () => {
    commitMission(createDefaultMission());
  });

  dom.resetMission.addEventListener("click", () => {
    commitMission(createBlankMission());
  });

  dom.addMove.addEventListener("click", () => {
    commitMission({
      ...state.mission,
      actions: [...state.mission.actions, createAction("move")]
    });
  });

  dom.addRotate.addEventListener("click", () => {
    commitMission({
      ...state.mission,
      actions: [...state.mission.actions, createAction("rotate")]
    });
  });

  dom.addPause.addEventListener("click", () => {
    commitMission({
      ...state.mission,
      actions: [...state.mission.actions, createAction("pause")]
    });
  });

  dom.insertActionTop.addEventListener("click", () => {
    insertActionAt(0, "pause");
  });

  dom.addAttachment.addEventListener("click", () => {
    commitMission({
      ...state.mission,
      attachments: [
        ...state.mission.attachments,
        { side: "front", widthCm: 4, lengthCm: 4, positionCm: 0 }
      ]
    });
  });

  dom.applyJson.addEventListener("click", () => {
    setJsonError("");
    try {
      commitMission(JSON.parse(dom.missionJson.value));
    } catch (error) {
      setJsonError(`Invalid JSON: ${error.message}`);
    }
  });

  dom.copyLink.addEventListener("click", () => {
    const link = buildMissionShareLink(state.mission, window.location);
    navigator.clipboard.writeText(link).then(
      () => alert("Share link copied."),
      () => alert(`Copy this link:\n${link}`)
    );
  });

  dom.emailLink.addEventListener("click", () => {
    const link = buildMissionShareLink(state.mission, window.location);
    const subject = `FLL Mission: ${state.mission.name || "Untitled"}`;
    const body = [
      "Here is the mission link:",
      "",
      link,
      "",
      "If it does not open, copy the link into your browser."
    ].join("\n");
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  dom.saveRobotLocal.addEventListener("click", saveLocalRobot);
  dom.applyLocalRobot.addEventListener("click", applySelectedLocalRobot);

  dom.startMission.addEventListener("click", startMissionRun);
  dom.stopMission.addEventListener("click", stopMissionRun);
  dom.clearField.addEventListener("click", () => {
    stopMissionRun();
    stopReplay();
    renderMission();
  });

  dom.buildReplay.addEventListener("click", buildReplay);
  dom.playReplay.addEventListener("click", playReplay);
  dom.pauseReplay.addEventListener("click", () => {
    stopReplay();
    updateReplayControls();
  });
  dom.resetReplay.addEventListener("click", resetReplay);
  dom.replaySlider.addEventListener("input", () => {
    stopMissionRun();
    stopReplay();
    renderReplayFrame(parseInt(dom.replaySlider.value, 10) || 0);
    updateReplayControls();
  });

  dom.connectTeam.addEventListener("click", connectTeam);
  dom.refreshTeam.addEventListener("click", refreshTeamData);
  dom.loadTeamMission.addEventListener("click", loadTeamMission);
  dom.saveTeamMission.addEventListener("click", saveTeamMission);
  dom.deleteTeamMission.addEventListener("click", deleteTeamMission);
  dom.loadTeamRobot.addEventListener("click", loadTeamRobot);
  dom.saveTeamRobot.addEventListener("click", saveTeamRobot);
  dom.deleteTeamRobot.addEventListener("click", deleteTeamRobot);

  window.addEventListener("pageshow", () => {
    if (applyTransferredRobotIfPresent()) {
      renderLocalRobots();
    }
  });
}

async function init() {
  updateRuntimeBanner();
  hydrateInitialState();
  attachEventHandlers();
  renderLocalRobots();
  syncMissionToInputs();
  updateTeamControls();
  renderTeamMissions();
  renderTeamRobots();
  setTeamStatus(runtime.allowsCloudSync ? "Connect to load or save team missions." : runtime.detail);

  const loaded = await renderer.load();
  if (!loaded) return;

  renderMission();
  resetReplayState();

  if (state.teamSession.connected && runtime.allowsCloudSync) {
    await refreshTeamData();
  }
}

init();
