import { normalizeMission, validateMission } from "./model.js?v=student-workflow-1";

export const MAX_MISSION_FILE_BYTES = 96_000;

export function missionFingerprint(mission) {
  return JSON.stringify(normalizeMission(mission));
}

export function createMissionDocument(mission, source = { kind: "new" }) {
  return { source: { ...source }, checkpoint: missionFingerprint(mission) };
}

export function hasMissionChanges(document, mission) {
  return document.checkpoint !== missionFingerprint(mission);
}

export function missionFilename(name) {
  const stem = String(name || "mission").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").trim().slice(0, 80);
  return `${stem || "mission"}.json`;
}

export function parseMissionFile(text) {
  if (new TextEncoder().encode(text).length > MAX_MISSION_FILE_BYTES) {
    throw new Error("Mission files must be smaller than 96 KB.");
  }
  const raw = JSON.parse(text);
  const source = raw?.mission ?? raw; // Also accept an exported old browser envelope.
  if (!source || typeof source !== "object" || Array.isArray(source) || !Array.isArray(source.actions)) {
    throw new Error("Choose a mission JSON file containing an actions list.");
  }
  return validateMission(source);
}
