import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeRobotTransfer,
  createMemoryStorage,
  readArchivedMissionDraft,
  loadRobotLibrary,
  loadTeamSession,
  migrateLegacyStorage,
  saveRobotLibrary,
  saveTeamSession,
  stageRobotTransfer
} from "../js/domain/storage.js";
import { STORAGE_KEYS } from "../js/domain/constants.js";

test("legacy storage migrates into versioned keys", () => {
  const storage = createMemoryStorage({
    fll_mission_v2: JSON.stringify({ name: "Legacy Mission", startAngle: 90 }),
    fll_robots_v1: JSON.stringify([{ name: "Legacy Bot", robotWidthCm: 14 }]),
    fll_team_v1: JSON.stringify({ name: "legacy", pin: "1234" }),
    fll_robot_transfer_v1: JSON.stringify({ name: "Transfer Bot", robotWidthCm: 15 })
  });

  migrateLegacyStorage(storage);

  assert.equal(storage.getItem(STORAGE_KEYS.missionDraft), null);
  assert.equal(readArchivedMissionDraft(storage).name, "Legacy Mission");
  assert.equal(readArchivedMissionDraft(storage).headingMode, "relative");
  assert.equal(loadRobotLibrary(storage)[0].name, "Legacy Bot");
  assert.equal(loadTeamSession(storage).name, "legacy");
  assert.equal(consumeRobotTransfer(storage).name, "Transfer Bot");
});

test("robot transfer is single-use", () => {
  const storage = createMemoryStorage();
  stageRobotTransfer(storage, { name: "Runner", robotWidthCm: 12 });

  const first = consumeRobotTransfer(storage);
  const second = consumeRobotTransfer(storage);

  assert.equal(first.name, "Runner");
  assert.equal(second, null);
});

test("saving versioned data returns normalized payloads", () => {
  const storage = createMemoryStorage();

  saveRobotLibrary(storage, [{ name: "Alpha", robotWidthCm: 13 }]);
  saveTeamSession(storage, { name: "team-a", pin: "5555", connected: true, lastMode: "hosted" });

  assert.equal(loadRobotLibrary(storage)[0].name, "Alpha");
  assert.equal(loadTeamSession(storage).connected, true);
});

test("archived mission export reads existing data without writing or deleting it", () => {
  const oldMission = {
    name: "Global Mission",
    headingMode: "global",
    startAngle: 270,
    actions: [{ type: "rotate", value: -90, alternateTurn: true }]
  };
  const storage = createMemoryStorage({ [STORAGE_KEYS.missionDraft]: JSON.stringify({ version: 3, mission: oldMission }) });
  const before = storage.dump();
  const mission = readArchivedMissionDraft(storage);
  assert.deepEqual(storage.dump(), before);
  assert.equal(mission.headingMode, "global");
  assert.equal(mission.startAngle, -90);
  assert.deepEqual(mission.actions, [
    { type: "rotate", value: -90, alternateTurn: true }
  ]);
});

test("no archived mission is invented when storage is empty or unavailable", () => {
  assert.equal(readArchivedMissionDraft(createMemoryStorage()), null);
  assert.equal(readArchivedMissionDraft({ getItem() { throw new Error("blocked"); } }), null);
});
