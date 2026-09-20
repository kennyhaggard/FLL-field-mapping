import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOCK_ORDER, DEFAULT_FIELD_SETUP, normalizeFieldSetup, fieldSetupKey, swapDockModel } from "../js/domain/field_setup.js";
import { DOCK_PLACEMENTS } from "../js/domain/dock_placements.js";
import { normalizeMission, applyRobotToMission } from "../js/domain/model.js";
import { createMemoryStorage, saveMissionDraft, loadMissionDraft } from "../js/domain/storage.js";
import { buildMissionShareLink, readMissionFromQuery } from "../js/domain/share.js";
import { createCloudClient } from "../js/domain/cloud.js";

test("legacy and malformed field setups become complete unique assignments", () => {
  for (const input of [undefined, null, {}, "bad"]) {
    assert.deepEqual(normalizeFieldSetup(input), DEFAULT_FIELD_SETUP);
  }
  assert.deepEqual(normalizeFieldSetup({ city: "m13", farm: "m13", mine: "bad" }), {
    city: "m13", farm: "m14", mine: "m15"
  });
  assert.deepEqual(normalizeFieldSetup({ mine: "m15" }), { city: "m13", farm: "m14", mine: "m15" });
  assert.deepEqual(normalizeMission({}).fieldSetup, DEFAULT_FIELD_SETUP);
});

test("every selection swaps exactly two docks without mutating the input", () => {
  assert.equal(Object.keys(DOCK_PLACEMENTS).length, 6);
  for (const key of Object.keys(DOCK_PLACEMENTS)) {
    const setup = Object.fromEntries(DOCK_ORDER.map((dock, i) => [dock, key.split("_")[i]]));
    for (const dock of DOCK_ORDER) {
      for (const model of ["m13", "m14", "m15"]) {
        const result = swapDockModel(setup, dock, model);
        assert.equal(result[dock], model);
        assert.equal(new Set(Object.values(result)).size, 3);
        assert.ok(DOCK_PLACEMENTS[fieldSetupKey(result)]);
        assert.deepEqual(swapDockModel(result, dock, setup[dock]), setup);
        assert.equal(fieldSetupKey(setup), key);
      }
    }
    assert.deepEqual(swapDockModel(setup, "unknown", "m13"), setup);
    assert.deepEqual(swapDockModel(setup, "city", "unknown"), setup);
  }
});

test("all layouts survive draft, JSON, share link and robot replacement", () => {
  for (const key of Object.keys(DOCK_PLACEMENTS)) {
    const fieldSetup = Object.fromEntries(DOCK_ORDER.map((dock, i) => [dock, key.split("_")[i]]));
    const mission = normalizeMission({ name: "Team 🌱", fieldSetup, fieldConfirmed: true });
    const storage = createMemoryStorage();
    saveMissionDraft(storage, mission);
    assert.deepEqual(loadMissionDraft(storage).fieldSetup, fieldSetup);
    const jsonMission = normalizeMission(JSON.parse(JSON.stringify(mission)));
    assert.deepEqual(jsonMission.fieldSetup, fieldSetup);
    const link = buildMissionShareLink(mission, { origin: "https://example.test", pathname: "/index.html" });
    assert.deepEqual(readMissionFromQuery(new URL(link).search), mission);
    assert.deepEqual(applyRobotToMission(mission, { name: "New robot" }).fieldSetup, fieldSetup);
    assert.equal(Object.hasOwn(mission, "fieldConfirmed"), false);
  }
});

test("team mission payload and loaded response retain setup (mock transport)", async () => {
  let saved;
  const cloud = createCloudClient({
    runtime: { allowsCloudSync: true }, baseUrl: "https://example.test", anonKey: "test",
    fetchImpl: async (url, options) => {
      const payload = JSON.parse(options.body);
      if (url.endsWith("/save_mission")) saved = payload.mission;
      return { ok: true, text: async () => JSON.stringify({ ok: true, mission: saved }) };
    }
  });
  const session = { name: "test", pin: "test" };
  const mission = normalizeMission({ fieldSetup: { city: "m14", farm: "m15", mine: "m13" } });
  await cloud.saveMission(session, mission);
  const response = await cloud.getMission(session, mission.name);
  assert.deepEqual(normalizeMission(response.mission).fieldSetup, mission.fieldSetup);
});

test("generated placements exactly match the six calibrated source SVGs", () => {
  const names = { m13: "keystone", m14: "seeds", m15: "house" };
  const ids = { m13: "image1-92", m14: "seeds", m15: "solar-house" };
  for (const [key, models] of Object.entries(DOCK_PLACEMENTS)) {
    const filename = `field_${key.split("_").map(model => names[model]).join("_")}.svg`;
    const source = readFileSync(new URL(`../${filename}`, import.meta.url), "utf8");
    for (const [model, placement] of Object.entries(models)) {
      const tag = [...source.matchAll(/<image\b[^>]*>/gs)].map(match => match[0]).find(tag => tag.includes(`id="${ids[model]}"`));
      assert.ok(tag, `${filename}: ${model}`);
      for (const attr of ["x", "y", "transform"]) {
        assert.equal(tag.match(new RegExp(`\\s${attr}="([^"]*)"`))[1], placement[attr], `${filename}: ${model}.${attr}`);
      }
    }
  }
});
