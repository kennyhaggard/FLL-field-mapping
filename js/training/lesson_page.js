import {
  buildReplayFrames,
  normalizeMission,
  normalizeRobot
} from "../domain/model.js";
import { FieldRenderer } from "../ui/field_renderer.js?v=turn-center-marker";
import { RobotCanvas } from "../ui/robot_canvas.js?v=turn-center-marker";
import { getLesson, lessons } from "./lessons.js";

const lessonId = document.body.dataset.lessonId;
const lesson = getLesson(lessonId);

const dom = {
  eyebrow: document.getElementById("lesson-eyebrow"),
  title: document.getElementById("lesson-title"),
  objective: document.getElementById("lesson-objective"),
  steps: document.getElementById("lesson-steps"),
  tryIt: document.getElementById("lesson-try-it"),
  controls: document.getElementById("lesson-controls"),
  reset: document.getElementById("lesson-reset"),
  prev: document.getElementById("lesson-prev"),
  next: document.getElementById("lesson-next"),
  fieldPanel: document.getElementById("lesson-field-panel"),
  fieldHost: document.getElementById("lesson-field-host"),
  robotPanel: document.getElementById("lesson-robot-panel"),
  robotCanvas: document.getElementById("lesson-robot-canvas"),
  replayControls: document.getElementById("lesson-replay-controls"),
  frameSlider: document.getElementById("lesson-frame-slider"),
  frameCount: document.getElementById("lesson-frame-count"),
  start: document.getElementById("lesson-start"),
  clearTraces: document.getElementById("lesson-clear-traces"),
  showStart: document.getElementById("lesson-show-start"),
  showFinish: document.getElementById("lesson-show-finish")
};

let mission = lesson?.starterMission ? normalizeMission(lesson.starterMission) : null;
let robot = lesson?.starterRobot ? normalizeRobot(lesson.starterRobot) : normalizeRobot(mission?.robot);
let frames = [];
let fieldRenderer = null;
let robotCanvas = null;
let playback = {
  playing: false,
  rafId: null,
  fps: 20
};
const isOffsetLesson = lesson?.id === "offset";

function refreshTrainingStylesheet() {
  const link = document.querySelector("link[rel='stylesheet'][href*='styles.css']");
  if (!link || link.href.includes("training-pane-2")) return Promise.resolve();

  return new Promise((resolve) => {
    const done = () => resolve();
    link.addEventListener("load", done, { once: true });
    link.addEventListener("error", done, { once: true });
    setTimeout(done, 600);
    const baseHref = link.getAttribute("href").split("?")[0];
    link.href = `${baseHref}?v=training-pane-2`;
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function syncMissionRobot(nextMission) {
  const syncedRobot = normalizeRobot({
    ...(nextMission.robot || {}),
    name: nextMission.robotName || nextMission.robot?.name || "Training Bot",
    robotWidthCm: nextMission.robotWidthCm,
    robotLengthCm: nextMission.robotLengthCm,
    offsetY: nextMission.offsetY,
    attachments: nextMission.attachments
  });

  return normalizeMission({
    ...nextMission,
    robotName: syncedRobot.name,
    robot: syncedRobot,
    robotWidthCm: syncedRobot.robotWidthCm,
    robotLengthCm: syncedRobot.robotLengthCm,
    offsetY: syncedRobot.offsetY,
    attachments: syncedRobot.attachments
  });
}

function setMissionValue(key, value) {
  mission = syncMissionRobot({ ...mission, [key]: value });
  robot = normalizeRobot(mission.robot);
}

function setRobotValue(key, value) {
  robot = normalizeRobot({ ...robot, [key]: value });
  if (mission) {
    mission = syncMissionRobot({
      ...mission,
      robotName: robot.name,
      robot,
      robotWidthCm: robot.robotWidthCm,
      robotLengthCm: robot.robotLengthCm,
      offsetY: robot.offsetY,
      attachments: robot.attachments
    });
  }
}

function setActionValue(actionIndex, value) {
  const actions = [...(mission?.actions || [])];
  if (!actions[actionIndex]) return;
  actions[actionIndex] = { ...actions[actionIndex], value };
  mission = normalizeMission({ ...mission, actions });
}

function setAttachmentValue(index, key, value) {
  const source = mission ? mission.attachments : robot.attachments;
  const attachments = [...source];
  if (!attachments[index]) return;
  attachments[index] = { ...attachments[index], [key]: value };

  if (mission) {
    mission = syncMissionRobot({ ...mission, attachments });
    robot = normalizeRobot(mission.robot);
  } else {
    robot = normalizeRobot({ ...robot, attachments });
  }
}

function isCompleteNumberText(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === "+" || text === "." || text === "-." || text === "+.") {
    return false;
  }
  return Number.isFinite(Number(text));
}

function configureDecimalInput(input) {
  input.type = "text";
  input.inputMode = "decimal";
}

function inputValueFor(control) {
  if (control.type === "missionNumber") return mission?.[control.key] ?? 0;
  if (control.type === "robotNumber" || control.type === "robotText") return robot?.[control.key] ?? "";
  if (control.type === "actionNumber") return mission?.actions?.[control.actionIndex]?.value ?? 0;
  if (control.type === "attachmentNumber") {
    const attachments = mission ? mission.attachments : robot.attachments;
    return attachments?.[control.index]?.[control.key] ?? 0;
  }
  return "";
}

function makeLabelText(label, unit) {
  return unit ? `${label} (${unit})` : label;
}

function renderControls() {
  dom.controls.innerHTML = "";

  lesson.controls.forEach((control) => {
    const wrap = document.createElement("label");
    wrap.textContent = makeLabelText(control.label, control.unit);

    if (control.type === "preset") {
      const row = document.createElement("div");
      row.className = "training-preset-row";
      control.values.forEach((value) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn-ghost";
        button.textContent = `${value}${control.unit ? ` ${control.unit}` : ""}`;
        button.addEventListener("click", () => {
          setMissionValue(control.key, value);
          renderControls();
          updatePreview(isOffsetLesson ? "start" : "finish");
        });
        row.appendChild(button);
      });
      wrap.appendChild(row);
      dom.controls.appendChild(wrap);
      return;
    }

    if (control.type === "attachmentSide") {
      const select = document.createElement("select");
      ["front", "rear", "left", "right"].forEach((side) => {
        const option = document.createElement("option");
        option.value = side;
        option.textContent = side;
        const attachments = mission ? mission.attachments : robot.attachments;
        if (attachments?.[control.index]?.side === side) option.selected = true;
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        setAttachmentValue(control.index, "side", select.value);
        updatePreview("finish");
      });
      wrap.appendChild(select);
      dom.controls.appendChild(wrap);
      return;
    }

    const input = document.createElement("input");
    input.type = "text";
    if (control.type !== "robotText") configureDecimalInput(input);
    input.value = String(inputValueFor(control));
    input.addEventListener("input", () => {
      if (control.type !== "robotText" && !isCompleteNumberText(input.value)) {
        updatePreview("current");
        return;
      }
      const value = control.type === "robotText" ? input.value : Number(input.value);
      if (control.type === "missionNumber") setMissionValue(control.key, value);
      if (control.type === "robotNumber" || control.type === "robotText") setRobotValue(control.key, value);
      if (control.type === "actionNumber") setActionValue(control.actionIndex, value);
      if (control.type === "attachmentNumber") setAttachmentValue(control.index, control.key, value);
      updatePreview("current");
    });
    input.addEventListener("blur", renderControls);
    wrap.appendChild(input);
    dom.controls.appendChild(wrap);
  });
}

function renderList(target, items) {
  target.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    target.appendChild(li);
  });
}

function simplifyLessonLayout() {
  const lessonPanel = document.querySelector(".training-lesson-panel");
  const sandboxTitle = document.querySelector(".training-sandbox-panel .section-title");
  const headings = lessonPanel ? Array.from(lessonPanel.querySelectorAll("h2")) : [];
  const resetRow = dom.reset?.closest(".button-row");

  if (sandboxTitle) sandboxTitle.textContent = "Effects";
  if (headings[0]) headings[0].textContent = "Steps";
  if (headings[1]) headings[1].textContent = "Try";
  if (lessonPanel && headings[1]) {
    lessonPanel.insertBefore(dom.controls, headings[1]);
    if (resetRow) lessonPanel.insertBefore(resetRow, headings[1]);
  }
}

function ensureStartButton() {
  if (dom.start || !dom.replayControls) return;

  const buttonRow = dom.replayControls.querySelector(".button-row");
  if (!buttonRow) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-primary";
  button.id = "lesson-start";
  button.textContent = "Start";
  buttonRow.insertBefore(button, buttonRow.firstChild);
  dom.start = button;
}

function ensureClearTracesButton() {
  if (!isOffsetLesson || dom.clearTraces || !dom.replayControls) return;

  const buttonRow = dom.replayControls.querySelector(".button-row");
  if (!buttonRow) return;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn-ghost";
  button.id = "lesson-clear-traces";
  button.textContent = "Clear Traces";
  buttonRow.appendChild(button);
  dom.clearTraces = button;
}

function renderNav() {
  const index = lessons.findIndex((candidate) => candidate.id === lesson.id);
  const prev = lessons[index - 1];
  const next = lessons[index + 1];

  if (prev) {
    dom.prev.href = `${prev.id}.html`;
    dom.prev.textContent = `Previous: ${prev.shortTitle}`;
  } else {
    dom.prev.href = "../training.html";
    dom.prev.textContent = "Training Hub";
  }

  if (next) {
    dom.next.href = `${next.id}.html`;
    dom.next.textContent = `Next: ${next.shortTitle}`;
  } else {
    dom.next.href = "../training.html";
    dom.next.textContent = "Training Hub";
  }
}

function offsetTraceColor(offsetY) {
  const rounded = Math.round(Number(offsetY || 0) * 10) / 10;
  if (rounded === 0) return "#0066b3";
  if (rounded === 4) return "#ed1c24";
  if (rounded === 8) return "#7d3c98";
  return "#f58220";
}

function persistOffsetTrace() {
  if (!isOffsetLesson || !fieldRenderer || !mission || !frames.length) return;
  fieldRenderer.addTraceOverlay(mission, frames, frames.length - 1, offsetTraceColor(mission.offsetY));
}

function setFrame(index) {
  if (!fieldRenderer || !mission || !frames.length) return;
  const safeIndex = Math.max(0, Math.min(index, frames.length - 1));
  dom.frameSlider.value = String(safeIndex);
  dom.frameCount.textContent = `${safeIndex} / ${frames.length - 1}`;
  fieldRenderer.renderFrameSequence(mission, frames, safeIndex);
}

function stopPlayback() {
  playback.playing = false;
  if (playback.rafId) {
    cancelAnimationFrame(playback.rafId);
  }
  playback.rafId = null;
  if (dom.start) dom.start.disabled = !frames.length;
}

function startPlayback() {
  if (!fieldRenderer || !mission || !frames.length || playback.playing) return;

  setFrame(0);
  playback.playing = true;
  dom.start.disabled = true;
  const startedAt = performance.now();

  function step(now) {
    if (!playback.playing) return;

    const elapsedMs = now - startedAt;
    const frameIndex = Math.min(
      frames.length - 1,
      Math.floor((elapsedMs / 1000) * playback.fps)
    );
    setFrame(frameIndex);

    if (frameIndex >= frames.length - 1) {
      persistOffsetTrace();
      stopPlayback();
      return;
    }

    playback.rafId = requestAnimationFrame(step);
  }

  playback.rafId = requestAnimationFrame(step);
}

function updatePreview(mode = "start") {
  stopPlayback();

  if (robotCanvas) {
    robotCanvas.setRobot(robot);
  }

  if (!fieldRenderer || !mission) return;

  frames = buildReplayFrames(mission, { fps: 20 });
  if (mission.actions.length) {
    dom.replayControls.style.display = "grid";
    dom.frameSlider.max = String(Math.max(0, frames.length - 1));
    if (dom.start) dom.start.disabled = !frames.length;
    const current = Number(dom.frameSlider.value || 0);
    if (mode === "finish") {
      setFrame(frames.length - 1);
    } else if (mode === "current") {
      setFrame(current);
    } else {
      setFrame(0);
    }
  } else {
    dom.replayControls.style.display = "none";
    if (dom.start) dom.start.disabled = true;
    dom.frameSlider.value = "0";
    dom.frameSlider.max = "0";
    dom.frameCount.textContent = "0 / 0";
    fieldRenderer.renderMission(mission);
  }
}

function resetLesson() {
  stopPlayback();
  mission = lesson.starterMission ? normalizeMission(clone(lesson.starterMission)) : null;
  robot = lesson.starterRobot ? normalizeRobot(clone(lesson.starterRobot)) : normalizeRobot(mission?.robot);
  renderControls();
  updatePreview("start");
}

async function init() {
  if (!lesson) {
    document.body.innerHTML = "<main class=\"panel\"><h1>Lesson not found</h1><p><a href=\"../training.html\">Back to Training</a></p></main>";
    return;
  }

  await refreshTrainingStylesheet();

  dom.eyebrow.textContent = "Task";
  dom.title.textContent = lesson.title;
  dom.objective.textContent = "";
  renderList(dom.steps, lesson.steps);
  renderList(dom.tryIt, lesson.tryIt);
  renderNav();
  simplifyLessonLayout();
  ensureStartButton();
  ensureClearTracesButton();

  const usesField = lesson.preview === "field" || lesson.preview === "robotAndField";
  const usesRobot = lesson.preview === "robot" || lesson.preview === "robotAndField";
  dom.fieldPanel.style.display = usesField ? "block" : "none";
  dom.robotPanel.style.display = usesRobot ? "block" : "none";
  dom.replayControls.style.display = "none";

  if (usesField) {
    fieldRenderer = new FieldRenderer(dom.fieldHost, "../field.svg");
    await fieldRenderer.load();
  }
  if (usesRobot) {
    robotCanvas = new RobotCanvas(dom.robotCanvas);
  }

  dom.reset.addEventListener("click", resetLesson);
  dom.frameSlider.addEventListener("input", () => {
    stopPlayback();
    setFrame(Number(dom.frameSlider.value || 0));
  });
  if (dom.start) dom.start.addEventListener("click", startPlayback);
  if (dom.clearTraces) {
    dom.clearTraces.addEventListener("click", () => {
      fieldRenderer?.clearTraceOverlays();
    });
  }
  dom.showStart.addEventListener("click", () => {
    stopPlayback();
    setFrame(0);
  });
  dom.showFinish.addEventListener("click", () => {
    stopPlayback();
    setFrame(frames.length - 1);
    persistOffsetTrace();
  });

  resetLesson();
}

init();
