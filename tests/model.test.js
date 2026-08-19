import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRobotToMission,
  buildReplayFrames,
  computeStartPoseCm,
  convertMissionHeadingMode,
  createBlankMission,
  fieldAngleToGlobalHeading,
  globalHeadingToFieldAngle,
  normalizeColorToHex,
  normalizeMission,
  normalizeRobot,
  poseToTracePointCm
} from "../js/domain/model.js";

test("normalize mission uses nested robot profile values", () => {
  const mission = normalizeMission({
    name: "Nested",
    robot: {
      name: "Nested Bot",
      robotColor: "#f58220",
      robotWidthCm: 14,
      robotLengthCm: 21,
      offsetY: 4,
      attachments: [{ side: "front", widthCm: 5, lengthCm: 4, positionCm: 0 }]
    }
  });

  assert.equal(mission.robotName, "Nested Bot");
  assert.equal(mission.robot.name, "Nested Bot");
  assert.equal(mission.robotColor, "#f58220");
  assert.equal(mission.robot.robotColor, "#f58220");
  assert.equal(mission.robotWidthCm, 14);
  assert.equal(mission.robot.robotWidthCm, 14);
  assert.equal(mission.attachments.length, 1);
  assert.equal(mission.robot.attachments.length, 1);
});

test("normalizeMission preserves a robot snapshot for flat mission fields", () => {
  const mission = normalizeMission({
    name: "Flat",
    robotName: "Flat Bot",
    robotColor: "rgb(237, 28, 36)",
    robotWidthCm: 15,
    robotLengthCm: 20,
    offsetY: 2,
    attachments: [{ side: "rear", widthCm: 4, lengthCm: 5, positionCm: 1 }]
  });

  assert.equal(mission.robot.name, "Flat Bot");
  assert.equal(mission.robotColor, "#ed1c24");
  assert.equal(mission.robot.robotColor, "#ed1c24");
  assert.equal(mission.robot.robotWidthCm, 15);
  assert.equal(mission.robot.robotLengthCm, 20);
  assert.equal(mission.robot.offsetY, 2);
  assert.deepEqual(mission.robot.attachments, mission.attachments);
});

test("normalizeColorToHex keeps hex stable and expands rgb values", () => {
  assert.equal(normalizeColorToHex("#abc"), "#aabbcc");
  assert.equal(normalizeColorToHex("rgb(16, 131, 104)"), "#108368");
  assert.equal(normalizeColorToHex("bad", "#123456"), "#123456");
});

test("global headings map to the field's cardinal angles", () => {
  assert.equal(globalHeadingToFieldAngle(0), 90);
  assert.equal(globalHeadingToFieldAngle(90), 0);
  assert.equal(globalHeadingToFieldAngle(-90), 180);
  assert.equal(globalHeadingToFieldAngle(180), 270);

  assert.equal(fieldAngleToGlobalHeading(90), 0);
  assert.equal(fieldAngleToGlobalHeading(0), 90);
  assert.equal(fieldAngleToGlobalHeading(180), -90);
  assert.equal(fieldAngleToGlobalHeading(270), 180);
});

test("global starting headings use the same physical placement as relative angles", () => {
  const base = {
    ...createBlankMission(),
    startX: 12,
    startY: 8,
    robotWidthCm: 14,
    robotLengthCm: 22,
    offsetY: 5
  };
  const relativeStart = computeStartPoseCm({ ...base, headingMode: "relative", startAngle: 90 });
  const globalStart = computeStartPoseCm({ ...base, headingMode: "global", startAngle: 0 });

  assert.deepEqual(globalStart, relativeStart);
});

test("buildReplayFrames keeps turn center fixed during rotation", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    startAngle: 0,
    offsetY: 6,
    actions: [{ type: "rotate", value: 90 }]
  });

  const start = computeStartPoseCm(mission);
  const frames = buildReplayFrames(mission, { fps: 30, rotateSpeedDegPerSec: 90 });
  const end = frames[frames.length - 1];

  assert.equal(start.turnCenterX, end.turnCenterX);
  assert.equal(start.turnCenterY, end.turnCenterY);
  assert.equal(end.headingDeg, 90);
  assert.equal(Number(end.x.toFixed(3)), Number(start.turnCenterX.toFixed(3)));
  assert.equal(Number(end.y.toFixed(3)), Number((start.turnCenterY + 6).toFixed(3)));
});

test("global rotations target absolute headings", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    headingMode: "global",
    startAngle: 0,
    offsetY: 4,
    actions: [
      { type: "rotate", value: 90 },
      { type: "move", value: 10 },
      { type: "rotate", value: -90 }
    ]
  });

  const start = computeStartPoseCm(mission);
  const frames = buildReplayFrames(mission, {
    fps: 10,
    moveSpeedCmPerSec: 10,
    rotateSpeedDegPerSec: 90
  });
  const end = frames[frames.length - 1];

  assert.equal(start.headingDeg, 90);
  assert.equal(end.headingDeg, 180);
  assert.equal(Number(end.turnCenterX.toFixed(3)), Number((start.turnCenterX + 10).toFixed(3)));
  assert.equal(Number(end.turnCenterY.toFixed(3)), Number(start.turnCenterY.toFixed(3)));
});

test("an exact 180-degree global turn follows the positive clockwise convention", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    headingMode: "global",
    startAngle: 0,
    actions: [{ type: "rotate", value: 180 }]
  });
  const frames = buildReplayFrames(mission, { fps: 2, rotateSpeedDegPerSec: 180 });

  assert.equal(frames[1].headingDeg, 0);
  assert.equal(frames[frames.length - 1].headingDeg, 270);
});

test("switching heading modes converts common routes without changing replay frames", () => {
  const relativeMission = normalizeMission({
    ...createBlankMission(),
    headingMode: "relative",
    startAngle: 90,
    offsetY: 3,
    actions: [
      { type: "move", value: 12 },
      { type: "rotate", value: -90 },
      { type: "move", value: 8 },
      { type: "rotate", value: 90 }
    ]
  });
  const globalMission = convertMissionHeadingMode(relativeMission, "global");
  const roundTripMission = convertMissionHeadingMode(globalMission, "relative");

  assert.equal(globalMission.startAngle, 0);
  assert.deepEqual(
    globalMission.actions.filter((action) => action.type === "rotate").map((action) => action.value),
    [90, 0]
  );
  assert.deepEqual(roundTripMission.actions, relativeMission.actions);
  assert.deepEqual(buildReplayFrames(globalMission), buildReplayFrames(relativeMission));
});

test("normalizeMission keeps pause actions", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    actions: [
      { type: "pause", value: 2 },
      { type: "bad", value: 99 }
    ]
  });

  assert.deepEqual(mission.actions, [{ type: "pause", value: 2 }]);
});

test("buildReplayFrames holds pose and tags frames during pause", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    actions: [
      { type: "move", value: 10 },
      { type: "pause", value: 2 },
      { type: "move", value: 10 }
    ]
  });

  const frames = buildReplayFrames(mission, { fps: 2, moveSpeedCmPerSec: 10 });
  const pauseFrames = frames.filter((frame) => frame.pauseActionIndex === 1);

  assert.equal(pauseFrames.length, 4);
  pauseFrames.forEach((frame) => {
    assert.equal(frame.x, pauseFrames[0].x);
    assert.equal(frame.y, pauseFrames[0].y);
    assert.equal(frame.headingDeg, pauseFrames[0].headingDeg);
    assert.equal(frame.turnCenterX, pauseFrames[0].turnCenterX);
    assert.equal(frame.turnCenterY, pauseFrames[0].turnCenterY);
  });
});

test("poseToTracePointCm resolves to turn center", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    startAngle: 90,
    offsetY: 5
  });
  const start = computeStartPoseCm(mission);
  const tracePoint = poseToTracePointCm(start, mission);

  assert.deepEqual(tracePoint, {
    x: start.turnCenterX,
    y: start.turnCenterY
  });
});

test("applyRobotToMission replaces robot geometry and attachments", () => {
  const mission = normalizeMission(createBlankMission());
  const robot = normalizeRobot({
    name: "Sweeper",
    robotColor: "#7d3c98",
    robotWidthCm: 16,
    robotLengthCm: 18,
    offsetY: 3,
    attachments: [{ side: "left", widthCm: 4, lengthCm: 8, positionCm: 0 }]
  });

  const nextMission = applyRobotToMission(mission, robot);
  assert.equal(nextMission.robotName, "Sweeper");
  assert.equal(nextMission.robot.name, "Sweeper");
  assert.equal(nextMission.robotColor, "#7d3c98");
  assert.equal(nextMission.robot.robotColor, "#7d3c98");
  assert.equal(nextMission.robotWidthCm, 16);
  assert.equal(nextMission.robot.robotWidthCm, 16);
  assert.equal(nextMission.attachments[0].side, "left");
  assert.equal(nextMission.robot.attachments[0].side, "left");
});
