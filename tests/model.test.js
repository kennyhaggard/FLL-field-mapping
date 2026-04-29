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
      robotWidthCm: 14,
      robotLengthCm: 21,
      offsetY: 4,
      attachments: [{ side: "front", widthCm: 5, lengthCm: 4, positionCm: 0 }]
    }
  });

  assert.equal(mission.robotName, "Nested Bot");
  assert.equal(mission.robotWidthCm, 14);
  assert.equal(mission.attachments.length, 1);
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
    robotWidthCm: 16,
    robotLengthCm: 18,
    offsetY: 3,
    attachments: [{ side: "left", widthCm: 4, lengthCm: 8, positionCm: 0 }]
  });

  const nextMission = applyRobotToMission(mission, robot);
  assert.equal(nextMission.robotName, "Sweeper");
  assert.equal(nextMission.robotWidthCm, 16);
  assert.equal(nextMission.attachments[0].side, "left");
});
