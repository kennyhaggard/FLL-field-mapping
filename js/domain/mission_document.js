import { normalizeMission } from "./model.js?v=dock-setup-1";
import { DEFAULT_REPLAY_OPTIONS } from "./constants.js";

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
  const mission = normalizeMission(source);
  // Bound newly imported files before the renderer allocates animation frames.
  const seconds = mission.actions.reduce((total, action) => total + (
    action.type === "move" ? Math.abs(action.value) / DEFAULT_REPLAY_OPTIONS.moveSpeedCmPerSec
      : action.type === "rotate" ? (mission.headingMode === "global" ? 360 : Math.abs(action.value)) / DEFAULT_REPLAY_OPTIONS.rotateSpeedDegPerSec
        : action.type === "pause" ? Math.max(0, action.value) : 0
  ), 0);
  if (mission.actions.length > 500 || !Number.isFinite(seconds) || seconds > 600) {
    throw new Error("This mission is too large to preview. Use at most 500 actions and 10 minutes of simulated movement.");
  }
  return mission;
}
