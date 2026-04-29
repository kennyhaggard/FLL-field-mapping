import {
  FIELD_WIDTH_CM,
  STORAGE_KEYS,
  buildShareLink,
  cloudPost,
  createDefaultMission,
  createDefaultRobot,
  getLocal,
  normalizeMission,
  normalizeRobot,
  isLocalOrigin,
  readMissionFromUrl,
  safeNum,
  setLocal
} from "./core.js";

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
  actionList: document.getElementById("action-list"),
  missionJson: document.getElementById("mission-json"),
  jsonError: document.getElementById("json-error"),
  applyJson: document.getElementById("apply-json"),
  copyLink: document.getElementById("copy-link"),
  emailLink: document.getElementById("email-link"),
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
  replayCount: document.getElementById("replay-count"),
  svg: null
};

const state = {
  mission: createDefaultMission(),
  localRobots: [],
  team: {
    name: "public",
    pin: "",
    connected: false,
    missions: [],
    robots: []
  },
  render: {
    robotEl: null,
    traceEl: null
  },
  replay: {
    frames: [],
    index: 0,
    playing: false,
    rafId: null
  },
  running: {
    active: false,
    rafId: null,
    startTime: 0,
    frameIndex: 0
  }
};

async function loadFieldSvg() {
  if (!dom.fieldHost) return false;

  try {
    const res = await fetch("./field.svg");
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    dom.fieldHost.innerHTML = await res.text();
    dom.svg = dom.fieldHost.querySelector("#mission-field");

    if (!dom.svg) {
      throw new Error("Mission field SVG is missing its root id.");
    }

    dom.fieldHost.removeAttribute("data-state");
    return true;
  } catch (e) {
    dom.fieldHost.dataset.state = "error";
    dom.fieldHost.textContent = "Could not load the field artwork. Refresh the page and try again.";
    return false;
  }
}

function getScale(svgRoot) {
  const width = svgRoot.viewBox.baseVal.width || svgRoot.clientWidth || 0;
  const scale = width / FIELD_WIDTH_CM;
  return { scaleX: scale, scaleY: scale };
}

function computeStartPose(mission) {
  const svgRoot = dom.svg;
  if (!svgRoot) return null;

  const { scaleX, scaleY } = getScale(svgRoot);
  const r = (mission.startAngle * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);

  const halfLx = (mission.robotLengthCm * scaleX) / 2;
  const halfLy = (mission.robotLengthCm * scaleY) / 2;
  const halfWx = (mission.robotWidthCm * scaleX) / 2;
  const halfWy = (mission.robotWidthCm * scaleY) / 2;

  const dx = Math.abs(c) * halfLx + Math.abs(s) * halfWx;
  const dy = Math.abs(s) * halfLy + Math.abs(c) * halfWy;

  const x = mission.startX * scaleX + dx;
  const y = svgRoot.viewBox.baseVal.height - mission.startY * scaleY - dy;

  return { x, y, angle: mission.startAngle };
}

function offsetXY(angleDeg, mission, scaleY) {
  const oCm = mission.offsetY || 0;
  const oSvg = oCm * scaleY;
  const r = (angleDeg * Math.PI) / 180;
  return {
    ox: oSvg * Math.cos(r),
    oy: -oSvg * Math.sin(r)
  };
}

function attachmentRect(att, mission) {
  const halfW = mission.robotWidthCm / 2;
  const halfL = mission.robotLengthCm / 2;
  const w = att.widthCm;
  const l = att.lengthCm;

  if (att.side === "front") {
    return {
      x: att.positionCm - w / 2,
      y: halfL,
      width: w,
      height: l
    };
  }
  if (att.side === "rear") {
    return {
      x: att.positionCm - w / 2,
      y: -halfL - l,
      width: w,
      height: l
    };
  }
  if (att.side === "left") {
    return {
      x: -halfW - l,
      y: att.positionCm - w / 2,
      width: l,
      height: w
    };
  }
  if (att.side === "right") {
    return {
      x: halfW,
      y: att.positionCm - w / 2,
      width: l,
      height: w
    };
  }
  return null;
}

function clearDynamic() {
  const svgRoot = dom.svg;
  if (!svgRoot) return;
  const nodes = Array.from(svgRoot.querySelectorAll('[data-dynamic="1"]'));
  nodes.forEach((node) => node.remove());
  state.render.robotEl = null;
  state.render.traceEl = null;
}

function drawRobot(pose, mission) {
  const svgRoot = dom.svg;
  if (!svgRoot) return;
  const { scaleX, scaleY } = getScale(svgRoot);

  const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
  group.setAttribute("data-dynamic", "1");

  const base = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  base.setAttribute("x", (-mission.robotWidthCm / 2) * scaleX);
  base.setAttribute("y", (-mission.robotLengthCm / 2) * scaleY);
  base.setAttribute("width", mission.robotWidthCm * scaleX);
  base.setAttribute("height", mission.robotLengthCm * scaleY);
  base.setAttribute("fill", "rgba(16, 131, 104, 0.25)");
  base.setAttribute("stroke", mission.traceColor || "#108368");
  base.setAttribute("stroke-width", "2");
  group.appendChild(base);

  (mission.attachments || []).forEach((att) => {
    const rect = attachmentRect(att, mission);
    if (!rect) return;
    const a = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    a.setAttribute("x", rect.x * scaleX);
    a.setAttribute("y", rect.y * scaleY);
    a.setAttribute("width", rect.width * scaleX);
    a.setAttribute("height", rect.height * scaleY);
    a.setAttribute("fill", "rgba(37, 99, 235, 0.2)");
    a.setAttribute("stroke", "#1e3a8a");
    a.setAttribute("stroke-width", "1.5");
    group.appendChild(a);
  });

  group.setAttribute(
    "transform",
    `translate(${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) rotate(${90 - pose.angle})`
  );

  svgRoot.appendChild(group);
  state.render.robotEl = group;
}

function updateRobotTransform(pose) {
  if (!state.render.robotEl) return;
  state.render.robotEl.setAttribute(
    "transform",
    `translate(${pose.x.toFixed(2)}, ${pose.y.toFixed(2)}) rotate(${90 - pose.angle})`
  );
}

function ensureTraceLine(color) {
  if (state.render.traceEl) return state.render.traceEl;
  const svgRoot = dom.svg;
  if (!svgRoot) return null;
  const pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  pl.setAttribute("data-dynamic", "1");
  pl.setAttribute("fill", "none");
  pl.setAttribute("stroke", color || "#108368");
  pl.setAttribute("stroke-width", "2.4");
  pl.setAttribute("stroke-linecap", "round");
  pl.setAttribute("stroke-linejoin", "round");
  pl.setAttribute("vector-effect", "non-scaling-stroke");
  svgRoot.appendChild(pl);
  state.render.traceEl = pl;
  return pl;
}

function buildFrames(mission, fps) {
  const svgRoot = dom.svg;
  if (!svgRoot) return [];
  const { scaleX, scaleY } = getScale(svgRoot);
  const pose = computeStartPose(mission);
  if (!pose) return [];

  const moveSpeed = 20;
  const rotateSpeed = 45;
  const dt = 1000 / (fps || 60);

  const frames = [];
  let current = { ...pose };

  frames.push({ ...current });

  (mission.actions || []).forEach((action) => {
    if (action.type === "move") {
      const distanceCm = action.value || 0;
      const duration = Math.abs(distanceCm) / moveSpeed * 1000;
      const steps = Math.max(1, Math.round(duration / dt));
      const angleRad = (current.angle * Math.PI) / 180;
      const dx = Math.cos(angleRad) * (distanceCm * scaleX);
      const dy = -Math.sin(angleRad) * (distanceCm * scaleY);
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        frames.push({
          x: current.x + dx * t,
          y: current.y + dy * t,
          angle: current.angle
        });
      }
      current = frames[frames.length - 1];
    }

    if (action.type === "rotate") {
      const delta = action.value || 0;
      const duration = Math.abs(delta) / rotateSpeed * 1000;
      const steps = Math.max(1, Math.round(duration / dt));
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        frames.push({
          x: current.x,
          y: current.y,
          angle: current.angle + delta * t
        });
      }
      current = frames[frames.length - 1];
    }
  });

  return frames;
}

function renderTraceFromFrames(frames, mission, uptoIndex) {
  if (!frames.length) return;
  const svgRoot = dom.svg;
  if (!svgRoot) return;
  const { scaleY } = getScale(svgRoot);
  const trace = ensureTraceLine(mission.traceColor || "#108368");
  if (!trace) return;

  const limit = typeof uptoIndex === "number" ? uptoIndex : frames.length - 1;
  const points = [];
  for (let i = 0; i <= limit; i += 1) {
    const f = frames[i];
    const off = offsetXY(f.angle, mission, scaleY);
    points.push(`${(f.x - off.ox).toFixed(2)},${(f.y - off.oy).toFixed(2)}`);
  }
  trace.setAttribute("points", points.join(" "));
}

function renderMission() {
  clearDynamic();
  const mission = normalizeMission(state.mission);
  state.mission = mission;
  const pose = computeStartPose(mission);
  if (!pose) return;
  renderTraceFromFrames([pose], mission, 0);
  drawRobot(pose, mission);
}

function syncMissionToInputs() {
  const mission = state.mission;
  dom.missionName.value = mission.name;
  dom.traceColor.value = mission.traceColor;
  dom.startX.value = mission.startX;
  dom.startY.value = mission.startY;
  dom.startAngle.value = mission.startAngle;
  dom.robotWidth.value = mission.robotWidthCm;
  dom.robotLength.value = mission.robotLengthCm;
  dom.robotOffset.value = mission.offsetY;
  dom.robotName.value = mission.robotName || "";
  updateMissionJson();
  renderAttachments();
  renderActions();
}

function updateMissionFromInputs() {
  state.mission = normalizeMission({
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
  });
  updateMissionJson();
  setLocal(STORAGE_KEYS.mission, state.mission);
  renderMission();
}

function updateMissionJson() {
  if (document.activeElement === dom.missionJson) return;
  dom.missionJson.value = JSON.stringify(state.mission, null, 2);
}

function renderActions() {
  dom.actionList.innerHTML = "";
  (state.mission.actions || []).forEach((action, idx) => {
    const row = document.createElement("div");
    row.className = "action-item";

    const typeSelect = document.createElement("select");
    ["move", "rotate"].forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t.toUpperCase();
      if (action.type === t) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener("change", () => {
      action.type = typeSelect.value;
      updateMissionFromInputs();
    });

    const valueInput = document.createElement("input");
    valueInput.type = "number";
    valueInput.step = "1";
    valueInput.value = action.value;
    valueInput.addEventListener("input", () => {
      action.value = safeNum(valueInput.value, 0);
      updateMissionFromInputs();
    });

    const del = document.createElement("button");
    del.className = "btn-ghost";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      state.mission.actions.splice(idx, 1);
      renderActions();
      updateMissionFromInputs();
    });

    row.appendChild(typeSelect);
    row.appendChild(valueInput);
    row.appendChild(del);
    dom.actionList.appendChild(row);
  });
}

function renderAttachments() {
  dom.attachmentList.innerHTML = "";
  const attachments = state.mission.attachments || [];
  dom.attachmentCount.textContent = `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`;

  attachments.forEach((att, idx) => {
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
      updateMissionFromInputs();
    });

    const width = document.createElement("input");
    width.type = "number";
    width.step = "0.1";
    width.value = att.widthCm;
    width.addEventListener("input", () => {
      att.widthCm = safeNum(width.value, 0);
      updateMissionFromInputs();
    });

    const length = document.createElement("input");
    length.type = "number";
    length.step = "0.1";
    length.value = att.lengthCm;
    length.addEventListener("input", () => {
      att.lengthCm = safeNum(length.value, 0);
      updateMissionFromInputs();
    });

    const position = document.createElement("input");
    position.type = "number";
    position.step = "0.1";
    position.value = att.positionCm;
    position.addEventListener("input", () => {
      att.positionCm = safeNum(position.value, 0);
      updateMissionFromInputs();
    });

    const del = document.createElement("button");
    del.className = "btn-ghost";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      state.mission.attachments.splice(idx, 1);
      renderAttachments();
      updateMissionFromInputs();
    });

    row.appendChild(side);
    row.appendChild(width);
    row.appendChild(length);
    row.appendChild(position);
    row.appendChild(del);
    dom.attachmentList.appendChild(row);
  });
}

function loadLocalRobots() {
  const stored = getLocal(STORAGE_KEYS.robots, []);
  state.localRobots = stored.map(normalizeRobot);
  if (!state.localRobots.length) {
    state.localRobots.push(createDefaultRobot());
  }
  renderLocalRobots();
}

function renderLocalRobots() {
  dom.localRobotSelect.innerHTML = "";
  state.localRobots.forEach((robot, idx) => {
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = robot.name;
    dom.localRobotSelect.appendChild(opt);
  });
}

function saveLocalRobot() {
  const name = dom.robotName.value.trim() || `Robot ${state.localRobots.length + 1}`;
  const robot = normalizeRobot({
    name,
    robotWidthCm: safeNum(dom.robotWidth.value, 0),
    robotLengthCm: safeNum(dom.robotLength.value, 0),
    offsetY: safeNum(dom.robotOffset.value, 0),
    attachments: state.mission.attachments || []
  });
  state.localRobots.push(robot);
  setLocal(STORAGE_KEYS.robots, state.localRobots);
  renderLocalRobots();
  dom.localRobotSelect.value = String(state.localRobots.length - 1);
}

function applyLocalRobot() {
  const idx = parseInt(dom.localRobotSelect.value, 10);
  const robot = state.localRobots[idx];
  if (!robot) return;
  applyRobotToMission(robot);
  syncMissionToInputs();
  renderMission();
  setLocal(STORAGE_KEYS.mission, state.mission);
}

function applyRobotToMission(robotLike) {
  const robot = normalizeRobot(robotLike);
  state.mission = normalizeMission({
    ...state.mission,
    robotWidthCm: robot.robotWidthCm,
    robotLengthCm: robot.robotLengthCm,
    offsetY: robot.offsetY,
    attachments: robot.attachments,
    robotName: robot.name
  });
}

function applyTransferredRobotIfPresent() {
  const transferRobot = getLocal(STORAGE_KEYS.robotTransfer, null);
  if (!transferRobot) return false;

  applyRobotToMission(transferRobot);
  syncMissionToInputs();
  renderMission();
  setLocal(STORAGE_KEYS.mission, state.mission);
  setLocal(STORAGE_KEYS.robotTransfer, null);
  return true;
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
  ].forEach((input) => {
    input.addEventListener("input", updateMissionFromInputs);
  });

  dom.loadDemo.addEventListener("click", () => {
    state.mission = createDefaultMission();
    syncMissionToInputs();
    renderMission();
    setLocal(STORAGE_KEYS.mission, state.mission);
  });

  dom.resetMission.addEventListener("click", () => {
    state.mission = normalizeMission({
      name: "New Mission",
      startX: 0,
      startY: 0,
      startAngle: 90,
      robotWidthCm: 12.7,
      robotLengthCm: 20.5,
      offsetY: 0,
      traceColor: "#108368",
      attachments: [],
      actions: []
    });
    syncMissionToInputs();
    renderMission();
    setLocal(STORAGE_KEYS.mission, state.mission);
  });

  dom.addMove.addEventListener("click", () => {
    state.mission.actions.push({ type: "move", value: 50 });
    renderActions();
    updateMissionFromInputs();
  });

  dom.addRotate.addEventListener("click", () => {
    state.mission.actions.push({ type: "rotate", value: -90 });
    renderActions();
    updateMissionFromInputs();
  });

  dom.addAttachment.addEventListener("click", () => {
    state.mission.attachments.push({
      side: "front",
      widthCm: 4,
      lengthCm: 4,
      positionCm: 0
    });
    renderAttachments();
    updateMissionFromInputs();
  });

  dom.applyJson.addEventListener("click", () => {
    dom.jsonError.style.display = "none";
    try {
      const parsed = JSON.parse(dom.missionJson.value);
      state.mission = normalizeMission(parsed);
      syncMissionToInputs();
      renderMission();
      setLocal(STORAGE_KEYS.mission, state.mission);
    } catch (e) {
      dom.jsonError.textContent = `Invalid JSON: ${e.message}`;
      dom.jsonError.style.display = "block";
    }
  });

  dom.copyLink.addEventListener("click", () => {
    const link = buildShareLink(state.mission);
    navigator.clipboard.writeText(link).then(
      () => alert("Share link copied."),
      () => alert(`Copy this link:\n${link}`)
    );
  });

  dom.emailLink.addEventListener("click", () => {
    const link = buildShareLink(state.mission);
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
  dom.applyLocalRobot.addEventListener("click", applyLocalRobot);

  dom.startMission.addEventListener("click", startMissionRun);
  dom.stopMission.addEventListener("click", stopMissionRun);
  dom.clearField.addEventListener("click", () => {
    clearDynamic();
    renderMission();
  });

  dom.buildReplay.addEventListener("click", buildReplayFrames);
  dom.playReplay.addEventListener("click", playReplay);
  dom.pauseReplay.addEventListener("click", pauseReplay);
  dom.resetReplay.addEventListener("click", resetReplay);
  dom.replaySlider.addEventListener("input", onReplaySliderInput);

  dom.connectTeam.addEventListener("click", connectTeam);
  dom.refreshTeam.addEventListener("click", refreshTeamData);
  dom.loadTeamMission.addEventListener("click", loadTeamMission);
  dom.saveTeamMission.addEventListener("click", saveTeamMission);
  dom.deleteTeamMission.addEventListener("click", deleteTeamMission);
  dom.loadTeamRobot.addEventListener("click", loadTeamRobot);
  dom.saveTeamRobot.addEventListener("click", saveTeamRobot);
  dom.deleteTeamRobot.addEventListener("click", deleteTeamRobot);
}

function buildReplayFrames() {
  if (state.replay.rafId) cancelAnimationFrame(state.replay.rafId);
  state.replay.playing = false;
  state.replay.frames = buildFrames(state.mission, 60);
  state.replay.index = 0;
  dom.replaySlider.max = Math.max(0, state.replay.frames.length - 1);
  dom.replaySlider.value = 0;
  updateReplayControls();
  renderReplayFrame(0);
}

function renderReplayFrame(idx) {
  if (!state.replay.frames.length) return;
  const mission = state.mission;
  const pose = state.replay.frames[idx];
  if (!state.render.robotEl) {
    drawRobot(pose, mission);
  } else {
    updateRobotTransform(pose);
  }
  renderTraceFromFrames(state.replay.frames, mission, idx);
  dom.replayCount.textContent = `${idx} / ${Math.max(0, state.replay.frames.length - 1)}`;
}

function onReplaySliderInput() {
  const idx = parseInt(dom.replaySlider.value, 10) || 0;
  state.replay.index = idx;
  renderReplayFrame(idx);
}

function updateReplayControls() {
  const hasFrames = state.replay.frames.length > 0;
  dom.playReplay.disabled = !hasFrames || state.replay.playing;
  dom.pauseReplay.disabled = !state.replay.playing;
  dom.resetReplay.disabled = !hasFrames;
}

function playReplay() {
  if (!state.replay.frames.length) return;
  if (state.replay.playing) return;
  state.replay.playing = true;
  const start = performance.now();
  const startIndex = state.replay.index;

  const step = (t) => {
    if (!state.replay.playing) return;
    const elapsed = t - start;
    const fps = 60;
    const idx = Math.min(
      state.replay.frames.length - 1,
      startIndex + Math.floor((elapsed / 1000) * fps)
    );
    state.replay.index = idx;
    dom.replaySlider.value = idx;
    renderReplayFrame(idx);
    if (idx >= state.replay.frames.length - 1) {
      state.replay.playing = false;
      updateReplayControls();
      return;
    }
    state.replay.rafId = requestAnimationFrame(step);
  };

  updateReplayControls();
  state.replay.rafId = requestAnimationFrame(step);
}

function pauseReplay() {
  state.replay.playing = false;
  if (state.replay.rafId) cancelAnimationFrame(state.replay.rafId);
  updateReplayControls();
}

function resetReplay() {
  state.replay.index = 0;
  dom.replaySlider.value = 0;
  renderReplayFrame(0);
}

function startMissionRun() {
  if (state.running.active) return;
  const frames = buildFrames(state.mission, 60);
  if (!frames.length) return;
  if (!state.render.robotEl) {
    renderMission();
  }
  state.running.active = true;
  state.running.startTime = performance.now();
  state.running.frameIndex = 0;
  dom.stopMission.disabled = false;

  const step = (t) => {
    if (!state.running.active) return;
    const elapsed = t - state.running.startTime;
    const fps = 60;
    const idx = Math.min(frames.length - 1, Math.floor((elapsed / 1000) * fps));
    state.running.frameIndex = idx;
    updateRobotTransform(frames[idx]);
    renderTraceFromFrames(frames, state.mission, idx);

    if (idx >= frames.length - 1) {
      state.running.active = false;
      dom.stopMission.disabled = true;
      return;
    }
    state.running.rafId = requestAnimationFrame(step);
  };

  state.running.rafId = requestAnimationFrame(step);
}

function stopMissionRun() {
  state.running.active = false;
  dom.stopMission.disabled = true;
  if (state.running.rafId) cancelAnimationFrame(state.running.rafId);
}

function updateTeamControls() {
  const enabled = state.team.connected;
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
    dom.teamStatus.textContent = "Enter a team name and PIN.";
    return;
  }
  if (isLocalOrigin()) {
    state.team.name = name;
    state.team.pin = pin;
    state.team.connected = true;
    setLocal(STORAGE_KEYS.team, { name, pin });
    updateTeamControls();
    dom.teamStatus.textContent = "Local mode: cloud sync is blocked by CORS. Use the hosted site for team sync.";
    return;
  }
  state.team.name = name;
  state.team.pin = pin;
  state.team.connected = true;
  dom.teamStatus.textContent = `Connected as ${name}.`;
  setLocal(STORAGE_KEYS.team, { name, pin });
  updateTeamControls();
  await refreshTeamData();
}

async function refreshTeamData() {
  if (!state.team.connected) return;
  if (isLocalOrigin()) {
    dom.teamStatus.textContent = "Local mode: cloud sync is blocked by CORS.";
    return;
  }
  dom.teamStatus.textContent = "Syncing team data...";
  await Promise.all([refreshTeamMissions(), refreshTeamRobots()]);
  dom.teamStatus.textContent = `Loaded ${state.team.missions.length} missions and ${state.team.robots.length} robots.`;
}

async function refreshTeamMissions() {
  try {
    const data = await cloudPost("/list_missions", {
      teamName: state.team.name,
      teamPin: state.team.pin,
      pin: state.team.pin
    });
    state.team.missions = (data.missions || []).map((m) => ({
      name: m.name || m.missionName || "Untitled"
    }));
    renderTeamMissions();
  } catch (e) {
    dom.teamStatus.textContent = "Could not load missions.";
  }
}

function renderTeamMissions() {
  dom.teamMissionSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "-- select --";
  dom.teamMissionSelect.appendChild(placeholder);
  state.team.missions.forEach((mission) => {
    const opt = document.createElement("option");
    opt.value = mission.name;
    opt.textContent = mission.name;
    dom.teamMissionSelect.appendChild(opt);
  });
}

async function loadTeamMission() {
  const name = dom.teamMissionSelect.value;
  if (!name) return;
  try {
    const data = await cloudPost("/get_mission", {
      teamName: state.team.name,
      teamPin: state.team.pin,
      pin: state.team.pin,
      missionName: name
    });
    if (!data || !data.mission) throw new Error("missing mission");
    state.mission = normalizeMission(data.mission);
    syncMissionToInputs();
    renderMission();
  } catch (e) {
    dom.teamStatus.textContent = "Could not load mission.";
  }
}

async function saveTeamMission() {
  const name = (state.mission.name || "").trim();
  if (!name) {
    dom.teamStatus.textContent = "Mission name is required.";
    return;
  }
  try {
    const data = await cloudPost("/save_mission", {
      teamName: state.team.name,
      teamPin: state.team.pin,
      pin: state.team.pin,
      missionName: name,
      mission: state.mission
    });
    if (!data || !data.ok) throw new Error("save failed");
    await refreshTeamMissions();
    dom.teamStatus.textContent = `Saved mission "${name}".`;
  } catch (e) {
    dom.teamStatus.textContent = "Could not save mission.";
  }
}

async function deleteTeamMission() {
  const name = dom.teamMissionSelect.value;
  if (!name) return;
  if (!confirm(`Delete mission "${name}"?`)) return;
  try {
    const data = await cloudPost("/delete_mission", {
      teamName: state.team.name,
      teamPin: state.team.pin,
      pin: state.team.pin,
      missionName: name
    });
    if (!data || !data.ok) throw new Error("delete failed");
    await refreshTeamMissions();
    dom.teamStatus.textContent = `Deleted mission "${name}".`;
  } catch (e) {
    dom.teamStatus.textContent = "Could not delete mission.";
  }
}

async function refreshTeamRobots() {
  try {
    const data = await cloudPost("/list_robots", {
      teamName: state.team.name,
      teamPin: state.team.pin,
      pin: state.team.pin
    });
    state.team.robots = (data.robots || []).map((r) => ({
      name: r.name || r.robotName || "Untitled" 
    }));
    renderTeamRobots();
  } catch (e) {
    dom.teamStatus.textContent = "Robots endpoint not ready yet.";
  }
}

function renderTeamRobots() {
  dom.teamRobotSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "-- select --";
  dom.teamRobotSelect.appendChild(placeholder);
  state.team.robots.forEach((robot) => {
    const opt = document.createElement("option");
    opt.value = robot.name;
    opt.textContent = robot.name;
    dom.teamRobotSelect.appendChild(opt);
  });
}

async function loadTeamRobot() {
  const name = dom.teamRobotSelect.value;
  if (!name) return;
  try {
    const data = await cloudPost("/get_robot", {
      teamName: state.team.name,
      teamPin: state.team.pin,
      pin: state.team.pin,
      robotName: name
    });
    if (!data || !data.robot) throw new Error("missing robot");
    const robot = normalizeRobot(data.robot);
    state.mission = normalizeMission({
      ...state.mission,
      robotWidthCm: robot.robotWidthCm,
      robotLengthCm: robot.robotLengthCm,
      offsetY: robot.offsetY,
      attachments: robot.attachments,
      robotName: robot.name
    });
    syncMissionToInputs();
    renderMission();
  } catch (e) {
    dom.teamStatus.textContent = "Could not load robot.";
  }
}

async function saveTeamRobot() {
  const name = (dom.robotName.value || "").trim();
  if (!name) {
    dom.teamStatus.textContent = "Robot name is required.";
    return;
  }
  try {
    const robot = normalizeRobot({
      name,
      robotWidthCm: safeNum(dom.robotWidth.value, 0),
      robotLengthCm: safeNum(dom.robotLength.value, 0),
      offsetY: safeNum(dom.robotOffset.value, 0),
      attachments: state.mission.attachments || []
    });
    const data = await cloudPost("/save_robot", {
      teamName: state.team.name,
      teamPin: state.team.pin,
      pin: state.team.pin,
      robotName: name,
      robot
    });
    if (!data || !data.ok) throw new Error("save failed");
    await refreshTeamRobots();
    dom.teamStatus.textContent = `Saved robot "${name}".`;
  } catch (e) {
    dom.teamStatus.textContent = "Robots endpoint not ready yet.";
  }
}

async function deleteTeamRobot() {
  const name = dom.teamRobotSelect.value;
  if (!name) return;
  if (!confirm(`Delete robot "${name}"?`)) return;
  try {
    const data = await cloudPost("/delete_robot", {
      teamName: state.team.name,
      teamPin: state.team.pin,
      pin: state.team.pin,
      robotName: name
    });
    if (!data || !data.ok) throw new Error("delete failed");
    await refreshTeamRobots();
    dom.teamStatus.textContent = `Deleted robot "${name}".`;
  } catch (e) {
    dom.teamStatus.textContent = "Robots endpoint not ready yet.";
  }
}

function initFromStorage() {
  const fromUrl = readMissionFromUrl();
  const fromStorage = getLocal(STORAGE_KEYS.mission, null);
  state.mission = fromUrl ? normalizeMission(fromUrl) : normalizeMission(fromStorage || createDefaultMission());
  applyTransferredRobotIfPresent();

  const team = getLocal(STORAGE_KEYS.team, null);
  if (team && team.name) {
    dom.teamName.value = team.name;
    dom.teamPin.value = team.pin || "";
  } else {
    dom.teamName.value = "public";
  }
}

async function init() {
  const fieldLoaded = await loadFieldSvg();
  if (!fieldLoaded) return;

  initFromStorage();
  loadLocalRobots();
  syncMissionToInputs();
  renderMission();
  attachEventHandlers();
  updateTeamControls();

  window.addEventListener("pageshow", () => {
    if (!applyTransferredRobotIfPresent()) return;
    updateTeamControls();
  });
}

init();
