import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEYS,
  STORAGE_VERSION
} from "./constants.js";
import {
  createDefaultMission,
  normalizeMission,
  normalizeRobot
} from "./model.js";

function readJson(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

function removeKey(storage, key) {
  try {
    storage?.removeItem?.(key);
    return true;
  } catch (error) {
    return false;
  }
}

function createEnvelope(payloadKey, payload) {
  return {
    version: STORAGE_VERSION,
    updatedAt: new Date().toISOString(),
    [payloadKey]: payload
  };
}

function createMemoryStorage(seed = {}) {
  const entries = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
    removeItem(key) {
      entries.delete(key);
    },
    dump() {
      return Object.fromEntries(entries.entries());
    }
  };
}

function migrateLegacyStorage(storage) {
  const nextMission = readJson(storage, STORAGE_KEYS.missionDraft);
  if (!nextMission) {
    const legacyMission = readJson(storage, LEGACY_STORAGE_KEYS.missionDraft);
    if (legacyMission) {
      writeJson(
        storage,
        STORAGE_KEYS.missionDraft,
        createEnvelope("mission", normalizeMission(legacyMission))
      );
    }
  }

  const nextRobots = readJson(storage, STORAGE_KEYS.robotLibrary);
  if (!nextRobots) {
    const legacyRobots = readJson(storage, LEGACY_STORAGE_KEYS.robotLibrary);
    if (Array.isArray(legacyRobots)) {
      writeJson(
        storage,
        STORAGE_KEYS.robotLibrary,
        createEnvelope("robots", legacyRobots.map(normalizeRobot))
      );
    }
  }

  const nextTeam = readJson(storage, STORAGE_KEYS.teamSession);
  if (!nextTeam) {
    const legacyTeam = readJson(storage, LEGACY_STORAGE_KEYS.teamSession);
    if (legacyTeam?.name) {
      writeJson(
        storage,
        STORAGE_KEYS.teamSession,
        createEnvelope("session", {
          name: String(legacyTeam.name || "public"),
          pin: String(legacyTeam.pin || ""),
          connected: Boolean(legacyTeam.connected ?? true),
          lastMode: "unknown"
        })
      );
    }
  }

  const nextTransfer = readJson(storage, STORAGE_KEYS.robotTransfer);
  if (!nextTransfer) {
    const legacyTransfer = readJson(storage, LEGACY_STORAGE_KEYS.robotTransfer);
    if (legacyTransfer) {
      writeJson(
        storage,
        STORAGE_KEYS.robotTransfer,
        createEnvelope("robot", normalizeRobot(legacyTransfer))
      );
    }
  }
}

function loadMissionDraft(storage) {
  migrateLegacyStorage(storage);
  const payload = readJson(storage, STORAGE_KEYS.missionDraft);
  return payload?.mission ? normalizeMission(payload.mission) : createDefaultMission();
}

function saveMissionDraft(storage, missionLike) {
  return writeJson(
    storage,
    STORAGE_KEYS.missionDraft,
    createEnvelope("mission", normalizeMission(missionLike))
  );
}

function loadRobotLibrary(storage) {
  migrateLegacyStorage(storage);
  const payload = readJson(storage, STORAGE_KEYS.robotLibrary);
  return Array.isArray(payload?.robots) ? payload.robots.map(normalizeRobot) : [];
}

function saveRobotLibrary(storage, robots) {
  return writeJson(
    storage,
    STORAGE_KEYS.robotLibrary,
    createEnvelope("robots", (Array.isArray(robots) ? robots : []).map(normalizeRobot))
  );
}

function loadTeamSession(storage) {
  migrateLegacyStorage(storage);
  const payload = readJson(storage, STORAGE_KEYS.teamSession);
  const session = payload?.session || {};
  return {
    name: String(session.name || "public"),
    pin: String(session.pin || ""),
    connected: Boolean(session.connected),
    lastMode: String(session.lastMode || "")
  };
}

function saveTeamSession(storage, sessionLike) {
  const session = sessionLike || {};
  return writeJson(
    storage,
    STORAGE_KEYS.teamSession,
    createEnvelope("session", {
      name: String(session.name || "public"),
      pin: String(session.pin || ""),
      connected: Boolean(session.connected),
      lastMode: String(session.lastMode || "")
    })
  );
}

function clearTeamSession(storage) {
  return removeKey(storage, STORAGE_KEYS.teamSession);
}

function stageRobotTransfer(storage, robotLike) {
  return writeJson(
    storage,
    STORAGE_KEYS.robotTransfer,
    createEnvelope("robot", normalizeRobot(robotLike))
  );
}

function consumeRobotTransfer(storage) {
  migrateLegacyStorage(storage);
  const payload = readJson(storage, STORAGE_KEYS.robotTransfer);
  if (!payload?.robot) return null;
  removeKey(storage, STORAGE_KEYS.robotTransfer);
  return normalizeRobot(payload.robot);
}

export {
  STORAGE_KEYS,
  clearTeamSession,
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
};
