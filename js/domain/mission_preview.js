import { normalizeMission } from "./model.js?v=dock-setup-1";

// Names and dock arrangement do not change the robot's route preview.
// Field setup is a separate, immediate control; motion/robot edits are staged.
function previewFingerprint(mission) {
  const { name, robotName, robot, fieldSetup, ...preview } = normalizeMission(mission);
  return JSON.stringify(preview);
}

export function hasPendingFieldChanges(draft, displayed) {
  return previewFingerprint(draft) !== previewFingerprint(displayed);
}

export function createFieldSnapshot(mission, fieldSetup = mission.fieldSetup) {
  return normalizeMission({ ...mission, fieldSetup });
}
