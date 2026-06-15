import { DEFAULT_REPLAY_OPTIONS } from "./constants.js";

/**
 * @typedef {{side:"front"|"rear"|"left"|"right", widthCm:number, lengthCm:number, positionCm:number}} Attachment
 * @typedef {{type:"move"|"rotate"|"pause", value:number}} MissionAction
 * @typedef {{id:string, name:string, robotColor:string, robotWidthCm:number, robotLengthCm:number, offsetY:number, attachments:Attachment[]}} RobotProfile
 * @typedef {{name:string, robotName:string, robot:RobotProfile, startX:number, startY:number, startAngle:number, traceColor:string, robotColor:string, robotWidthCm:number, robotLengthCm:number, offsetY:number, attachments:Attachment[], actions:MissionAction[]}} Mission
 * @typedef {{x:number, y:number, headingDeg:number, turnCenterX:number, turnCenterY:number}} Pose
 */

function safeNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angleDeg) {
  const value = safeNum(angleDeg, 0);
  return ((value % 360) + 360) % 360;
}

function normalizeColorToHex(colorStr, fallback = "#0066b3") {
  const raw = String(colorStr || "").trim();
  if (!raw) return fallback;

  const shortHexMatch = raw.match(/^#([\da-f]{3})$/i);
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  const hexMatch = raw.match(/^#([\da-f]{6})$/i);
  if (hexMatch) {
    return `#${hexMatch[1].toLowerCase()}`;
  }

  const rgbMatch = raw.match(
    /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i
  );
  if (!rgbMatch) return fallback;

  const toHex = (segment) => {
    const clamped = clamp(parseInt(segment, 10), 0, 255);
    return clamped.toString(16).padStart(2, "0");
  };

  return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
}

function normalizeAttachments(list) {
  const attachments = Array.isArray(list) ? list : [];
  return attachments
    .map((attachment) => ({
      side: String(attachment?.side || "").toLowerCase(),
      widthCm: safeNum(attachment?.widthCm, 0),
      lengthCm: safeNum(attachment?.lengthCm, 0),
      positionCm: safeNum(attachment?.positionCm, 0)
    }))
    .filter((attachment) => ["front", "rear", "left", "right"].includes(attachment.side));
}

function normalizeActions(list) {
  const actions = Array.isArray(list) ? list : [];
  return actions
    .map((action) => ({
      type: String(action?.type || "").toLowerCase(),
      value: safeNum(action?.value, 0)
    }))
    .filter((action) => action.type === "move" || action.type === "rotate" || action.type === "pause");
}

function normalizeRobot(raw) {
  const source = raw || {};
  return {
    id: String(source.id || ""),
    name: String(source.name || "Untitled Robot"),
    robotColor: normalizeColorToHex(source.robotColor, "#0066b3"),
    robotWidthCm: safeNum(source.robotWidthCm, 12.7),
    robotLengthCm: safeNum(source.robotLengthCm, 20.5),
    offsetY: safeNum(source.offsetY, 0),
    attachments: normalizeAttachments(source.attachments || [])
  };
}

function normalizeMission(raw) {
  const source = raw || {};
  const robotSource = source.robot || {};
  const robotName = String(source.robotName || robotSource.name || "");
  const robotWidthCm = safeNum(source.robotWidthCm ?? robotSource.robotWidthCm, 12.7);
  const robotLengthCm = safeNum(source.robotLengthCm ?? robotSource.robotLengthCm, 20.5);
  const offsetY = safeNum(source.offsetY ?? robotSource.offsetY, 0);
  const robotColor = normalizeColorToHex(source.robotColor ?? robotSource.robotColor, "#0066b3");
  const attachments = normalizeAttachments(source.attachments || robotSource.attachments || []);
  const robot = normalizeRobot({
    ...robotSource,
    name: robotName || robotSource.name || "Mission Robot",
    robotColor,
    robotWidthCm,
    robotLengthCm,
    offsetY,
    attachments
  });

  return {
    name: String(source.name || "Untitled Mission"),
    robotName: robot.name,
    robot,
    startX: safeNum(source.startX, 0),
    startY: safeNum(source.startY, 0),
    startAngle: normalizeAngle(source.startAngle),
    traceColor: normalizeColorToHex(source.traceColor, "#0066b3"),
    robotColor: robot.robotColor,
    robotWidthCm: robot.robotWidthCm,
    robotLengthCm: robot.robotLengthCm,
    offsetY: robot.offsetY,
    attachments: robot.attachments,
    actions: normalizeActions(source.actions || [])
  };
}

function createDefaultMission() {
  return normalizeMission({
    name: "Demo Mission",
    startX: 0,
    startY: 0,
    startAngle: 90,
    traceColor: "#0066b3",
    robotColor: "#0066b3",
    robotWidthCm: 12.7,
    robotLengthCm: 20.5,
    offsetY: 6.1,
    attachments: [
      { side: "front", widthCm: 6, lengthCm: 5, positionCm: 0 },
      { side: "left", widthCm: 4, lengthCm: 10, positionCm: 3 }
    ],
    actions: [
      { type: "move", value: 50 },
      { type: "rotate", value: -90 },
      { type: "pause", value: 3 },
      { type: "move", value: 30 }
    ]
  });
}

function createBlankMission() {
  return normalizeMission({
    name: "New Mission",
    startX: 0,
    startY: 0,
    startAngle: 90,
    traceColor: "#0066b3",
    robotColor: "#0066b3",
    robotWidthCm: 12.7,
    robotLengthCm: 20.5,
    offsetY: 0,
    attachments: [],
    actions: []
  });
}

function createDefaultRobot() {
  return normalizeRobot({
    name: "Default Robot",
    robotColor: "#0066b3",
    robotWidthCm: 12.7,
    robotLengthCm: 20.5,
    offsetY: 6.1,
    attachments: []
  });
}

function applyRobotToMission(missionLike, robotLike) {
  const mission = normalizeMission(missionLike);
  const robot = normalizeRobot(robotLike);
  return normalizeMission({
    ...mission,
    robotName: robot.name,
    robot,
    robotColor: robot.robotColor,
    robotWidthCm: robot.robotWidthCm,
    robotLengthCm: robot.robotLengthCm,
    offsetY: robot.offsetY,
    attachments: robot.attachments
  });
}

function getAttachmentRectCm(attachmentLike, robotLike) {
  const attachment = normalizeAttachments([attachmentLike])[0];
  const robot = normalizeRobot(robotLike);
  if (!attachment) return null;

  const halfWidth = robot.robotWidthCm / 2;
  const halfLength = robot.robotLengthCm / 2;
  const width = attachment.widthCm;
  const length = attachment.lengthCm;

  if (attachment.side === "front") {
    return {
      xMin: attachment.positionCm - width / 2,
      yMin: halfLength,
      width,
      height: length
    };
  }
  if (attachment.side === "rear") {
    return {
      xMin: attachment.positionCm - width / 2,
      yMin: -halfLength - length,
      width,
      height: length
    };
  }
  if (attachment.side === "left") {
    return {
      xMin: -halfWidth - length,
      yMin: attachment.positionCm - width / 2,
      width: length,
      height: width
    };
  }
  if (attachment.side === "right") {
    return {
      xMin: halfWidth,
      yMin: attachment.positionCm - width / 2,
      width: length,
      height: width
    };
  }

  return null;
}

function computeRobotLocalBoundsCm(robotLike) {
  const robot = normalizeRobot(robotLike);
  const bounds = {
    xMin: -robot.robotWidthCm / 2,
    xMax: robot.robotWidthCm / 2,
    yMin: -robot.robotLengthCm / 2,
    yMax: robot.robotLengthCm / 2
  };

  robot.attachments.forEach((attachment) => {
    const rect = getAttachmentRectCm(attachment, robot);
    if (!rect) return;
    bounds.xMin = Math.min(bounds.xMin, rect.xMin);
    bounds.xMax = Math.max(bounds.xMax, rect.xMin + rect.width);
    bounds.yMin = Math.min(bounds.yMin, rect.yMin);
    bounds.yMax = Math.max(bounds.yMax, rect.yMin + rect.height);
  });

  return bounds;
}

function clampAttachmentPositionCm(robotLike, attachmentLike, nextPosition) {
  const robot = normalizeRobot(robotLike);
  const attachment = normalizeAttachments([attachmentLike])[0];
  if (!attachment) return safeNum(nextPosition, 0);

  const halfWidth = robot.robotWidthCm / 2;
  const halfLength = robot.robotLengthCm / 2;

  if (attachment.side === "front" || attachment.side === "rear") {
    const travelHalf = Math.max(0, halfWidth - attachment.widthCm / 2);
    return clamp(safeNum(nextPosition, 0), -travelHalf, travelHalf);
  }

  const travelHalf = Math.max(0, halfLength - attachment.widthCm / 2);
  return clamp(safeNum(nextPosition, 0), -travelHalf, travelHalf);
}

function getRobotFootprintHalfExtentsCm(robotLike, headingDeg) {
  const robot = normalizeRobot(robotLike);
  const radians = (normalizeAngle(headingDeg) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: Math.abs(cos) * (robot.robotLengthCm / 2) + Math.abs(sin) * (robot.robotWidthCm / 2),
    y: Math.abs(sin) * (robot.robotLengthCm / 2) + Math.abs(cos) * (robot.robotWidthCm / 2)
  };
}

function computeStartPoseCm(missionLike) {
  const mission = normalizeMission(missionLike);
  const bounds = getRobotFootprintHalfExtentsCm(mission, mission.startAngle);
  const headingDeg = normalizeAngle(mission.startAngle);
  const radians = (headingDeg * Math.PI) / 180;
  const x = mission.startX + bounds.x;
  const y = mission.startY + bounds.y;
  const turnCenterX = x - Math.cos(radians) * mission.offsetY;
  const turnCenterY = y - Math.sin(radians) * mission.offsetY;

  return {
    x,
    y,
    headingDeg,
    turnCenterX,
    turnCenterY
  };
}

function poseToTracePointCm(poseLike, missionLike) {
  const mission = missionLike ? normalizeMission(missionLike) : null;
  const pose = {
    x: safeNum(poseLike?.x, 0),
    y: safeNum(poseLike?.y, 0),
    headingDeg: normalizeAngle(poseLike?.headingDeg ?? poseLike?.angle ?? 0),
    turnCenterX: safeNum(poseLike?.turnCenterX, NaN),
    turnCenterY: safeNum(poseLike?.turnCenterY, NaN)
  };

  if (Number.isFinite(pose.turnCenterX) && Number.isFinite(pose.turnCenterY)) {
    return { x: pose.turnCenterX, y: pose.turnCenterY };
  }

  if (!mission) return { x: pose.x, y: pose.y };

  const radians = (pose.headingDeg * Math.PI) / 180;
  return {
    x: pose.x - Math.cos(radians) * mission.offsetY,
    y: pose.y - Math.sin(radians) * mission.offsetY
  };
}

function buildReplayFrames(missionLike, options = {}) {
  const mission = normalizeMission(missionLike);
  const replayOptions = { ...DEFAULT_REPLAY_OPTIONS, ...options };
  const fps = Math.max(1, safeNum(replayOptions.fps, DEFAULT_REPLAY_OPTIONS.fps));
  const moveSpeed = Math.max(0.01, safeNum(replayOptions.moveSpeedCmPerSec, DEFAULT_REPLAY_OPTIONS.moveSpeedCmPerSec));
  const rotateSpeed = Math.max(0.01, safeNum(replayOptions.rotateSpeedDegPerSec, DEFAULT_REPLAY_OPTIONS.rotateSpeedDegPerSec));
  const dtMs = 1000 / fps;

  const frames = [];
  let current = computeStartPoseCm(mission);
  frames.push({ ...current });

  mission.actions.forEach((action, actionIndex) => {
    if (action.type === "move") {
      const distanceCm = safeNum(action.value, 0);
      const durationMs = (Math.abs(distanceCm) / moveSpeed) * 1000;
      const steps = Math.max(1, Math.round(durationMs / dtMs));
      const radians = (current.headingDeg * Math.PI) / 180;
      const dx = Math.cos(radians) * distanceCm;
      const dy = Math.sin(radians) * distanceCm;
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        frames.push({
          x: current.x + dx * t,
          y: current.y + dy * t,
          headingDeg: current.headingDeg,
          turnCenterX: current.turnCenterX + dx * t,
          turnCenterY: current.turnCenterY + dy * t
        });
      }
      current = frames[frames.length - 1];
    }

    if (action.type === "pause") {
      const pauseSeconds = Math.max(0, safeNum(action.value, 0));
      const steps = Math.max(1, Math.round((pauseSeconds * 1000) / dtMs));
      for (let step = 1; step <= steps; step += 1) {
        frames.push({ ...current, pauseActionIndex: actionIndex });
      }
    }

    if (action.type === "rotate") {
      const deltaDeg = safeNum(action.value, 0);
      const durationMs = (Math.abs(deltaDeg) / rotateSpeed) * 1000;
      const steps = Math.max(1, Math.round(durationMs / dtMs));
      const turnCenterX = current.turnCenterX;
      const turnCenterY = current.turnCenterY;
      const startHeadingDeg = current.headingDeg;

      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        const headingDeg = normalizeAngle(startHeadingDeg + deltaDeg * t);
        const radians = (headingDeg * Math.PI) / 180;
        frames.push({
          x: turnCenterX + Math.cos(radians) * mission.offsetY,
          y: turnCenterY + Math.sin(radians) * mission.offsetY,
          headingDeg,
          turnCenterX,
          turnCenterY
        });
      }
      current = frames[frames.length - 1];
    }
  });

  return frames;
}

export {
  applyRobotToMission,
  buildReplayFrames,
  clamp,
  clampAttachmentPositionCm,
  computeRobotLocalBoundsCm,
  computeStartPoseCm,
  createBlankMission,
  createDefaultMission,
  createDefaultRobot,
  getAttachmentRectCm,
  getRobotFootprintHalfExtentsCm,
  normalizeActions,
  normalizeAngle,
  normalizeAttachments,
  normalizeColorToHex,
  normalizeMission,
  normalizeRobot,
  poseToTracePointCm,
  safeNum
};
