import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultMission } from "../js/domain/model.js";
import { createFieldSnapshot, hasPendingFieldChanges } from "../js/domain/mission_preview.js";

test("the displayed mission is independent of later editor mutations", () => {
  const draft = createDefaultMission();
  const displayed = createFieldSnapshot(draft);
  draft.actions[0].value = 12;
  draft.attachments[0].widthCm = 9;
  assert.equal(displayed.actions[0].value, 50);
  assert.equal(displayed.attachments[0].widthCm, 6);
  assert.equal(hasPendingFieldChanges(draft, displayed), true);
});

test("motion, start pose, robot, attachment and color changes wait for publication", () => {
  const draft = createDefaultMission();
  const displayed = createFieldSnapshot(draft);
  for (const update of [
    { startX: 4 }, { startY: 4 }, { startAngle: 20 }, { robotWidthCm: 23 },
    { offsetY: 1 }, { attachments: [] }, { actions: [] },
    { defaultAttachmentIndexes: [] }, { traceColor: "#123456" }, { robotColor: "#123456" }
  ]) assert.equal(hasPendingFieldChanges({ ...draft, ...update }, displayed), true);
  assert.equal(hasPendingFieldChanges(draft, createFieldSnapshot(draft)), false);
});

test("names and immediate dock setup do not mark the route preview stale", () => {
  const draft = createDefaultMission();
  const displayed = createFieldSnapshot(draft);
  assert.equal(hasPendingFieldChanges({ ...draft, name: "Renamed", robotName: "Another name" }, displayed), false);
  const setup = { city: "m13", farm: "m14", mine: "m15" };
  assert.equal(hasPendingFieldChanges({ ...draft, fieldSetup: setup }, displayed), false);
  assert.deepEqual(createFieldSnapshot(displayed, setup).fieldSetup, setup);
});
