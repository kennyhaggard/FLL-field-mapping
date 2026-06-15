import { normalizeMission } from "./model.js?v=robot-color-controls";

function encodeBase64Utf8(text) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(String(text), "utf8").toString("base64");
  }

  const bytes = new TextEncoder().encode(String(text));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64Utf8(encoded) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(String(encoded), "base64").toString("utf8");
  }

  const binary = atob(String(encoded));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function buildMissionShareLink(missionLike, locationLike = globalThis.location) {
  const mission = normalizeMission(missionLike);
  const payload = encodeBase64Utf8(JSON.stringify(mission));
  const origin = locationLike?.origin || "";
  const pathname = locationLike?.pathname || "";
  return `${origin}${pathname}?mission=${encodeURIComponent(payload)}`;
}

function readMissionFromQuery(search = "") {
  const params = new URLSearchParams(search || "");
  const encoded = params.get("mission");
  if (!encoded) return null;

  try {
    return normalizeMission(JSON.parse(decodeBase64Utf8(encoded)));
  } catch (error) {
    return null;
  }
}

export { buildMissionShareLink, readMissionFromQuery };
