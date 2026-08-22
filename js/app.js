import { createCloudClient } from "./domain/cloud.js?v=cloud-diagnostics";
import {
  applyRobotToMission,
  buildReplayFrames,
  convertMissionGlobalZeroDirection,
  convertMissionHeadingMode,
  createBlankMission,
  createDefaultMission,
  fieldAngleToGlobalHeading,
  normalizeMission,
  normalizeRobot,
  safeNum
} from "./domain/model.js?v=no-attachments-selection";
import { detectRuntimeMode, validateTeamPin } from "./domain/runtime.js";
import { buildMissionShareLink, readMissionFromQuery } from "./domain/share.js?v=global-heading-mode";
import {
  consumeRobotTransfer,
  loadMissionDraft,
  loadRobotLibrary,
  loadTeamSession,
  saveMissionDraft,
  saveRobotLibrary,
  saveTeamSession
} from "./domain/storage.js?v=global-heading-mode";
import { FieldRenderer } from "./ui/field_renderer.js?v=muted-graphical-background";

const WIREFRAME_OPACITY_STORAGE_KEY = "fll-field-wireframe-opacity";
const GRAPHICAL_OPACITY_STORAGE_KEY = "fll-field-graphical-opacity";
const LEGACY_BACKGROUND_OPACITY_STORAGE_KEY = "fll-field-background-opacity";
const LEGACY_GRID_OPACITY_STORAGE_KEY = "fll-field-grid-opacity";
const DEFAULT_BACKGROUND_OPACITY = 30;
const PLAYBACK_SPEED_STORAGE_KEY = "fll-field-playback-speed";
const DEFAULT_PLAYBACK_SPEED = 100;
const FIELD_BACKGROUND_STORAGE_KEY = "fll-field-background";
const DEFAULT_FIELD_BACKGROUND = "wireframe";

const dom = {
  fieldHost: document.getElementById("mission-field-host"),
  missionName: document.getElementById("mission-name"),
  traceColor: document.getElementById("trace-color"),
  startX: document.getElementById("start-x"),
  startY: document.getElementById("start-y"),
  startAngle: document.getElementById("start-angle"),
  startAngleLabel: document.getElementById("start-angle-label"),
  globalMode: document.getElementById("global-mode"),
  globalZeroDirection: document.getElementById("global-zero-direction"),
  headingModeDetail: document.getElementById("heading-mode-detail"),
  playbackSpeed: document.getElementById("playback-speed"),
  playbackSpeedValue: document.getElementById("playback-speed-value"),
  wireframeOpacity: document.getElementById("wireframe-opacity"),
  wireframeOpacityValue: document.getElementById("wireframe-opacity-value"),
  wireframeOpacityControl: document.getElementById("wireframe-opacity-control"),
  graphicalOpacity: document.getElementById("graphical-opacity"),
  graphicalOpacityValue: document.getElementById("graphical-opacity-value"),
  graphicalOpacityControl: document.getElementById("graphical-opacity-control"),
  fieldBackground: document.getElementById("field-background"),
  loadDemo: document.getElementById("load-demo"),
  resetMission: document.getElementById("reset-mission"),
  robotWidth: document.getElementById("robot-width"),
  robotLength: document.getElementById("robot-length"),
  robotOffset: document.getElementById("robot-offset"),
  robotColor: document.getElementById("robot-color"),
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
  addChangeAttachment: document.getElementById("add-change-attachment"),
  defaultAttachmentSelection: document.getElementById("default-attachment-selection"),
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
  },
  display: {
    playbackSpeed: 100,
    wireframeOpacity: DEFAULT_BACKGROUND_OPACITY,
    graphicalOpacity: DEFAULT_BACKGROUND_OPACITY,
    fieldBackground: DEFAULT_FIELD_BACKGROUND
  }
};

function setupCollapsiblePanels() {
  document.querySelectorAll(".app-layout > section:first-child > .panel").forEach((panel, index) => {
    const title = panel.querySelector(":scope > .section-title");
    if (!title) return;

    const titleText = title.textContent.trim();
    const body = document.createElement("div");
    body.className = "collapsible-panel-body";
    body.id = `left-panel-body-${index + 1}`;

    Array.from(panel.children).forEach((child) => {
      if (child !== title) body.appendChild(child);
    });

    const header = document.createElement("div");
    header.className = "collapsible-panel-header";

    const toggle = document.createElement("button");
    toggle.className = "btn-ghost panel-collapse-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-controls", body.id);
    toggle.setAttribute("aria-label", `Collapse ${titleText}`);
    toggle.title = `Collapse ${titleText}`;
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>';
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      toggle.setAttribute("aria-label", `${expanded ? "Expand" : "Collapse"} ${titleText}`);
      toggle.title = `${expanded ? "Expand" : "Collapse"} ${titleText}`;
      body.hidden = expanded;
    });

    header.append(title, toggle);
    panel.append(header, body);
  });
}

function normalizeBackgroundOpacity(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.round(Math.max(0, Math.min(100, numericValue)))
    : DEFAULT_BACKGROUND_OPACITY;
}

function loadBackgroundOpacity(storageKey) {
  try {
    const savedValue = window.localStorage.getItem(storageKey)
      ?? window.localStorage.getItem(LEGACY_BACKGROUND_OPACITY_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_GRID_OPACITY_STORAGE_KEY);
    return savedValue === null ? DEFAULT_BACKGROUND_OPACITY : normalizeBackgroundOpacity(savedValue);
  } catch {
    return DEFAULT_BACKGROUND_OPACITY;
  }
}

function saveBackgroundOpacity(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    // The display preference still works for this page when storage is unavailable.
  }
}

function applyWireframeOpacity(value, { persist = false } = {}) {
  const opacity = normalizeBackgroundOpacity(value);
  state.display.wireframeOpacity = opacity;
  dom.wireframeOpacity.value = String(opacity);
  dom.wireframeOpacityValue.value = `${opacity}%`;
  dom.wireframeOpacity.setAttribute("aria-valuetext", `${opacity}% visible`);
  renderer.setWireframeOpacity(opacity / 100);
  if (persist) saveBackgroundOpacity(WIREFRAME_OPACITY_STORAGE_KEY, opacity);
}

function applyGraphicalOpacity(value, { persist = false } = {}) {
  const opacity = normalizeBackgroundOpacity(value);
  state.display.graphicalOpacity = opacity;
  dom.graphicalOpacity.value = String(opacity);
  dom.graphicalOpacityValue.value = `${opacity}%`;
  dom.graphicalOpacity.setAttribute("aria-valuetext", `${opacity}% visible`);
  renderer.setGraphicalOpacity(opacity / 100);
  if (persist) saveBackgroundOpacity(GRAPHICAL_OPACITY_STORAGE_KEY, opacity);
}

function normalizeFieldBackground(value) {
  return ["wireframe", "graphical", "overlay"].includes(value) ? value : DEFAULT_FIELD_BACKGROUND;
}

function loadFieldBackground() {
  try {
    return normalizeFieldBackground(window.localStorage.getItem(FIELD_BACKGROUND_STORAGE_KEY));
  } catch {
    return DEFAULT_FIELD_BACKGROUND;
  }
}

function applyFieldBackground(value, { persist = false } = {}) {
  const mode = normalizeFieldBackground(value);
  state.display.fieldBackground = mode;
  dom.fieldBackground.value = mode;
  renderer.setBackgroundMode(mode);

  const wireframeVisible = mode !== "graphical";
  dom.wireframeOpacityControl.hidden = !wireframeVisible;
  dom.wireframeOpacityValue.hidden = !wireframeVisible;

  const graphicalVisible = mode !== "wireframe";
  dom.graphicalOpacityControl.hidden = !graphicalVisible;
  dom.graphicalOpacityValue.hidden = !graphicalVisible;

  if (persist) {
    try {
      window.localStorage.setItem(FIELD_BACKGROUND_STORAGE_KEY, mode);
    } catch {
      // The display preference still works for this page when storage is unavailable.
    }
  }
}

function normalizePlaybackSpeed(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.round(Math.max(10, Math.min(200, numericValue)))
    : DEFAULT_PLAYBACK_SPEED;
}

function loadPlaybackSpeed() {
  try {
    const savedValue = window.localStorage.getItem(PLAYBACK_SPEED_STORAGE_KEY);
    return savedValue === null ? DEFAULT_PLAYBACK_SPEED : normalizePlaybackSpeed(savedValue);
  } catch {
    return DEFAULT_PLAYBACK_SPEED;
  }
}

function savePlaybackSpeed(value) {
  try {
    window.localStorage.setItem(PLAYBACK_SPEED_STORAGE_KEY, String(value));
  } catch {
    // The playback preference still works for this page when storage is unavailable.
  }
}

function applyPlaybackSpeed(value, { persist = false } = {}) {
  const speed = normalizePlaybackSpeed(value);
  state.display.playbackSpeed = speed;
  dom.playbackSpeed.value = String(speed);
  dom.playbackSpeedValue.value = `${speed}%`;
  dom.playbackSpeed.setAttribute("aria-valuetext", `${speed}% speed`);
  if (persist) savePlaybackSpeed(speed);
}

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
    robotColor: state.mission.robotColor,
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
    robotColor: nextMission.robotColor || nextMission.robot?.robotColor,
    robotWidthCm: nextMission.robotWidthCm,
    robotLengthCm: nextMission.robotLengthCm,
    offsetY: nextMission.offsetY,
    attachments: nextMission.attachments
  });

  return {
    ...nextMission,
    robotName: robot.name,
    robot,
    robotColor: robot.robotColor,
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

function isCompleteNumberText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === "+" || text === "." || text === "-." || text === "+.") {
    return false;
  }
  return Number.isFinite(Number(text));
}

function numberFromInput(input, fallback) {
  return isCompleteNumberText(input.value) ? safeNum(input.value, fallback) : fallback;
}

function setInputValue(input, value) {
  if (document.activeElement !== input) {
    input.value = String(value);
  }
}

function configureDecimalInput(input) {
  input.type = "text";
  input.inputMode = "decimal";
}

function syncMissionToInputs({ skipActions = false, skipAttachments = false } = {}) {
  const mission = state.mission;
  const isGlobalMode = mission.headingMode === "global";
  dom.missionName.value = mission.name;
  dom.traceColor.value = mission.traceColor;
  setInputValue(dom.startX, mission.startX);
  setInputValue(dom.startY, mission.startY);
  setInputValue(dom.startAngle, mission.startAngle);
  dom.globalMode.checked = isGlobalMode;
  dom.globalZeroDirection.value = mission.globalZeroDirection;
  dom.globalZeroDirection.disabled = !isGlobalMode;
  dom.startAngleLabel.textContent = isGlobalMode ? "Start heading (deg)" : "Start angle (deg)";
  dom.headingModeDetail.textContent = isGlobalMode
    ? `Rotate values are absolute headings with 0° ${mission.globalZeroDirection}.`
    : "Rotate values are relative turn amounts.";
  setInputValue(dom.robotWidth, mission.robotWidthCm);
  setInputValue(dom.robotLength, mission.robotLengthCm);
  setInputValue(dom.robotOffset, mission.offsetY);
  dom.robotColor.value = mission.robotColor;
  dom.robotName.value = mission.robotName || "";

  if (document.activeElement !== dom.missionJson) {
    dom.missionJson.value = JSON.stringify(mission, null, 2);
  }

  if (!skipAttachments) {
    renderAttachments();
  }
  if (!skipActions) {
    renderActions();
  }
}

function renderMission() {
  renderer.renderMission(state.mission);
}

function commitMission(
  nextMission,
  { preserveReplay = false, skipActions = false, skipAttachments = false } = {}
) {
  state.mission = normalizeMission(nextMission);
  persistMission();
  if (!preserveReplay) {
    stopMissionRun();
    resetReplayState();
  }
  syncMissionToInputs({ skipActions, skipAttachments });
  renderMission();
}

function updateMissionFromInputs() {
  commitMission(
    withMissionRobot({
      ...state.mission,
      name: dom.missionName.value.trim() || "Untitled Mission",
      traceColor: dom.traceColor.value,
      startX: numberFromInput(dom.startX, state.mission.startX),
      startY: numberFromInput(dom.startY, state.mission.startY),
      startAngle: numberFromInput(dom.startAngle, state.mission.startAngle),
      robotWidthCm: numberFromInput(dom.robotWidth, state.mission.robotWidthCm),
      robotLengthCm: numberFromInput(dom.robotLength, state.mission.robotLengthCm),
      offsetY: numberFromInput(dom.robotOffset, state.mission.offsetY),
      robotColor: dom.robotColor.value,
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
  if (type === "change-attachment") {
    return { type: "change-attachment", attachmentIndexes: "all" };
  }
  if (type === "rotate") {
    return { type: "rotate", value: state.mission.headingMode === "global" ? 0 : -90 };
  }
  if (type === "pause") return { type: "pause", value: 1 };
  return { type: "move", value: 50 };
}

function insertActionAt(index, type) {
  const actions = [...state.mission.actions];
  actions.splice(index, 0, createAction(type));
  commitMission({ ...state.mission, actions });
}

function handleRobotDrop({ headingDeg, turnDeg, distanceCm, startPose }) {
  const roundedTurn = Number(turnDeg.toFixed(1));
  const roundedDistance = Number(distanceCm.toFixed(1));
  const rotateValue = state.mission.headingMode === "global"
    ? Number(fieldAngleToGlobalHeading(headingDeg, state.mission.globalZeroDirection).toFixed(1))
    : roundedTurn;
  const angleText = state.mission.headingMode === "global"
    ? `rotate to ${rotateValue.toFixed(1)}°`
    : `turn ${roundedTurn.toFixed(1)}°`;
  const accepted = confirm(
    `${angleText}, then move ${roundedDistance.toFixed(1)} cm.\n\nAdd these steps to the mission?`
  );

  if (!accepted) {
    renderer.updateRobotTransform(startPose);
    return;
  }

  commitMission({
    ...state.mission,
    actions: [
      ...state.mission.actions,
      { type: "rotate", value: rotateValue },
      { type: "move", value: roundedDistance }
    ]
  });
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

function createLabeledNumberField({ label, input, unit = "cm" }) {
  const field = document.createElement("label");
  field.className = "compact-number-field";

  const labelText = document.createElement("span");
  labelText.className = "compact-field-label";
  labelText.textContent = label;

  const valueField = document.createElement("div");
  valueField.className = "action-value-field";

  const unitLabel = document.createElement("span");
  unitLabel.className = "action-unit";
  unitLabel.textContent = unit;

  valueField.append(input, unitLabel);
  field.append(labelText, valueField);
  return field;
}

function getAttachmentDisplayName(attachment, index) {
  if (!attachment) return "";
  return attachment.description || `Attachment ${index + 1} (${attachment.side})`;
}

function createAttachmentSelectionField(initialSelection, onSelectionChange) {
  const details = document.createElement("details");
  details.className = "attachment-selection";

  const summary = document.createElement("summary");
  const menu = document.createElement("div");
  menu.className = "attachment-selection-menu";
  details.append(summary, menu);

  let selection = initialSelection === "all"
    ? "all"
    : [...initialSelection];
  const optionInputs = [];

  const updateControl = () => {
    const selectedIndexes = selection === "all" ? [] : selection;
    summary.textContent = selection === "all"
      ? "All attachments"
      : selectedIndexes
        .map((index) => getAttachmentDisplayName(state.mission.attachments[index], index))
        .filter(Boolean)
        .join(", ") || "No attachments";
    optionInputs.forEach(({ input, attachmentIndex }) => {
      input.checked = attachmentIndex === "all"
        ? selection === "all"
        : selection !== "all" && selection.includes(attachmentIndex);
    });
  };

  const commitSelection = () => {
    onSelectionChange(selection);
    updateControl();
  };

  const addOption = (labelText, attachmentIndex) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.addEventListener("change", () => {
      if (attachmentIndex === "all") {
        selection = input.checked ? "all" : [];
      } else {
        const selectedIndexes = selection === "all" ? [] : [...selection];
        selection = input.checked
          ? [...new Set([...selectedIndexes, attachmentIndex])]
          : selectedIndexes.filter((index) => index !== attachmentIndex);
      }
      commitSelection();
    });
    label.append(input, document.createTextNode(labelText));
    menu.appendChild(label);
    optionInputs.push({ input, attachmentIndex });
  };

  addOption("All attachments", "all");
  state.mission.attachments.forEach((attachment, index) => {
    addOption(getAttachmentDisplayName(attachment, index), index);
  });
  updateControl();
  return details;
}

function reorderAction(fromIndex, toIndex, { focusHandle = false } = {}) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 ||
      fromIndex >= state.mission.actions.length || toIndex >= state.mission.actions.length) {
    return;
  }
  const actions = [...state.mission.actions];
  const [action] = actions.splice(fromIndex, 1);
  actions.splice(toIndex, 0, action);
  commitMission({ ...state.mission, actions });
  if (focusHandle) {
    requestAnimationFrame(() => {
      dom.actionList.querySelector(`[data-action-drag-index="${toIndex}"]`)?.focus();
    });
  }
}

function renderActions() {
  dom.actionList.innerHTML = "";
  dom.defaultAttachmentSelection.replaceChildren(createAttachmentSelectionField(
    state.mission.defaultAttachmentIndexes,
    (defaultAttachmentIndexes) => {
      commitMission({ ...state.mission, defaultAttachmentIndexes }, { skipActions: true });
    }
  ));
  let draggedActionIndex = null;
  let draggedRow = null;
  let dragOrderCommitted = false;

  const clearDropIndicators = () => {
    dom.actionList.querySelectorAll(".action-drop-before, .action-drop-after").forEach((item) => {
      item.classList.remove("action-drop-before", "action-drop-after");
    });
  };

  const commitDisplayedActionOrder = () => {
    if (draggedActionIndex === null || dragOrderCommitted) return;
    const actionIndexes = Array.from(dom.actionList.children).map((item) => (
      Number(item.dataset.actionIndex)
    ));
    const orderChanged = actionIndexes.some((actionIndex, index) => actionIndex !== index);
    dragOrderCommitted = true;
    clearDropIndicators();
    if (orderChanged) {
      commitMission({
        ...state.mission,
        actions: actionIndexes.map((actionIndex) => state.mission.actions[actionIndex])
      });
    }
  };

  dom.actionList.ondragover = (event) => {
    if (draggedActionIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };
  dom.actionList.ondrop = (event) => {
    if (draggedActionIndex === null) return;
    event.preventDefault();
    commitDisplayedActionOrder();
  };

  state.mission.actions.forEach((action, index) => {
    const row = document.createElement("div");
    row.className = "action-item";
    row.dataset.actionIndex = String(index);

    const dragHandle = createIconButton({
      label: `Reorder action ${index + 1}. Drag, or press Alt and an arrow key.`,
      title: "Drag to reorder",
      icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>`
    });
    dragHandle.classList.add("action-drag-handle");
    dragHandle.draggable = true;
    dragHandle.dataset.actionDragIndex = String(index);
    dragHandle.addEventListener("dragstart", (event) => {
      draggedActionIndex = index;
      draggedRow = row;
      dragOrderCommitted = false;
      row.classList.add("action-dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    });
    dragHandle.addEventListener("dragend", () => {
      commitDisplayedActionOrder();
      draggedActionIndex = null;
      draggedRow = null;
      row.classList.remove("action-dragging");
      clearDropIndicators();
    });
    dragHandle.addEventListener("keydown", (event) => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? -1 : 1;
      reorderAction(index, Math.max(0, Math.min(state.mission.actions.length - 1, index + direction)), {
        focusHandle: true
      });
    });

    row.addEventListener("dragover", (event) => {
      if (draggedActionIndex === null || !draggedRow || draggedRow === row) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      clearDropIndicators();
      const bounds = row.getBoundingClientRect();
      const dropAfter = event.clientY >= bounds.top + bounds.height / 2;
      row.classList.add(dropAfter ? "action-drop-after" : "action-drop-before");
      const referenceNode = dropAfter ? row.nextSibling : row;
      dom.actionList.insertBefore(draggedRow, referenceNode);
    });
    const typeSelect = document.createElement("select");
    typeSelect.className = "action-type-select";
    ["move", "rotate", "pause", "change-attachment"].forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type === "rotate" && state.mission.headingMode === "global"
        ? "ROTATE TO"
        : type === "change-attachment" ? "ATTACHMENTS" : type.toUpperCase();
      if (action.type === type) option.selected = true;
      typeSelect.appendChild(option);
    });
    typeSelect.addEventListener("change", () => {
      const actions = [...state.mission.actions];
      actions[index] = createAction(typeSelect.value);
      commitMission({ ...state.mission, actions });
    });

    let valueField;
    if (action.type === "change-attachment") {
      valueField = createAttachmentSelectionField(action.attachmentIndexes, (attachmentIndexes) => {
        const actions = [...state.mission.actions];
        actions[index] = { type: "change-attachment", attachmentIndexes };
        commitMission({ ...state.mission, actions }, { skipActions: true });
      });
    } else {
      const valueInput = document.createElement("input");
      configureDecimalInput(valueInput);
      valueInput.value = String(action.value);
      valueInput.addEventListener("input", () => {
        const actions = [...state.mission.actions];
        actions[index] = { ...actions[index], value: numberFromInput(valueInput, actions[index].value) };
        commitMission({ ...state.mission, actions }, { skipActions: true });
      });
      valueInput.addEventListener("blur", () => {
        renderActions();
      });

      valueField = document.createElement("div");
      valueField.className = "action-value-field";
      const unitLabel = document.createElement("span");
      unitLabel.className = "action-unit";
      unitLabel.textContent = getActionUnit(action.type);
      valueField.append(valueInput, unitLabel);
    }
    valueField.classList.add("action-value-control");

    const insertButton = createIconButton({
      label: `Insert pause after action ${index + 1}`,
      title: "Insert pause",
      icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`
    });
    insertButton.addEventListener("click", () => {
      insertActionAt(index + 1, "pause");
    });
    insertButton.classList.add("action-insert-button");

    const deleteButton = createIconButton({
      label: `Delete action ${index + 1}`,
      title: "Delete action",
      icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>`
    });
    deleteButton.addEventListener("click", () => {
      const actions = state.mission.actions.filter((_, actionIndex) => actionIndex !== index);
      commitMission({ ...state.mission, actions });
    });
    deleteButton.classList.add("action-delete-button");

    row.append(dragHandle, typeSelect, valueField, insertButton, deleteButton);
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

    const descriptionField = document.createElement("label");
    descriptionField.className = "attachment-description-field";
    const descriptionLabel = document.createElement("span");
    descriptionLabel.textContent = "Description";
    const description = document.createElement("input");
    description.type = "text";
    description.placeholder = `Attachment ${index + 1}`;
    description.value = attachment.description;
    description.addEventListener("input", () => {
      const attachmentsNext = [...state.mission.attachments];
      attachmentsNext[index] = { ...attachmentsNext[index], description: description.value };
      commitMission(withMissionRobot({ ...state.mission, attachments: attachmentsNext }), {
        skipActions: true,
        skipAttachments: true
      });
    });
    description.addEventListener("blur", () => {
      renderAttachments();
      renderActions();
    });
    descriptionField.append(descriptionLabel, description);

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
    configureDecimalInput(width);
    width.value = String(attachment.widthCm);
    width.addEventListener("input", () => {
      const attachmentsNext = [...state.mission.attachments];
      attachmentsNext[index] = {
        ...attachmentsNext[index],
        widthCm: numberFromInput(width, attachmentsNext[index].widthCm)
      };
      commitMission(withMissionRobot({ ...state.mission, attachments: attachmentsNext }), {
        skipAttachments: true
      });
    });
    width.addEventListener("blur", () => {
      renderAttachments();
    });
    const widthField = createLabeledNumberField({ label: "Width", input: width });

    const length = document.createElement("input");
    configureDecimalInput(length);
    length.value = String(attachment.lengthCm);
    length.addEventListener("input", () => {
      const attachmentsNext = [...state.mission.attachments];
      attachmentsNext[index] = {
        ...attachmentsNext[index],
        lengthCm: numberFromInput(length, attachmentsNext[index].lengthCm)
      };
      commitMission(withMissionRobot({ ...state.mission, attachments: attachmentsNext }), {
        skipAttachments: true
      });
    });
    length.addEventListener("blur", () => {
      renderAttachments();
    });
    const lengthField = createLabeledNumberField({ label: "Length", input: length });

    const position = document.createElement("input");
    configureDecimalInput(position);
    position.value = String(attachment.positionCm);
    position.addEventListener("input", () => {
      const attachmentsNext = [...state.mission.attachments];
      attachmentsNext[index] = {
        ...attachmentsNext[index],
        positionCm: numberFromInput(position, attachmentsNext[index].positionCm)
      };
      commitMission(withMissionRobot({ ...state.mission, attachments: attachmentsNext }), {
        skipAttachments: true
      });
    });
    position.addEventListener("blur", () => {
      renderAttachments();
    });
    const positionField = createLabeledNumberField({ label: "Position", input: position });

    const deleteButton = createIconButton({
      label: `Delete attachment ${index + 1}`,
      title: "Delete attachment",
      icon: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5"/></svg>`
    });
    deleteButton.addEventListener("click", () => {
      const attachmentsNext = state.mission.attachments.filter(
        (_, attachmentIndex) => attachmentIndex !== index
      );
      const actions = state.mission.actions.map((action) => {
        if (action.type !== "change-attachment" || action.attachmentIndexes === "all") {
          return action;
        }
        const attachmentIndexes = action.attachmentIndexes
          .filter((attachmentIndex) => attachmentIndex !== index)
          .map((attachmentIndex) => attachmentIndex > index ? attachmentIndex - 1 : attachmentIndex);
        return {
          ...action,
          attachmentIndexes
        };
      });
      const defaultAttachmentIndexes = state.mission.defaultAttachmentIndexes === "all"
        ? "all"
        : state.mission.defaultAttachmentIndexes
          .filter((attachmentIndex) => attachmentIndex !== index)
          .map((attachmentIndex) => attachmentIndex > index ? attachmentIndex - 1 : attachmentIndex);
      commitMission(withMissionRobot({
        ...state.mission,
        attachments: attachmentsNext,
        defaultAttachmentIndexes,
        actions
      }));
    });

    row.append(descriptionField, side, widthField, lengthField, positionField, deleteButton);
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
      startIndex + Math.floor((elapsedMs / 1000) * state.replay.fps * (state.display.playbackSpeed / 100))
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
      Math.floor(
        ((now - state.run.startTime) / 1000) * state.run.fps * (state.display.playbackSpeed / 100)
      )
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
  state.display.playbackSpeed = loadPlaybackSpeed();
  state.display.wireframeOpacity = loadBackgroundOpacity(WIREFRAME_OPACITY_STORAGE_KEY);
  state.display.graphicalOpacity = loadBackgroundOpacity(GRAPHICAL_OPACITY_STORAGE_KEY);
  state.display.fieldBackground = loadFieldBackground();
  applyTransferredRobotIfPresent();
}

function attachEventHandlers() {
  document.addEventListener("pointerdown", (event) => {
    document.querySelectorAll(".attachment-selection[open]").forEach((selection) => {
      if (!selection.contains(event.target)) selection.open = false;
    });
  });

  dom.wireframeOpacity.addEventListener("input", () => {
    applyWireframeOpacity(dom.wireframeOpacity.value, { persist: true });
  });

  dom.graphicalOpacity.addEventListener("input", () => {
    applyGraphicalOpacity(dom.graphicalOpacity.value, { persist: true });
  });

  dom.fieldBackground.addEventListener("change", () => {
    applyFieldBackground(dom.fieldBackground.value, { persist: true });
  });

  dom.playbackSpeed.addEventListener("input", () => {
    applyPlaybackSpeed(dom.playbackSpeed.value, { persist: true });
  });

  [dom.startX, dom.startY, dom.startAngle, dom.robotWidth, dom.robotLength, dom.robotOffset].forEach(
    (input) => {
      configureDecimalInput(input);
      input.addEventListener("input", updateMissionFromInputs);
      input.addEventListener("blur", () => syncMissionToInputs({ skipActions: true, skipAttachments: true }));
    }
  );

  [dom.missionName, dom.traceColor, dom.robotColor, dom.robotName].forEach((input) => {
    input.addEventListener("input", updateMissionFromInputs);
  });

  dom.loadDemo.addEventListener("click", () => {
    const accepted = confirm(
      "Load the demo mission? This will replace all current mission settings, attachments, and actions."
    );
    if (!accepted) return;
    commitMission(createDefaultMission());
  });

  dom.resetMission.addEventListener("click", () => {
    const accepted = confirm(
      "Reset this mission? This will clear all mission settings, attachments, and actions."
    );
    if (!accepted) return;
    commitMission(createBlankMission());
  });

  dom.globalMode.addEventListener("change", () => {
    const nextMode = dom.globalMode.checked ? "global" : "relative";
    commitMission(convertMissionHeadingMode(state.mission, nextMode));
  });

  dom.globalZeroDirection.addEventListener("change", () => {
    commitMission(convertMissionGlobalZeroDirection(state.mission, dom.globalZeroDirection.value));
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

  dom.addChangeAttachment.addEventListener("click", () => {
    commitMission({
      ...state.mission,
      actions: [...state.mission.actions, createAction("change-attachment")]
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
        { description: "", side: "front", widthCm: 4, lengthCm: 4, positionCm: 0 }
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
  dom.teamMissionSelect.addEventListener("change", loadTeamMission);
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
  setupCollapsiblePanels();
  attachEventHandlers();
  renderer.setRobotDragHandlers({
    onStart: () => {
      stopMissionRun();
      stopReplay();
      updateReplayControls();
    },
    onDrop: handleRobotDrop
  });
  renderLocalRobots();
  syncMissionToInputs();
  applyPlaybackSpeed(state.display.playbackSpeed);
  applyWireframeOpacity(state.display.wireframeOpacity);
  applyGraphicalOpacity(state.display.graphicalOpacity);
  applyFieldBackground(state.display.fieldBackground);
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
