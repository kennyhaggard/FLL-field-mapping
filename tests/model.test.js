import test from "node:test";
import assert from "node:assert/strict";

import {
  applyRobotToMission,
  buildReplayFrames,
  computeBearingMove,
  computeStartPoseCm,
  convertMissionGlobalZeroDirection,
  convertMissionHeadingMode,
  createBlankMission,
  fieldAngleToGlobalHeading,
  globalHeadingToFieldAngle,
  normalizeColorToHex,
  normalizeMission,
  normalizeRobot,
  poseToTracePointCm,
  rotationDeltaDeg
} from "../js/domain/model.js";

test("computeBearingMove returns the shortest turn and distance", () => {
  const northeast = computeBearingMove({ x: 10, y: 10 }, { x: 13, y: 14 }, 350);
  assert.equal(Number(northeast.headingDeg.toFixed(3)), 53.13);
  assert.equal(Number(northeast.turnDeg.toFixed(3)), 63.13);
  assert.equal(northeast.distanceCm, 5);

  const west = computeBearingMove({ x: 0, y: 0 }, { x: -10, y: 0 }, 270);
  assert.equal(west.headingDeg, 180);
  assert.equal(west.turnDeg, -90);
  assert.equal(west.distanceCm, 10);
});

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
  assert.equal(mission.attachments[0].description, "");
});

test("normalizeMission rounds displayed and saved angles to one decimal place", () => {
  const mission = normalizeMission({
    startAngle: 36.10000000000002,
    actions: [
      { type: "rotate", value: -36.10000000000002 },
      { type: "move", value: 36.10000000000002 }
    ]
  });

  assert.equal(mission.startAngle, 36.1);
  assert.deepEqual(mission.actions, [
    { type: "rotate", value: -36.1 },
    { type: "move", value: 36.10000000000002 }
  ]);
  assert.match(JSON.stringify(mission), /"value":-36\.1/);
});

test("attachment descriptions are trimmed and preserved", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    attachments: [
      { description: "  Left sweeper  ", side: "left", widthCm: 4, lengthCm: 8, positionCm: 0 }
    ]
  });

  assert.equal(mission.attachments[0].description, "Left sweeper");
  assert.equal(mission.robot.attachments[0].description, "Left sweeper");
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

  assert.equal(globalHeadingToFieldAngle(0, "upfield"), 90);
  assert.equal(globalHeadingToFieldAngle(0, "right"), 0);
  assert.equal(globalHeadingToFieldAngle(0, "downfield"), 270);
  assert.equal(globalHeadingToFieldAngle(0, "left"), 180);
});

test("changing global zero direction preserves the physical route", () => {
  const upfieldMission = normalizeMission({
    ...createBlankMission(),
    headingMode: "global",
    globalZeroDirection: "upfield",
    startAngle: 0,
    actions: [
      { type: "move", value: 12 },
      { type: "rotate", value: 90 },
      { type: "move", value: 8 }
    ]
  });
  const rightMission = convertMissionGlobalZeroDirection(upfieldMission, "right");

  assert.equal(rightMission.globalZeroDirection, "right");
  assert.equal(rightMission.startAngle, -90);
  assert.equal(rightMission.actions[1].value, 0);
  const roundFrames = (frames) => frames.map((frame) => Object.fromEntries(
    Object.entries(frame).map(([key, value]) => [
      key,
      typeof value === "number" ? Number(value.toFixed(9)) : value
    ])
  ));
  assert.deepEqual(roundFrames(buildReplayFrames(rightMission)), roundFrames(buildReplayFrames(upfieldMission)));
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

test("global rotations can use the alternate path", () => {
  const startHeadingDeg = globalHeadingToFieldAngle(0);

  assert.equal(rotationDeltaDeg(startHeadingDeg, 90, "global", "upfield"), -90);
  assert.equal(rotationDeltaDeg(startHeadingDeg, 90, "global", "upfield", true), 270);
  assert.equal(rotationDeltaDeg(startHeadingDeg, -90, "global", "upfield"), 90);
  assert.equal(rotationDeltaDeg(startHeadingDeg, -90, "global", "upfield", true), -270);
  assert.equal(rotationDeltaDeg(startHeadingDeg, 180, "global", "upfield"), -180);
  assert.equal(rotationDeltaDeg(startHeadingDeg, 180, "global", "upfield", true), 180);
  assert.equal(rotationDeltaDeg(startHeadingDeg, 0, "global", "upfield"), 0);
  assert.equal(rotationDeltaDeg(startHeadingDeg, 0, "global", "upfield", true), 360);
});

test("global turn direction is calculated from the heading entering each block", () => {
  const startHeadingDeg = globalHeadingToFieldAngle(0);
  const firstDeltaDeg = rotationDeltaDeg(startHeadingDeg, 90, "global", "upfield");
  const secondIncomingHeadingDeg = startHeadingDeg + firstDeltaDeg;

  assert.equal(firstDeltaDeg, -90);
  assert.equal(rotationDeltaDeg(secondIncomingHeadingDeg, 0, "global", "upfield"), 90);
  assert.equal(rotationDeltaDeg(secondIncomingHeadingDeg, 0, "global", "upfield", true), -270);
});

test("alternate global turns are preserved in mission JSON and replay", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    headingMode: "global",
    startAngle: 0,
    actions: [{ type: "rotate", value: 90, alternateTurn: true }]
  });
  const frames = buildReplayFrames(mission, { fps: 1, rotateSpeedDegPerSec: 90 });

  assert.deepEqual(mission.actions, [{ type: "rotate", value: 90, alternateTurn: true }]);
  assert.equal(frames.length, 4);
  assert.equal(frames[frames.length - 1].headingDeg, 0);
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

test("switching modes preserves an alternate global turn", () => {
  const relativeMission = normalizeMission({
    ...createBlankMission(),
    headingMode: "relative",
    startAngle: 90,
    actions: [{ type: "rotate", value: 270 }]
  });
  const globalMission = convertMissionHeadingMode(relativeMission, "global");
  const roundTripMission = convertMissionHeadingMode(globalMission, "relative");

  assert.deepEqual(globalMission.actions, [
    { type: "rotate", value: 90, alternateTurn: true }
  ]);
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

test("change attachment actions default to all and normalize selected indexes", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    actions: [
      { type: "change-attachment" },
      { type: "change-attachment", attachmentIndexes: [] },
      { type: "change-attachment", attachmentIndexes: [1, 0, 1, -1, 2.5] }
    ]
  });

  assert.deepEqual(mission.actions, [
    { type: "change-attachment", attachmentIndexes: "all" },
    { type: "change-attachment", attachmentIndexes: [] },
    { type: "change-attachment", attachmentIndexes: [1, 0] }
  ]);
});

test("buildReplayFrames applies attachment visibility from its change step onward", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    attachments: [
      { side: "front", widthCm: 4, lengthCm: 4, positionCm: 0 },
      { side: "left", widthCm: 4, lengthCm: 6, positionCm: 0 }
    ],
    actions: [
      { type: "move", value: 1 },
      { type: "change-attachment", attachmentIndexes: [1] },
      { type: "move", value: 1 }
    ]
  });
  const frames = buildReplayFrames(mission, { fps: 1, moveSpeedCmPerSec: 1 });
  const changeFrameIndex = frames.findIndex((frame) => frame.attachmentActionIndex === 1);

  assert.equal(frames[0].visibleAttachmentIndexes, "all");
  assert.ok(changeFrameIndex > 0);
  assert.deepEqual(frames[changeFrameIndex].visibleAttachmentIndexes, [1]);
  frames.slice(changeFrameIndex).forEach((frame) => {
    assert.deepEqual(frame.visibleAttachmentIndexes, [1]);
  });
});

test("buildReplayFrames starts with the mission default attachments", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    defaultAttachmentIndexes: [1],
    attachments: [
      { side: "front", widthCm: 4, lengthCm: 4, positionCm: 0 },
      { side: "left", widthCm: 4, lengthCm: 6, positionCm: 0 }
    ],
    actions: [{ type: "move", value: 1 }]
  });
  const frames = buildReplayFrames(mission, { fps: 1, moveSpeedCmPerSec: 1 });

  assert.deepEqual(mission.defaultAttachmentIndexes, [1]);
  frames.forEach((frame) => assert.deepEqual(frame.visibleAttachmentIndexes, [1]));
  assert.equal(normalizeMission(createBlankMission()).defaultAttachmentIndexes, "all");
});

test("buildReplayFrames supports no attachments at start and after a change", () => {
  const mission = normalizeMission({
    ...createBlankMission(),
    defaultAttachmentIndexes: [],
    attachments: [
      { side: "front", widthCm: 4, lengthCm: 4, positionCm: 0 }
    ],
    actions: [
      { type: "move", value: 1 },
      { type: "change-attachment", attachmentIndexes: "all" },
      { type: "change-attachment", attachmentIndexes: [] }
    ]
  });
  const frames = buildReplayFrames(mission, { fps: 1, moveSpeedCmPerSec: 1 });

  assert.deepEqual(mission.defaultAttachmentIndexes, []);
  assert.deepEqual(frames[0].visibleAttachmentIndexes, []);
  assert.deepEqual(frames.at(-1).visibleAttachmentIndexes, []);
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
