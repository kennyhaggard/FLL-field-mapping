import { createCloudClient } from "./domain/cloud.js?v=cloud-diagnostics";
import {
  createDefaultRobot,
  normalizeRobot,
  safeNum
} from "./domain/model.js";
import { detectRuntimeMode } from "./domain/runtime.js";
import {
  loadRobotLibrary,
  loadTeamSession,
  saveRobotLibrary,
  stageRobotTransfer
} from "./domain/storage.js";
import { RobotCanvas } from "./ui/robot_canvas.js?v=front-indicator";

const dom = {
  robotName: document.getElementById("robot-name"),
  robotOffset: document.getElementById("robot-offset"),
  robotWidth: document.getElementById("robot-width"),
  robotLength: document.getElementById("robot-length"),
  addAttachment: document.getElementById("add-attachment"),
  attachmentList: document.getElementById("attachment-list"),
  copyRobot: document.getElementById("copy-robot"),
  saveLocal: document.getElementById("save-local"),
  applyToMission: document.getElementById("apply-to-mission"),
  saveTeam: document.getElementById("save-team"),
  runtimeNote: document.getElementById("builder-runtime-note"),
  robotStatus: document.getElementById("robot-status"),
  canvas: document.getElementById("robot-canvas")
};

const runtime = detectRuntimeMode(window.location);
const cloud = createCloudClient({ runtime });
const canvas = new RobotCanvas(dom.canvas);

const state = {
  robot: createDefaultRobot(),
  draggingIndex: null,
  teamSession: loadTeamSession(window.localStorage)
};

function setStatus(message) {
  dom.robotStatus.textContent = message;
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

function syncRobotToInputs() {
  dom.robotName.value = state.robot.name || "";
  setInputValue(dom.robotOffset, state.robot.offsetY);
  setInputValue(dom.robotWidth, state.robot.robotWidthCm);
  setInputValue(dom.robotLength, state.robot.robotLengthCm);
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

function commitRobot(nextRobot, { skipAttachments = false } = {}) {
  state.robot = normalizeRobot(nextRobot);
  syncRobotToInputs();
  if (!skipAttachments) {
    renderAttachmentList();
  }
  canvas.setRobot(state.robot);
}

function updateRobotFromInputs() {
  commitRobot({
    ...state.robot,
    name: dom.robotName.value.trim() || "Untitled Robot",
    offsetY: numberFromInput(dom.robotOffset, state.robot.offsetY),
    robotWidthCm: numberFromInput(dom.robotWidth, state.robot.robotWidthCm),
    robotLengthCm: numberFromInput(dom.robotLength, state.robot.robotLengthCm)
  });
}

function renderAttachmentList() {
  dom.attachmentList.innerHTML = "";
  state.robot.attachments.forEach((attachment, index) => {
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
      const attachments = [...state.robot.attachments];
      attachments[index] = { ...attachments[index], side: side.value };
      commitRobot({ ...state.robot, attachments });
    });

    const width = document.createElement("input");
    configureDecimalInput(width);
    width.value = String(attachment.widthCm);
    width.addEventListener("input", () => {
      const attachments = [...state.robot.attachments];
      attachments[index] = { ...attachments[index], widthCm: numberFromInput(width, attachments[index].widthCm) };
      commitRobot({ ...state.robot, attachments }, { skipAttachments: true });
    });
    width.addEventListener("blur", () => {
      renderAttachmentList();
    });

    const length = document.createElement("input");
    configureDecimalInput(length);
    length.value = String(attachment.lengthCm);
    length.addEventListener("input", () => {
      const attachments = [...state.robot.attachments];
      attachments[index] = { ...attachments[index], lengthCm: numberFromInput(length, attachments[index].lengthCm) };
      commitRobot({ ...state.robot, attachments }, { skipAttachments: true });
    });
    length.addEventListener("blur", () => {
      renderAttachmentList();
    });

    const position = document.createElement("input");
    configureDecimalInput(position);
    position.value = String(attachment.positionCm);
    position.addEventListener("input", () => {
      const attachments = [...state.robot.attachments];
      attachments[index] = { ...attachments[index], positionCm: numberFromInput(position, attachments[index].positionCm) };
      commitRobot({ ...state.robot, attachments }, { skipAttachments: true });
    });
    position.addEventListener("blur", () => {
      renderAttachmentList();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "btn-ghost";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      const attachments = state.robot.attachments.filter(
        (_, attachmentIndex) => attachmentIndex !== index
      );
      commitRobot({ ...state.robot, attachments });
    });

    row.append(side, width, length, position, deleteButton);
    dom.attachmentList.appendChild(row);
  });
}

function addAttachment() {
  commitRobot({
    ...state.robot,
    attachments: [
      ...state.robot.attachments,
      { side: "front", widthCm: 4, lengthCm: 4, positionCm: 0 }
    ]
  });
}

function copyRobotJson() {
  navigator.clipboard.writeText(JSON.stringify(state.robot, null, 2)).then(
    () => setStatus("Robot JSON copied to the clipboard."),
    () => setStatus("Copy failed. Check browser permissions.")
  );
}

function saveLocalRobot() {
  const robots = upsertRobot(loadRobotLibrary(window.localStorage), state.robot);
  saveRobotLibrary(window.localStorage, robots);
  setStatus(`Saved "${state.robot.name}" locally.`);
}

function applyToMission() {
  stageRobotTransfer(window.localStorage, state.robot);
  setStatus("Robot staged for the Mission Tool. Return to the mission page to apply it.");
}

async function saveTeamRobot() {
  if (!runtime.allowsCloudSync) {
    setStatus("Cloud save is disabled in local mode.");
    return;
  }
  if (!state.teamSession.connected || !state.teamSession.name || !state.teamSession.pin) {
    setStatus("Connect a team in the Mission Tool first.");
    return;
  }

  try {
    const result = await cloud.saveRobot(state.teamSession, state.robot);
    if (!result?.ok) {
      throw new Error(result?.error || "Save failed.");
    }
    setStatus(`Saved "${state.robot.name}" to team ${state.teamSession.name}.`);
  } catch (error) {
    setStatus(`Could not save the robot to the team cloud: ${error.message}`);
  }
}

function onPointerDown(evt) {
  const target = evt.target;
  if (!(target instanceof SVGRectElement)) return;
  const index = target.getAttribute("data-index");
  if (index === null) return;
  state.draggingIndex = parseInt(index, 10);
  target.setAttribute("cursor", "grabbing");
}

function onPointerMove(evt) {
  if (state.draggingIndex === null) return;
  state.robot = canvas.updateDraggedAttachment(state.draggingIndex, evt);
  renderAttachmentList();
}

function onPointerUp() {
  state.draggingIndex = null;
  canvas.setRobot(state.robot);
}

function updateRuntimeMessage() {
  if (!runtime.allowsCloudSync) {
    dom.runtimeNote.textContent = runtime.detail;
    dom.saveTeam.disabled = true;
    setStatus("Local mode: save local robots or stage one for the Mission Tool.");
    return;
  }

  if (state.teamSession.connected && state.teamSession.name) {
    dom.runtimeNote.textContent = `Hosted mode. Team save is available for ${state.teamSession.name}.`;
    dom.saveTeam.disabled = false;
    setStatus(`Team save ready for ${state.teamSession.name}.`);
    return;
  }

  dom.runtimeNote.textContent = "Hosted mode. Connect a team in the Mission Tool to enable team save.";
  dom.saveTeam.disabled = true;
  setStatus("Local save and mission handoff are ready.");
}

function attachEvents() {
  [dom.robotOffset, dom.robotWidth, dom.robotLength].forEach((input) => {
    configureDecimalInput(input);
    input.addEventListener("input", updateRobotFromInputs);
    input.addEventListener("blur", syncRobotToInputs);
  });

  [dom.robotName].forEach((input) => {
    input.addEventListener("input", updateRobotFromInputs);
  });

  dom.addAttachment.addEventListener("click", addAttachment);
  dom.copyRobot.addEventListener("click", copyRobotJson);
  dom.saveLocal.addEventListener("click", saveLocalRobot);
  dom.applyToMission.addEventListener("click", applyToMission);
  dom.saveTeam.addEventListener("click", saveTeamRobot);

  dom.canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function init() {
  commitRobot(state.robot);
  updateRuntimeMessage();
  attachEvents();
}

init();
