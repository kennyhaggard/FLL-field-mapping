import test from "node:test";
import assert from "node:assert/strict";
import { validateMission, buildReplayFrames, createDefaultMission } from "../js/domain/model.js";
import { readMissionFromQuery } from "../js/domain/share.js";
import { createMissionHistory } from "../js/domain/mission_history.js";
import { createPlaybackClock } from "../js/domain/playback_clock.js";
import { createReplayGeometry } from "../js/domain/replay_geometry.js";

test("every preview entry rejects excessive work before allocating frames", () => {
  for (const mission of [
    { actions: [{ type: "move", value: 1e100 }] },
    { actions: [{ type: "pause", value: 601 }] },
    { actions: Array.from({ length: 501 }, () => ({ type: "pause", value: 0 })) },
    { actions: [], attachments: Array(101).fill({}) },
    { actions: [], startX: 1e200 },
    { actions: [], name: "x".repeat(96_000) }
  ]) {
    assert.throws(() => validateMission(mission));
    assert.throws(() => buildReplayFrames(mission));
    const query = `?mission=${encodeURIComponent(Buffer.from(JSON.stringify(mission)).toString("base64"))}`;
    assert.equal(readMissionFromQuery(query), null);
  }
  assert.throws(() => buildReplayFrames({ actions: [{ type: "pause", value: 600 }] }, { fps: 1000 }), /frames/);
  assert.equal(buildReplayFrames({ actions: [{ type: "pause", value: 600 }] }).length, 36001);
  assert.equal(buildReplayFrames({ headingMode: "global", actions: Array.from({ length: 500 }, () => ({ type: "rotate", value: 0 })) }).length, 501);
});

test("history groups one field edit, isolates snapshots, supports branching, and is bounded", () => {
  const history = createMissionHistory(2);
  const a = { actions: [] }, b = { actions: [{ type: "move", value: 1 }] }, c = { actions: [{ type: "move", value: 12 }] };
  history.record(a, b, "field");
  history.record(b, c, "field");
  assert.deepEqual(history.undo(c), a);
  assert.deepEqual(history.redo(a), c);
  history.endGroup();
  history.record(c, b, "field");
  b.actions[0].value = 900;
  assert.deepEqual(history.undo(b), c);
  history.record(c, { actions: [] });
  assert.equal(history.canRedo, false);
  history.record(a, { name: "1" });
  history.record({ name: "1" }, { name: "2" });
  history.undo({ name: "2" }); history.undo({ name: "1" });
  assert.equal(history.canUndo, false);
  history.clear();
  assert.equal(history.canRedo, false);
});

test("playback speed changes advance from current time instead of rescaling history", () => {
  const clock = createPlaybackClock(1000);
  assert.equal(clock.read(3000), 2);
  clock.setSpeed(3000, 0.5);
  assert.equal(clock.read(3000), 2);
  assert.equal(clock.read(5000), 3);
  clock.setSpeed(5000, 2);
  assert.equal(clock.read(5500), 4);
  const resumed = createPlaybackClock(8000, 4, 2);
  assert.equal(resumed.read(8500), 5);
});

test("all action types carry a stable applied-step index", () => {
  const mission = createDefaultMission();
  mission.actions = [{ type: "move", value: 5 }, { type: "rotate", value: 90 }, { type: "pause", value: 1 }, { type: "change-attachment", attachmentIndexes: [] }];
  const frames = buildReplayFrames(mission);
  assert.equal(frames[0].actionIndex, undefined);
  assert.deepEqual([...new Set(frames.slice(1).map(frame => frame.actionIndex))], [0, 1, 2, 3]);
  const geometry = createReplayGeometry(frames);
  assert.ok(geometry.boundaries.length <= mission.actions.length * 2 + 1);
  assert.equal(geometry.pauses.length, 1);
  for (const index of [0, 1, 20, frames.length - 1]) {
    const prefix = geometry.prefix(index);
    assert.equal(prefix.at(-1), frames[index]);
    assert.ok(prefix.every(frame => frames.indexOf(frame) <= index));
  }
});
