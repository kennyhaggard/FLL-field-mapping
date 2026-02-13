const SUPABASE_URL = "https://yyqsvertfdlywlbtoaht.supabase.co";
const SUPABASE_FN_BASE = "https://yyqsvertfdlywlbtoaht.functions.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NP5pQU0F3ApEYMCcBiV7jg_bIp10veM";

const STORAGE_KEYS = {
  mission: "fll_mission_v2",
  robots: "fll_robots_v1",
  team: "fll_team_v1",
  robotTransfer: "fll_robot_transfer_v1"
};

const FIELD_WIDTH_CM = 200;

function safeNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeAngle(angleDeg) {
  const a = safeNum(angleDeg, 0);
  return ((a % 360) + 360) % 360;
}

function normalizeColorToHex(colorStr, fallback) {
  const fallbackColor = fallback || "#108368";
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return fallbackColor;
    ctx.fillStyle = "#000";
    ctx.fillStyle = String(colorStr || "");
    const computed = ctx.fillStyle;
    if (computed.charAt(0) === "#") return computed;
    const m = computed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if (!m) return fallbackColor;
    const toHex = (n) => ("0" + parseInt(n, 10).toString(16)).slice(-2);
    return "#" + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
  } catch (e) {
    return fallbackColor;
  }
}

function normalizeAttachments(list) {
  const atts = Array.isArray(list) ? list : [];
  return atts
    .map((a) => ({
      side: (a.side || "").toString().toLowerCase(),
      widthCm: safeNum(a.widthCm, 0),
      lengthCm: safeNum(a.lengthCm, 0),
      positionCm: safeNum(a.positionCm, 0)
    }))
    .filter((a) => ["front", "rear", "left", "right"].includes(a.side));
}

function normalizeActions(list) {
  const acts = Array.isArray(list) ? list : [];
  return acts
    .map((a) => ({
      type: (a.type || "").toString().toLowerCase(),
      value: safeNum(a.value, 0)
    }))
    .filter((a) => a.type === "move" || a.type === "rotate");
}

function normalizeMission(raw) {
  const s = raw || {};
  const robotSource = s.robot || {};
  const attachments = normalizeAttachments(s.attachments || robotSource.attachments || []);

  return {
    name: (s.name || "Untitled Mission").toString(),
    robotName: (s.robotName || "").toString(),
    startX: safeNum(s.startX, 0),
    startY: safeNum(s.startY, 0),
    startAngle: normalizeAngle(s.startAngle),
    traceColor: normalizeColorToHex(s.traceColor || "#108368"),
    robotWidthCm: safeNum(s.robotWidthCm || robotSource.robotWidthCm, 12.7),
    robotLengthCm: safeNum(s.robotLengthCm || robotSource.robotLengthCm, 20.5),
    offsetY: safeNum(s.offsetY || robotSource.offsetY, 0),
    attachments,
    actions: normalizeActions(s.actions || [])
  };
}

function normalizeRobot(raw) {
  const s = raw || {};
  return {
    id: (s.id || "").toString(),
    name: (s.name || "Untitled Robot").toString(),
    robotWidthCm: safeNum(s.robotWidthCm, 12.7),
    robotLengthCm: safeNum(s.robotLengthCm, 20.5),
    offsetY: safeNum(s.offsetY, 0),
    attachments: normalizeAttachments(s.attachments || [])
  };
}

function createDefaultMission() {
  return normalizeMission({
    name: "Demo Mission",
    startX: 0,
    startY: 0,
    startAngle: 90,
    robotWidthCm: 12.7,
    robotLengthCm: 20.5,
    traceColor: "#108368",
    offsetY: 6.1,
    attachments: [
      { side: "front", widthCm: 6, lengthCm: 5, positionCm: 0 },
      { side: "left", widthCm: 4, lengthCm: 10, positionCm: 3 }
    ],
    actions: [
      { type: "move", value: 50 },
      { type: "rotate", value: -90 },
      { type: "move", value: 30 }
    ]
  });
}

function createDefaultRobot() {
  return normalizeRobot({
    name: "Default Robot",
    robotWidthCm: 12.7,
    robotLengthCm: 20.5,
    offsetY: 6.1,
    attachments: []
  });
}

function getLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function setLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // ignore
  }
}

function buildShareLink(mission) {
  const payload = normalizeMission(mission);
  const json = JSON.stringify(payload);
  const encoded = btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) => {
      return String.fromCharCode(parseInt(p1, 16));
    })
  );
  return `${window.location.origin}${window.location.pathname}?mission=${encoded}`;
}

function isLocalOrigin() {
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function readMissionFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("mission");
  if (!encoded) return null;
  try {
    const json = decodeURIComponent(
      atob(encoded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return normalizeMission(JSON.parse(json));
  } catch (e) {
    return null;
  }
}

async function cloudPost(path, payload) {
  const res = await fetch(`${SUPABASE_FN_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(payload || {})
  });
  return res.json();
}

export {
  SUPABASE_URL,
  SUPABASE_FN_BASE,
  SUPABASE_ANON_KEY,
  STORAGE_KEYS,
  FIELD_WIDTH_CM,
  safeNum,
  clamp,
  normalizeAngle,
  normalizeColorToHex,
  normalizeMission,
  normalizeRobot,
  normalizeActions,
  normalizeAttachments,
  createDefaultMission,
  createDefaultRobot,
  getLocal,
  setLocal,
  buildShareLink,
  isLocalOrigin,
  readMissionFromUrl,
  cloudPost
};
