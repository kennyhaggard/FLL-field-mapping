import test from "node:test";
import assert from "node:assert/strict";

import {
  consumeRobotTransfer,
  createMemoryStorage,
  loadMissionDraft,
  loadRobotLibrary,
  loadTeamSession,
  migrateLegacyStorage,
  saveMissionDraft,
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

  assert.ok(storage.getItem(STORAGE_KEYS.missionDraft));
  assert.equal(loadMissionDraft(storage).name, "Legacy Mission");
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

  saveMissionDraft(storage, { name: "Saved Mission", startAngle: 450 });
  saveRobotLibrary(storage, [{ name: "Alpha", robotWidthCm: 13 }]);
  saveTeamSession(storage, { name: "team-a", pin: "5555", connected: true, lastMode: "hosted" });

  assert.equal(loadMissionDraft(storage).startAngle, 90);
  assert.equal(loadRobotLibrary(storage)[0].name, "Alpha");
  assert.equal(loadTeamSession(storage).connected, true);
});
