import { createCloudClient } from "./domain/cloud.js?v=cloud-diagnostics";
import {
  applyRobotToMission,
  buildReplayFrames,
  convertMissionGlobalZeroDirection,
  convertMissionHeadingMode,
  createBlankMission,
  createDefaultMission,
  fieldAngleToGlobalHeading,
  missionStartHeadingDeg,
  normalizeAngle,
  normalizeMission,
  normalizeRobot,
  rotationDeltaDeg,
  safeNum,
  validateMission
} from "./domain/model.js?v=student-workflow-1";
import { detectRuntimeMode, validateTeamPin } from "./domain/runtime.js";
import { buildMissionShareLink, readMissionFromQuery } from "./domain/share.js?v=student-workflow-1";
import {
  consumeRobotTransfer,
  readArchivedMissionDraft,
  loadRobotLibrary,
  loadTeamSession,
  saveRobotLibrary,
  saveTeamSession
} from "./domain/storage.js?v=explicit-mission-save-1";
import { createMissionDocument, hasMissionChanges, missionFingerprint, missionFilename, parseMissionFile, MAX_MISSION_FILE_BYTES } from "./domain/mission_document.js?v=student-workflow-1";
import { FieldRenderer } from "./ui/field_renderer.js?v=student-workflow-1";
import { createFieldSnapshot, hasPendingFieldChanges } from "./domain/mission_preview.js";
import { createMissionHistory } from "./domain/mission_history.js";
import { createPlaybackClock } from "./domain/playback_clock.js";
import { DOCK_ORDER, FIELD_MODELS, fieldSetupKey, swapDockModel } from "./domain/field_setup.js";

const WIREFRAME_OPACITY_STORAGE_KEY = "fll-field-wireframe-opacity";
const GRAPHICAL_OPACITY_STORAGE_KEY = "fll-field-graphical-opacity";
const MISSION_MODEL_OPACITY_STORAGE_KEY = "fll-field-mission-model-opacity";
const LEGACY_BACKGROUND_OPACITY_STORAGE_KEY = "fll-field-background-opacity";
const LEGACY_GRID_OPACITY_STORAGE_KEY = "fll-field-grid-opacity";
const DEFAULT_WIREFRAME_OPACITY = 100;
const DEFAULT_GRAPHICAL_OPACITY = 66;
const DEFAULT_MISSION_MODEL_OPACITY = 100;
const PLAYBACK_SPEED_STORAGE_KEY = "fll-field-playback-speed";
const DEFAULT_PLAYBACK_SPEED = 100;
const FIELD_BACKGROUND_STORAGE_KEY = "fll-field-background";
const DEFAULT_FIELD_BACKGROUND = "overlay";

const dom = {
  undo: document.getElementById("undo-mission"),
  redo: document.getElementById("redo-mission"),
  missionValidation: document.getElementById("mission-validation"),
  playbackSteps: document.getElementById("playback-steps"),
  playbackStep: document.getElementById("playback-step"),
  fieldPreviewStatus: document.getElementById("field-preview-status"),
  missionSource: document.getElementById("mission-source"),
  missionSaveStatus: document.getElementById("mission-save-status"),
  saveActiveMission: document.getElementById("save-active-mission"),
  downloadMission: document.getElementById("download-mission"),
  importMission: document.getElementById("import-mission"),
  missionFile: document.getElementById("mission-file"),
  missionFileStatus: document.getElementById("mission-file-status"),
  archivedMissionNotice: document.getElementById("archived-mission-notice"),
  downloadArchivedMission: document.getElementById("download-archived-mission"),
  discardJson: document.getElementById("discard-json"),
  dockSelectors: [...document.querySelectorAll("[data-dock]")],
  fieldSetupSummary: document.getElementById("field-setup-summary"),
  fieldSetupNotice: document.getElementById("field-setup-notice"),
  fieldConfirmed: document.getElementById("field-confirmed"),
  fieldCheckStatus: document.getElementById("field-check-status"),
  editFieldSetup: document.getElementById("edit-field-setup"),
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
  missionModelOpacity: document.getElementById("mission-model-opacity"),
  missionModelOpacityValue: document.getElementById("mission-model-opacity-value"),
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
const history = createMissionHistory();

const state = {
  fieldConfirmed: false,
  mission: createBlankMission(),
  fieldMission: createFieldSnapshot(createBlankMission()),
  fieldRevision: 0,
  activeStep: null,
  document: createMissionDocument(createBlankMission()),
  documentId: 0,
  missionRevision: 0,
  jsonDirty: false,
  lastJsonText: "",
  archivedMission: null,
  missionRequestPending: false,
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
    wireframeOpacity: DEFAULT_WIREFRAME_OPACITY,
    graphicalOpacity: DEFAULT_GRAPHICAL_OPACITY,
    missionModelOpacity: DEFAULT_MISSION_MODEL_OPACITY,
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
    if (panel.dataset.collapsed === "true") toggle.click();
  });
}

function normalizeBackgroundOpacity(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.round(Math.max(0, Math.min(100, numericValue)))
    : fallback;
}

function loadBackgroundOpacity(storageKey, fallback) {
  try {
    const savedValue = window.localStorage.getItem(storageKey)
      ?? window.localStorage.getItem(LEGACY_BACKGROUND_OPACITY_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_GRID_OPACITY_STORAGE_KEY);
    return savedValue === null ? fallback : normalizeBackgroundOpacity(savedValue, fallback);
  } catch {
    return fallback;
  }
}

function saveBackgroundOpacity(storageKey, value) {
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    // The display preference still works for this page when storage is unavailable.
  }
}

function loadDisplayOpacity(storageKey, fallback) {
  try {
    const savedValue = window.localStorage.getItem(storageKey);
    return savedValue === null ? fallback : normalizeBackgroundOpacity(savedValue, fallback);
  } catch {
    return fallback;
  }
}

function applyWireframeOpacity(value, { persist = false } = {}) {
  const opacity = normalizeBackgroundOpacity(value, DEFAULT_WIREFRAME_OPACITY);
  state.display.wireframeOpacity = opacity;
  dom.wireframeOpacity.value = String(opacity);
  dom.wireframeOpacityValue.value = `${opacity}%`;
  dom.wireframeOpacity.setAttribute("aria-valuetext", `${opacity}% visible`);
  renderer.setWireframeOpacity(opacity / 100);
  if (persist) saveBackgroundOpacity(WIREFRAME_OPACITY_STORAGE_KEY, opacity);
}

function applyGraphicalOpacity(value, { persist = false } = {}) {
  const opacity = normalizeBackgroundOpacity(value, DEFAULT_GRAPHICAL_OPACITY);
  state.display.graphicalOpacity = opacity;
  dom.graphicalOpacity.value = String(opacity);
  dom.graphicalOpacityValue.value = `${opacity}%`;
  dom.graphicalOpacity.setAttribute("aria-valuetext", `${opacity}% visible`);
  renderer.setGraphicalOpacity(opacity / 100);
  if (persist) saveBackgroundOpacity(GRAPHICAL_OPACITY_STORAGE_KEY, opacity);
}

function applyMissionModelOpacity(value, { persist = false } = {}) {
  const opacity = normalizeBackgroundOpacity(value, DEFAULT_MISSION_MODEL_OPACITY);
  state.display.missionModelOpacity = opacity;
  dom.missionModelOpacity.value = String(opacity);
  dom.missionModelOpacityValue.value = `${opacity}%`;
  dom.missionModelOpacity.setAttribute("aria-valuetext", `${opacity}% visible`);
  renderer.setMissionModelOpacity(opacity / 100);
  if (persist) saveBackgroundOpacity(MISSION_MODEL_OPACITY_STORAGE_KEY, opacity);
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
  const now = performance.now();
  if (state.run.active) state.run.clock?.setSpeed(now, speed / 100);
  if (state.replay.playing) state.replay.clock?.setSpeed(now, speed / 100);
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
  highlightPlaybackStep(null);
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

function hasUnsavedMission() {
  return state.jsonDirty || hasMissionChanges(state.document, state.mission);
}

function syncMissionDocument() {
  const source = state.document.source;
  const labels = {
    new: "New mission", demo: "Demo mission", shared: "Shared copy",
    file: `File: ${source.name}`, cloud: `Team: ${source.team} · ${source.name}`
  };
  dom.missionSource.textContent = labels[source.kind] || "Mission";
  const dirty = hasUnsavedMission();
  dom.missionSaveStatus.dataset.dirty = String(dirty);
  dom.missionSaveStatus.textContent = state.jsonDirty ? "Unapplied JSON edits"
    : dirty ? "Unsaved changes"
      : source.kind === "cloud" ? "Saved to team"
        : source.kind === "file" ? "File copy · no unsaved changes"
          : source.kind === "shared" ? "Not saved to a team"
            : "Not saved";
  dom.discardJson.hidden = !state.jsonDirty;
  syncFieldPreviewStatus();
  dom.undo.disabled = !history.canUndo || state.jsonDirty;
  dom.redo.disabled = !history.canRedo || state.jsonDirty;
}

function syncFieldPreviewStatus() {
  const pending = hasPendingFieldChanges(state.mission, state.fieldMission);
  dom.fieldPreviewStatus.dataset.pending = String(pending || state.jsonDirty);
  dom.fieldPreviewStatus.textContent = state.jsonDirty
    ? "JSON edits are not applied. Apply or discard them, then save or Start Mission."
    : pending
      ? "Mission edits are waiting. Save or Start Mission to update the field."
      : "Field shows the last loaded, saved, or started mission.";
  syncEditorHighlight();
}

function describeAction(action, mission) {
  if (action.type === "change-attachment") {
    const selected = action.attachmentIndexes === "all" ? mission.attachments.map((_, index) => index) : action.attachmentIndexes;
    return `Attachments: ${selected.length ? selected.map(index => mission.attachments[index]?.description || `#${index + 1}`).join(", ") : "none"}`;
  }
  if (action.type === "move") return `Move ${action.value} cm`;
  if (action.type === "pause") return `Pause ${action.value} s`;
  return `Rotate${mission.headingMode === "global" ? " to" : ""} ${action.value}°${action.alternateTurn ? " (alternate turn)" : ""}`;
}

function renderPlaybackSteps() {
  dom.playbackSteps.replaceChildren(...state.fieldMission.actions.map((action, index) => {
    const item = document.createElement("li");
    item.dataset.playbackAction = String(index);
    item.textContent = describeAction(action, state.fieldMission);
    return item;
  }));
  highlightPlaybackStep(null);
}

function syncEditorHighlight() {
  const matches = !state.jsonDirty && !hasPendingFieldChanges(state.mission, state.fieldMission);
  for (const row of dom.actionList.children) {
    const active = matches && Number(row.dataset.actionIndex) === state.activeStep;
    row.classList.toggle("is-current-step", active);
    if (active) row.setAttribute("aria-current", "step");
    else row.removeAttribute("aria-current");
  }
}

function highlightPlaybackStep(index) {
  state.activeStep = Number.isInteger(index) ? index : null;
  for (const item of dom.playbackSteps.children) {
    const active = Number(item.dataset.playbackAction) === state.activeStep;
    item.classList.toggle("is-current-step", active);
    if (active) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  }
  const action = state.fieldMission.actions[state.activeStep];
  dom.playbackStep.textContent = action
    ? `Step ${state.activeStep + 1} of ${state.fieldMission.actions.length}: ${describeAction(action, state.fieldMission)}`
    : "At start · No step running";
  syncEditorHighlight();
}

function applyMissionToField(mission, { showStart = false } = {}) {
  const validated = validateMission(mission);
  stopMissionRun();
  resetReplayState();
  state.fieldMission = createFieldSnapshot(validated, state.mission.fieldSetup);
  state.fieldRevision += 1;
  if (showStart) renderer.renderStartPosition(state.fieldMission);
  else renderer.renderMission(state.fieldMission);
  renderPlaybackSteps();
  syncFieldPreviewStatus();
}

function setMissionFileStatus(message) {
  dom.missionFileStatus.textContent = message;
  dom.missionFileStatus.hidden = !message;
}

function confirmMissionReplacement(action) {
  return !hasUnsavedMission() || confirm(`${action}? Unsaved mission changes will be discarded. Save to your team or download first to keep them.`);
}

function clearSharedMissionUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("mission")) return;
  url.searchParams.delete("mission");
  window.history.replaceState(window.history.state, "", url);
}

function replaceMission(mission, source) {
  mission = validateMission(mission);
  state.documentId += 1;
  state.document = createMissionDocument(mission, source);
  state.jsonDirty = false;
  state.fieldConfirmed = false;
  clearSharedMissionUrl();
  history.clear();
  commitMission(mission, { recordHistory: false });
  applyMissionToField(state.mission);
  setMissionFileStatus("");
}

function requireAppliedJson() {
  if (!state.jsonDirty) return true;
  setMissionFileStatus("Apply or discard your JSON edits before saving, sharing, or starting the mission.");
  return false;
}

function downloadMissionFile(mission, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(mission, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadCurrentMission() {
  if (!requireAppliedJson()) return;
  try {
    const filename = missionFilename(state.mission.name);
    downloadMissionFile(state.mission, filename);
    state.document = createMissionDocument(state.mission, { kind: "file", name: filename });
    applyMissionToField(state.mission);
    clearSharedMissionUrl();
    syncMissionDocument();
    setMissionFileStatus(`Download requested: ${filename}. Keep the file; there is no browser backup.`);
  } catch (error) {
    setMissionFileStatus(`Could not download mission: ${error.message}`);
  }
}

async function importMissionFile() {
  const file = dom.missionFile.files?.[0];
  dom.missionFile.value = "";
  if (!file) return;
  const revision = state.missionRevision;
  const documentId = state.documentId;
  try {
    if (file.size > MAX_MISSION_FILE_BYTES) throw new Error("Mission files must be smaller than 96 KB.");
    const mission = parseMissionFile(await file.text());
    if (revision !== state.missionRevision || documentId !== state.documentId) {
      setMissionFileStatus("The mission changed while reading the file. Import it again when ready.");
      return;
    }
    if (!confirmMissionReplacement(`Import ${file.name}`)) return;
    replaceMission(mission, { kind: "file", name: file.name });
    setMissionFileStatus(`Imported ${file.name}. Future edits are not saved automatically.`);
  } catch (error) {
    setMissionFileStatus(`Could not import mission: ${error.message}`);
  }
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
  renderer.renderFrameSequence(state.fieldMission, state.replay.frames, safeIndex);
  const step = state.replay.frames[safeIndex].actionIndex ?? null;
  if (step !== state.activeStep) highlightPlaybackStep(step);
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

function syncFieldSetup() {
  const setup = state.mission.fieldSetup;
  dom.dockSelectors.forEach(select => { select.value = setup[select.dataset.dock]; });
  dom.fieldSetupSummary.replaceChildren(...dom.dockSelectors.map((select, index) => {
    const dock = select.dataset.dock;
    const item = document.createElement("span");
    const model = document.createElement("strong");
    model.textContent = FIELD_MODELS[setup[dock]].name;
    item.append(`${index + 1} ${dock[0].toUpperCase() + dock.slice(1)}: `, model);
    return item;
  }));
  dom.fieldConfirmed.checked = state.fieldConfirmed;
  dom.fieldCheckStatus.textContent = state.fieldConfirmed ? "• Field confirmed" : "• Check physical field";
  dom.fieldCheckStatus.dataset.confirmed = String(state.fieldConfirmed);
}

function syncMissionToInputs({
  skipActions = false,
  skipAttachments = false,
  skipMissionName = false,
  skipRobotName = false
} = {}) {
  const mission = state.mission;
  syncFieldSetup();
  const isGlobalMode = mission.headingMode === "global";
  if (!skipMissionName) dom.missionName.value = mission.name;
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
  if (!skipRobotName) dom.robotName.value = mission.robotName || "";

  if (!state.jsonDirty && document.activeElement !== dom.missionJson) {
    dom.missionJson.value = JSON.stringify(mission, null, 2);
    state.lastJsonText = dom.missionJson.value;
  }

  syncMissionDocument();

  if (!skipAttachments) {
    renderAttachments();
  }
  if (!skipActions) {
    renderActions();
  } else syncActionDirections();
}

function renderMission() {
  renderer.renderMission(state.fieldMission);
}

function commitMission(
  nextMission,
  {
    skipActions = false,
    skipAttachments = false,
    skipMissionName = false,
    skipRobotName = false,
    recordHistory = true
  } = {}
) {
  let normalized;
  try {
    normalized = validateMission(nextMission);
  } catch (error) {
    dom.missionValidation.hidden = false;
    dom.missionValidation.textContent = `Change not applied: ${error.message} Your previous mission was kept.`;
    // Restore only the edited field, without destroying neighboring controls.
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.setAttribute("aria-invalid", "true");
    return false;
  }
  dom.missionValidation.hidden = true;
  document.querySelectorAll('[aria-invalid="true"]').forEach(input => input.removeAttribute("aria-invalid"));
  if (fieldSetupKey(state.mission.fieldSetup) !== fieldSetupKey(nextMission?.fieldSetup)) {
    state.fieldConfirmed = false;
    dom.fieldSetupNotice.textContent = "Layout changed. Check your physical field before practicing.";
  }
  if (missionFingerprint(state.mission) !== missionFingerprint(normalized)) {
    if (recordHistory) history.record(state.mission, normalized,
      document.activeElement?.matches('input:not([type="checkbox"]), textarea') ? document.activeElement : null);
    state.missionRevision += 1;
    clearSharedMissionUrl();
  }
  state.mission = normalized;
  // Dock setup is immediate, but never rebuild the displayed route from edits.
  state.fieldMission.fieldSetup = { ...normalized.fieldSetup };
  renderer.setFieldSetup(state.fieldMission.fieldSetup);
  syncMissionToInputs({ skipActions, skipAttachments, skipMissionName, skipRobotName });
  return true;
}

function restoreHistory(direction) {
  if (!requireAppliedJson()) return;
  const mission = history[direction](state.mission);
  if (mission) commitMission(mission, { recordHistory: false });
}

function updateMissionFromInputs() {
  commitMission(
    withMissionRobot({
      ...state.mission,
      name: state.mission.name,
      traceColor: dom.traceColor.value,
      startX: numberFromInput(dom.startX, state.mission.startX),
      startY: numberFromInput(dom.startY, state.mission.startY),
      startAngle: numberFromInput(dom.startAngle, state.mission.startAngle),
      robotWidthCm: numberFromInput(dom.robotWidth, state.mission.robotWidthCm),
      robotLengthCm: numberFromInput(dom.robotLength, state.mission.robotLengthCm),
      offsetY: numberFromInput(dom.robotOffset, state.mission.offsetY),
      robotColor: dom.robotColor.value,
      robotName: state.mission.robotName
    })
  );
}

function updateMissionNameFromInput({ finalize = false } = {}) {
  const name = dom.missionName.value.trim();
  if (!name && !finalize) return;
  commitMission(
    { ...state.mission, name: name || "Untitled Mission" },
    { skipMissionName: !finalize }
  );
}

function updateRobotNameFromInput({ finalize = false } = {}) {
  const robotName = dom.robotName.value.trim();
  if (!robotName && !finalize) return;
  commitMission(
    withMissionRobot({
      ...state.mission,
      robotName: robotName || "Mission Robot"
    }),
    { skipRobotName: !finalize }
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
  renderer.updateRobotTransform(startPose);
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

  let actionHeadingDeg = missionStartHeadingDeg(state.mission);

  state.mission.actions.forEach((action, index) => {
    const incomingHeadingDeg = actionHeadingDeg;
    const actionRotationDeltaDeg = action.type === "rotate"
      ? rotationDeltaDeg(
        incomingHeadingDeg,
        action.value,
        state.mission.headingMode,
        state.mission.globalZeroDirection,
        action.alternateTurn
      )
      : 0;
    if (action.type === "rotate") {
      actionHeadingDeg = normalizeAngle(incomingHeadingDeg + actionRotationDeltaDeg);
    }

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
    let directionButton = null;
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
        valueInput.value = String(state.mission.actions[index]?.value ?? 0);
        valueInput.removeAttribute("aria-invalid");
      });

      valueField = document.createElement("div");
      valueField.className = "action-value-field";
      const unitLabel = document.createElement("span");
      unitLabel.className = "action-unit";
      unitLabel.textContent = getActionUnit(action.type);
      valueField.append(valueInput, unitLabel);

      if (action.type === "rotate" && state.mission.headingMode === "global") {
        const usesAlternateTurn = action.alternateTurn === true;
        const isClockwise = actionRotationDeltaDeg <= 0;
        const directionName = isClockwise ? "clockwise" : "counterclockwise";
        const oppositeDirectionName = isClockwise ? "counterclockwise" : "clockwise";
        directionButton = document.createElement("button");
        directionButton.className = "btn-ghost icon-button action-turn-direction";
        directionButton.type = "button";
        directionButton.dataset.alternate = String(usesAlternateTurn);
        directionButton.textContent = isClockwise ? "↻" : "↺";

        const turnAmount = Math.abs(actionRotationDeltaDeg);
        const currentPathDescription = turnAmount === 0
          ? "Shortest path: no turn"
          : `${usesAlternateTurn ? "Alternate" : "Shortest"} path: ${directionName} ${turnAmount.toFixed(1)}°`;
        const nextPathDescription = usesAlternateTurn
          ? "Use the shortest path"
          : `Use the ${oppositeDirectionName} path`;
        directionButton.setAttribute(
          "aria-label",
          `${currentPathDescription}. ${nextPathDescription}.`
        );
        directionButton.title = `${currentPathDescription}. Click to ${nextPathDescription.toLowerCase()}.`;
        directionButton.addEventListener("click", () => {
          const actions = [...state.mission.actions];
          const currentAction = actions[index];
          if (currentAction.alternateTurn === true) {
            const { alternateTurn: _alternateTurn, ...shortestAction } = currentAction;
            actions[index] = shortestAction;
          } else {
            actions[index] = { ...currentAction, alternateTurn: true };
          }
          commitMission({ ...state.mission, actions });
        });
        row.classList.add("has-turn-direction");
      }
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

    row.append(
      dragHandle,
      typeSelect,
      valueField,
      ...(directionButton ? [directionButton] : []),
      insertButton,
      deleteButton
    );
    dom.actionList.appendChild(row);
  });
  syncEditorHighlight();
}

function syncActionDirections() {
  let heading = missionStartHeadingDeg(state.mission);
  state.mission.actions.forEach((action, index) => {
    if (action.type !== "rotate") return;
    const delta = rotationDeltaDeg(heading, action.value, state.mission.headingMode, state.mission.globalZeroDirection, action.alternateTurn);
    heading = normalizeAngle(heading + delta);
    const button = dom.actionList.querySelector(`[data-action-index="${index}"] .action-turn-direction`);
    if (!button) return;
    const clockwise = delta <= 0;
    const current = Math.abs(delta) === 0 ? "Shortest path: no turn"
      : `${action.alternateTurn ? "Alternate" : "Shortest"} path: ${clockwise ? "clockwise" : "counterclockwise"} ${Math.abs(delta).toFixed(1)}°`;
    const next = action.alternateTurn ? "Use the shortest path" : `Use the ${clockwise ? "counterclockwise" : "clockwise"} path`;
    button.textContent = clockwise ? "↻" : "↺";
    button.dataset.alternate = String(action.alternateTurn === true);
    button.setAttribute("aria-label", `${current}. ${next}.`);
    button.title = `${current}. Click to ${next.toLowerCase()}.`;
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
      description.value = state.mission.attachments[index]?.description || "";
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
      width.value = String(state.mission.attachments[index]?.widthCm ?? 0);
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
      length.value = String(state.mission.attachments[index]?.lengthCm ?? 0);
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
      position.value = String(state.mission.attachments[index]?.positionCm ?? 0);
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
  setReplayFrames(buildReplayFrames(state.fieldMission, { fps: state.replay.fps }));
  if (!state.replay.frames.length) {
    return;
  }
  renderReplayFrame(0);
}

function playReplay() {
  if (!state.replay.frames.length || state.replay.playing) return;
  stopMissionRun();
  state.replay.playing = true;
  state.replay.clock = createPlaybackClock(performance.now(), state.replay.index / state.replay.fps, state.display.playbackSpeed / 100);

  const step = (now) => {
    if (!state.replay.playing) return;
    const index = Math.min(
      state.replay.frames.length - 1,
      Math.floor(state.replay.clock.read(now) * state.replay.fps)
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
  stopMissionRun();
  stopReplay();
  if (!state.replay.frames.length) return;
  renderReplayFrame(0);
  updateReplayControls();
}

function startMissionRun() {
  if (!requireAppliedJson()) return;
  applyMissionToField(state.mission, { showStart: true });
  state.run.frames = buildReplayFrames(state.fieldMission, { fps: state.run.fps });
  if (!state.run.frames.length) return;
  setReplayFrames(state.run.frames);
  renderReplayFrame(0);
  state.run.active = true;
  state.run.clock = createPlaybackClock(performance.now(), 0, state.display.playbackSpeed / 100);
  dom.stopMission.disabled = false;

  const step = (now) => {
    if (!state.run.active) return;
    const index = Math.min(
      state.run.frames.length - 1,
      Math.floor(
        state.run.clock.read(now) * state.run.fps
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
  dom.saveActiveMission.disabled = !enabled || state.missionRequestPending;
  dom.loadTeamMission.disabled ||= state.missionRequestPending;
  dom.saveTeamMission.disabled ||= state.missionRequestPending;
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
  if (!missionName || state.missionRequestPending) return;
  if (!confirmMissionReplacement(`Load "${missionName}"`)) return;
  const session = { ...state.teamSession };
  const revision = state.missionRevision;
  const documentId = state.documentId;
  const jsonText = dom.missionJson.value;
  state.missionRequestPending = true;
  updateTeamControls();

  try {
    const data = await cloud.getMission(session, missionName);
    if (!data?.ok || !data?.mission) {
      throw new Error(getCloudErrorMessage(data, "Mission not found."));
    }
    if (revision !== state.missionRevision || documentId !== state.documentId || jsonText !== dom.missionJson.value || session.name !== state.teamSession.name) {
      setTeamStatus("The mission or team changed while loading. Load again when ready; your work was kept.");
      return;
    }
    replaceMission(data.mission, { kind: "cloud", team: session.name, name: missionName });
    setTeamStatus(`Loaded mission "${missionName}".`);
  } catch (error) {
    setTeamStatus(`Could not load mission: ${error.message}`);
  } finally {
    state.missionRequestPending = false;
    updateTeamControls();
  }
}

async function saveTeamMission() {
  if (state.missionRequestPending || !requireAppliedJson()) return;
  const missionName = state.mission.name.trim();
  if (!missionName) {
    setTeamStatus("Mission name is required.");
    return;
  }

  const session = { ...state.teamSession };
  const snapshot = normalizeMission(state.mission);
  const documentId = state.documentId;
  const fieldRevision = state.fieldRevision;
  const source = state.document.source;
  const sameCloudMission = source.kind === "cloud" && source.team === session.name && source.name === missionName;
  if (!sameCloudMission && state.teamData.missions.some(mission => mission.name === missionName)
      && !confirm(`Replace the saved team mission "${missionName}" with this copy? Change the mission name first to save a separate copy.`)) return;
  state.missionRequestPending = true;
  updateTeamControls();
  try {
    const result = await cloud.saveMission(session, snapshot);
    if (!result?.ok) {
      throw new Error(getCloudErrorMessage(result, "Save failed."));
    }
    if (documentId === state.documentId) {
      // A slower save only checkpoints the snapshot sent, never newer edits.
      state.document = createMissionDocument(snapshot, { kind: "cloud", team: session.name, name: missionName });
      // Do not rewind a newer Start/Download while an older cloud save finishes.
      if (fieldRevision === state.fieldRevision) applyMissionToField(snapshot);
      clearSharedMissionUrl();
      syncMissionDocument();
    }
    if (session.name === state.teamSession.name) {
      await refreshTeamData();
      dom.teamMissionSelect.value = missionName;
      setTeamStatus(`Saved mission "${missionName}". Any newer edits remain unsaved.`);
    }
  } catch (error) {
    setTeamStatus(`Could not save mission: ${error.message}`);
  } finally {
    state.missionRequestPending = false;
    updateTeamControls();
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
    const source = state.document.source;
    if (source.kind === "cloud" && source.team === state.teamSession.name && source.name === missionName) {
      state.document = { source: { kind: "new" }, checkpoint: null };
      syncMissionDocument();
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
  state.mission = missionFromUrl || createBlankMission();
  state.fieldMission = createFieldSnapshot(state.mission);
  state.document = createMissionDocument(state.mission, { kind: missionFromUrl ? "shared" : "new" });
  state.archivedMission = readArchivedMissionDraft(window.localStorage);
  dom.archivedMissionNotice.hidden = !state.archivedMission;
  if (!missionFromUrl && new URLSearchParams(window.location.search).has("mission")) {
    setMissionFileStatus("The shared mission could not be read. A new mission was opened instead.");
    clearSharedMissionUrl();
  }
  state.display.playbackSpeed = loadPlaybackSpeed();
  state.display.wireframeOpacity = loadBackgroundOpacity(
    WIREFRAME_OPACITY_STORAGE_KEY,
    DEFAULT_WIREFRAME_OPACITY
  );
  state.display.graphicalOpacity = loadBackgroundOpacity(
    GRAPHICAL_OPACITY_STORAGE_KEY,
    DEFAULT_GRAPHICAL_OPACITY
  );
  state.display.missionModelOpacity = loadDisplayOpacity(
    MISSION_MODEL_OPACITY_STORAGE_KEY,
    DEFAULT_MISSION_MODEL_OPACITY
  );
  state.display.fieldBackground = loadFieldBackground();
  applyTransferredRobotIfPresent();
}

function attachEventHandlers() {
  dom.undo.addEventListener("click", () => restoreHistory("undo"));
  dom.redo.addEventListener("click", () => restoreHistory("redo"));
  document.addEventListener("focusout", () => history.endGroup());
  document.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") return;
    event.preventDefault();
    restoreHistory(key === "y" || event.shiftKey ? "redo" : "undo");
  });
  dom.downloadMission.addEventListener("click", downloadCurrentMission);
  dom.importMission.addEventListener("click", () => dom.missionFile.click());
  dom.missionFile.addEventListener("change", importMissionFile);
  dom.saveActiveMission.addEventListener("click", saveTeamMission);
  dom.downloadArchivedMission.addEventListener("click", () => {
    if (!state.archivedMission) return;
    downloadMissionFile(state.archivedMission, missionFilename(`${state.archivedMission.name}-old-draft`));
    setMissionFileStatus("Old draft download requested. The current mission and old browser data were not changed.");
  });
  dom.missionJson.addEventListener("input", () => {
    state.jsonDirty = dom.missionJson.value !== state.lastJsonText;
    syncMissionDocument();
  });
  dom.discardJson.addEventListener("click", () => {
    if (!confirm("Discard the unapplied JSON edits? The current field plan will be kept.")) return;
    state.jsonDirty = false;
    syncMissionToInputs({ skipActions: true, skipAttachments: true });
    setJsonError("");
    setMissionFileStatus("");
  });
  window.addEventListener("beforeunload", event => {
    if (!hasUnsavedMission()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  for (const select of dom.dockSelectors) {
    for (const [id, model] of Object.entries(FIELD_MODELS)) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${model.number} · ${model.name}`;
      option.title = model.label;
      select.append(option);
    }
    select.addEventListener("change", () => {
      const dock = select.dataset.dock;
      const model = select.value;
      const other = DOCK_ORDER.find(key => state.mission.fieldSetup[key] === model);
      if (other === dock) return;
      commitMission({ ...state.mission, fieldSetup: swapDockModel(state.mission.fieldSetup, dock, model) });
      const dockName = key => key[0].toUpperCase() + key.slice(1);
      dom.fieldSetupNotice.textContent = `${dockName(dock)} and ${dockName(other)} models swapped. Check your physical field.`;
    });
  }
  dom.fieldConfirmed.addEventListener("change", () => {
    state.fieldConfirmed = dom.fieldConfirmed.checked;
    syncFieldSetup();
  });
  dom.editFieldSetup.addEventListener("click", () => {
    const panel = document.getElementById("field-setup-panel");
    const toggle = panel.querySelector(".panel-collapse-toggle");
    if (toggle.getAttribute("aria-expanded") === "false") toggle.click();
    panel.scrollIntoView({ behavior: "smooth", block: "center" });
    dom.dockSelectors[0].focus({ preventScroll: true });
  });
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

  dom.missionModelOpacity.addEventListener("input", () => {
    applyMissionModelOpacity(dom.missionModelOpacity.value, { persist: true });
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

  [dom.traceColor, dom.robotColor].forEach((input) => {
    input.addEventListener("input", updateMissionFromInputs);
  });

  dom.missionName.addEventListener("input", () => updateMissionNameFromInput());
  dom.missionName.addEventListener("blur", () => updateMissionNameFromInput({ finalize: true }));
  dom.robotName.addEventListener("input", () => updateRobotNameFromInput());
  dom.robotName.addEventListener("blur", () => updateRobotNameFromInput({ finalize: true }));

  dom.loadDemo.addEventListener("click", () => {
    const accepted = confirm(
      "Load the demo mission? This will replace all current mission settings, attachments, and actions."
    );
    if (!accepted) return;
    replaceMission(createDefaultMission(), { kind: "demo" });
  });

  dom.resetMission.addEventListener("click", () => {
    const accepted = confirm(
      "Start a new blank mission? This clears this editor and its undo history, including settings, attachments, and steps. Save or download first to keep your work."
    );
    if (!accepted) return;
    replaceMission(createBlankMission(), { kind: "new" });
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
      const mission = parseMissionFile(dom.missionJson.value);
      state.jsonDirty = false;
      commitMission(mission);
      setMissionFileStatus("");
    } catch (error) {
      setJsonError(`Invalid JSON: ${error.message}`);
    }
  });

  dom.copyLink.addEventListener("click", () => {
    if (!requireAppliedJson()) return;
    const link = buildMissionShareLink(state.mission, window.location);
    navigator.clipboard.writeText(link).then(
      () => alert("Share link copied."),
      () => alert(`Copy this link:\n${link}`)
    );
  });

  dom.emailLink.addEventListener("click", () => {
    if (!requireAppliedJson()) return;
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
    resetReplayState();
    renderer.renderStartPosition(state.fieldMission);
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
  setupCollapsiblePanels();
  attachEventHandlers();
  renderer.setRobotDragHandlers({
    onStart: () => {
      if (state.jsonDirty || hasPendingFieldChanges(state.mission, state.fieldMission)) {
        setMissionFileStatus("Save or Start Mission before adding more moves by dragging the robot.");
        return false;
      }
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
  applyMissionModelOpacity(state.display.missionModelOpacity);
  applyFieldBackground(state.display.fieldBackground);
  updateTeamControls();
  renderTeamMissions();
  renderTeamRobots();
  setTeamStatus(runtime.allowsCloudSync ? "Connect to load or save team missions." : runtime.detail);

  const loaded = await renderer.load();
  if (!loaded) return;

  renderMission();
  renderPlaybackSteps();
  resetReplayState();

  if (state.teamSession.connected && runtime.allowsCloudSync) {
    await refreshTeamData();
  }
}

init();
