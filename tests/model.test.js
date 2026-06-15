import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRobotToMission,
  buildReplayFrames,
  computeStartPoseCm,
  createBlankMission,
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
