const FIELD_WIDTH_CM = 200;

const STORAGE_VERSION = 3;

const STORAGE_KEYS = Object.freeze({
  missionDraft: "fll:mission:draft:v3",
  robotLibrary: "fll:robots:library:v3",
  teamSession: "fll:team:session:v3",
  robotTransfer: "fll:robot:transfer:v3"
});

const LEGACY_STORAGE_KEYS = Object.freeze({
  missionDraft: "fll_mission_v2",
  robotLibrary: "fll_robots_v1",
  teamSession: "fll_team_v1",
  robotTransfer: "fll_robot_transfer_v1"
});

const SUPABASE_URL = "https://yyqsvertfdlywlbtoaht.supabase.co";
const SUPABASE_FN_BASE = "https://yyqsvertfdlywlbtoaht.functions.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NP5pQU0F3ApEYMCcBiV7jg_bIp10veM";

const DEFAULT_REPLAY_OPTIONS = Object.freeze({
  fps: 60,
  moveSpeedCmPerSec: 20,
  rotateSpeedDegPerSec: 45
});

export {
  DEFAULT_REPLAY_OPTIONS,
  FIELD_WIDTH_CM,
  LEGACY_STORAGE_KEYS,
  STORAGE_KEYS,
  STORAGE_VERSION,
  SUPABASE_ANON_KEY,
  SUPABASE_FN_BASE,
  SUPABASE_URL
};
