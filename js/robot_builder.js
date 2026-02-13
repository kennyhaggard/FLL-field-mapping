import {
  STORAGE_KEYS,
  createDefaultRobot,
  cloudPost,
  getLocal,
  normalizeRobot,
  safeNum,
  setLocal
} from "./core.js";

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
  robotStatus: document.getElementById("robot-status"),
  canvas: document.getElementById("robot-canvas")
};

const state = {
  robot: createDefaultRobot(),
  dragging: null
};

function syncRobotToInputs() {
  dom.robotName.value = state.robot.name || "";
  dom.robotOffset.value = state.robot.offsetY;
  dom.robotWidth.value = state.robot.robotWidthCm;
  dom.robotLength.value = state.robot.robotLengthCm;
}

function updateRobotFromInputs() {
  state.robot = normalizeRobot({
    ...state.robot,
    name: dom.robotName.value.trim() || "Untitled Robot",
    offsetY: safeNum(dom.robotOffset.value, 0),
    robotWidthCm: safeNum(dom.robotWidth.value, 0),
    robotLengthCm: safeNum(dom.robotLength.value, 0)
  });
  drawRobot();
  renderAttachmentList();
}

function attachmentRect(att) {
  const halfW = state.robot.robotWidthCm / 2;
  const halfL = state.robot.robotLengthCm / 2;
  const w = att.widthCm;
  const l = att.lengthCm;

  if (att.side === "front") {
    return { x: att.positionCm - w / 2, y: halfL, width: w, height: l };
  }
  if (att.side === "rear") {
    return { x: att.positionCm - w / 2, y: -halfL - l, width: w, height: l };
  }
  if (att.side === "left") {
    return { x: -halfW - l, y: att.positionCm - w / 2, width: l, height: w };
  }
  if (att.side === "right") {
    return { x: halfW, y: att.positionCm - w / 2, width: l, height: w };
  }
  return null;
}

function drawRobot() {
  const svg = dom.canvas;
  svg.innerHTML = "";

  const base = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  base.setAttribute("x", -state.robot.robotWidthCm / 2);
  base.setAttribute("y", -state.robot.robotLengthCm / 2);
  base.setAttribute("width", state.robot.robotWidthCm);
  base.setAttribute("height", state.robot.robotLengthCm);
  base.setAttribute("fill", "rgba(16, 131, 104, 0.18)");
  base.setAttribute("stroke", "#0f766e");
  base.setAttribute("stroke-width", "1.6");
  svg.appendChild(base);

  state.robot.attachments.forEach((att, idx) => {
    const rect = attachmentRect(att);
    if (!rect) return;
    const el = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    el.setAttribute("x", rect.x);
    el.setAttribute("y", rect.y);
    el.setAttribute("width", rect.width);
    el.setAttribute("height", rect.height);
    el.setAttribute("fill", "rgba(37, 99, 235, 0.18)");
    el.setAttribute("stroke", "#1e3a8a");
    el.setAttribute("stroke-width", "1.2");
    el.setAttribute("data-index", idx);
    el.setAttribute("cursor", "grab");
    svg.appendChild(el);
  });
}

function renderAttachmentList() {
  dom.attachmentList.innerHTML = "";
  state.robot.attachments.forEach((att, idx) => {
    const row = document.createElement("div");
    row.className = "attachment-item";

    const side = document.createElement("select");
    ["front", "rear", "left", "right"].forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      if (att.side === t) opt.selected = true;
      side.appendChild(opt);
    });
    side.addEventListener("change", () => {
      att.side = side.value;
      drawRobot();
      renderAttachmentList();
    });

    const width = document.createElement("input");
    width.type = "number";
    width.step = "0.1";
    width.value = att.widthCm;
    width.addEventListener("input", () => {
      att.widthCm = safeNum(width.value, 0);
      drawRobot();
    });

    const length = document.createElement("input");
    length.type = "number";
    length.step = "0.1";
    length.value = att.lengthCm;
    length.addEventListener("input", () => {
      att.lengthCm = safeNum(length.value, 0);
      drawRobot();
    });

    const position = document.createElement("input");
    position.type = "number";
    position.step = "0.1";
    position.value = att.positionCm;
    position.addEventListener("input", () => {
      att.positionCm = safeNum(position.value, 0);
      drawRobot();
    });

    const del = document.createElement("button");
    del.className = "btn-ghost";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      state.robot.attachments.splice(idx, 1);
      drawRobot();
      renderAttachmentList();
    });

    row.appendChild(side);
    row.appendChild(width);
    row.appendChild(length);
    row.appendChild(position);
    row.appendChild(del);
    dom.attachmentList.appendChild(row);
  });
}

function addAttachment() {
  state.robot.attachments.push({
    side: "front",
    widthCm: 4,
    lengthCm: 4,
    positionCm: 0
  });
  drawRobot();
  renderAttachmentList();
}

function getSvgPoint(evt) {
  const svg = dom.canvas;
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

function onPointerDown(evt) {
  const target = evt.target;
  if (!(target instanceof SVGRectElement)) return;
  const idx = target.getAttribute("data-index");
  if (idx === null) return;
  state.dragging = { idx: parseInt(idx, 10) };
  target.setAttribute("cursor", "grabbing");
}

function onPointerMove(evt) {
  if (!state.dragging) return;
  const att = state.robot.attachments[state.dragging.idx];
  if (!att) return;
  const point = getSvgPoint(evt);
  if (att.side === "front" || att.side === "rear") {
    att.positionCm = point.x;
  } else {
    att.positionCm = point.y;
  }
  renderAttachmentList();
  drawRobot();
}

function onPointerUp() {
  state.dragging = null;
}

function copyRobotJson() {
  const payload = {
    robotWidthCm: state.robot.robotWidthCm,
    robotLengthCm: state.robot.robotLengthCm,
    offsetY: state.robot.offsetY,
    attachments: state.robot.attachments
  };
  const json = JSON.stringify(payload, null, 2);
  navigator.clipboard.writeText(json).then(
    () => {
      dom.robotStatus.textContent = "Robot JSON copied to clipboard.";
    },
    () => {
      dom.robotStatus.textContent = "Copy failed. Check browser permissions.";
    }
  );
}

function saveLocalRobot() {
  const robots = getLocal(STORAGE_KEYS.robots, []).map(normalizeRobot);
  const robot = normalizeRobot(state.robot);
  robots.push(robot);
  setLocal(STORAGE_KEYS.robots, robots);
  dom.robotStatus.textContent = `Saved "${robot.name}" locally.`;
}

function applyToMission() {
  const robot = normalizeRobot(state.robot);
  setLocal(STORAGE_KEYS.robotTransfer, robot);
  dom.robotStatus.textContent = "Robot sent to Mission Tool. Open the mission page to apply it.";
}

async function saveTeamRobot() {
  const team = getLocal(STORAGE_KEYS.team, null);
  if (!team || !team.name || !team.pin) {
    dom.robotStatus.textContent = "Connect a team in the Mission Tool first.";
    return;
  }
  try {
    const robot = normalizeRobot(state.robot);
    const data = await cloudPost("/save_robot", {
      teamName: team.name,
      teamPin: team.pin,
      pin: team.pin,
      robotName: robot.name,
      robot
    });
    if (!data || !data.ok) throw new Error("save failed");
    dom.robotStatus.textContent = `Saved "${robot.name}" to team cloud.`;
  } catch (e) {
    dom.robotStatus.textContent = "Robots endpoint not ready yet.";
  }
}

function init() {
  syncRobotToInputs();
  drawRobot();
  renderAttachmentList();
  const team = getLocal(STORAGE_KEYS.team, null);
  dom.saveTeam.disabled = !(team && team.name && team.pin);

  [dom.robotName, dom.robotOffset, dom.robotWidth, dom.robotLength].forEach((input) => {
    input.addEventListener("input", updateRobotFromInputs);
  });

  dom.addAttachment.addEventListener("click", addAttachment);
  dom.copyRobot.addEventListener("click", copyRobotJson);
  dom.saveLocal.addEventListener("click", saveLocalRobot);
  dom.applyToMission.addEventListener("click", applyToMission);
  dom.saveTeam.addEventListener("click", saveTeamRobot);

  dom.canvas.addEventListener("pointerdown", onPointerDown);
  dom.canvas.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

init();
