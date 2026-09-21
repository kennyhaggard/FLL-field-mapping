import test from "node:test";
import assert from "node:assert/strict";
import { createBlankMission, normalizeMission } from "../js/domain/model.js";
import { createMissionDocument, hasMissionChanges, parseMissionFile, missionFilename } from "../js/domain/mission_document.js";

test("only mission content changes make the document dirty, and reverting clears it", () => {
  const mission = createBlankMission();
  const document = createMissionDocument(mission, { kind: "shared" });
  assert.equal(hasMissionChanges(document, mission), false);
  assert.equal(hasMissionChanges(document, { ...mission, name: "Edited" }), true);
  assert.equal(hasMissionChanges(document, { ...mission, fieldSetup: { city: "m13", farm: "m15", mine: "m14" } }), true);
  assert.equal(hasMissionChanges(document, { ...mission, fieldConfirmed: true }), false);
  assert.equal(hasMissionChanges(document, mission), false);
});

test("a completed cloud save checkpoints its snapshot rather than newer edits", () => {
  const sent = createBlankMission();
  const newer = { ...sent, actions: [{ type: "move", value: 20 }] };
  const document = createMissionDocument(sent, { kind: "cloud", team: "Team A", name: sent.name });
  assert.equal(hasMissionChanges(document, newer), true);
  assert.equal(hasMissionChanges(document, sent), false);
});

test("mission files round-trip robot, setup and actions, including old envelopes", () => {
  const mission = normalizeMission({ name: "Team 🌱", actions: [{ type: "move", value: -20 }], fieldSetup: { city: "m14", farm: "m15", mine: "m13" } });
  assert.deepEqual(parseMissionFile(JSON.stringify(mission)), mission);
  assert.deepEqual(parseMissionFile(JSON.stringify({ version: 3, mission })), mission);
});

test("file import rejects non-missions and oversized previews without allocating frames", () => {
  for (const text of ["bad json", "null", "[]", "{}", '{"name":"robot"}']) assert.throws(() => parseMissionFile(text));
  assert.throws(() => parseMissionFile(JSON.stringify({ actions: [{ type: "pause", value: 1e8 }] })), /too large/);
  assert.throws(() => parseMissionFile(JSON.stringify({ actions: [], name: "x".repeat(96000) })), /96 KB/);
  assert.throws(() => parseMissionFile(JSON.stringify({ actions: Array(501).fill({ type: "pause", value: 0 }) })), /too large/);
});

test("download names are safe filenames", () => {
  assert.equal(missionFilename('Team/One: run?'), 'Team-One- run-.json');
  assert.equal(missionFilename(''), 'mission.json');
});
