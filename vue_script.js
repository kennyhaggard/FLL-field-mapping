/* ========= Turnstile callbacks (must be global) ========= */
window.onTurnstileSuccess = function (token) {
  if (window.app && window.app.$data) {
    window.app.$data.turnstileToken = token || "";
  }
};

window.onTurnstileExpired = function () {
  if (window.app && window.app.$data) {
    window.app.$data.turnstileToken = "";
  }
};

window.onTurnstileError = function () {
  if (window.app && window.app.$data) {
    window.app.$data.turnstileToken = "";
  }
};

/* ========= Supabase config ========= */
const SUPABASE_URL = "https://yyqsvertfdlywlbtoaht.supabase.co";
const SUPABASE_FN_BASE = "https://yyqsvertfdlywlbtoaht.functions.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NP5pQU0F3ApEYMCcBiV7jg_bIp10veM";

const app = new Vue({
  el: '#app',
  data: {
    /* ========= Single Source of Truth ========= */
    mission: null,              // <- the one and only mission object
    missionJsonText: '',        // JSON editor view of `mission`
    editorError: null,
    isEditing: true,
    savedMissionName: "",

    /* ========= Robot / field state ========= */
    robot: null,
    scaleX: null,
    scaleY: null,
    currentX: null,
    currentY: null,
    currentAngle: null,

    tracePath: true,

    // Animation speeds (global)
    moveSpeedCmPerSec: 20,
    rotateSpeedDegPerSec: 45,

    // Runner state
    isRunning: false,
    stopRequested: false,
    _rafId: null,

    /* ========= Builder (view state) ========= */
    builder: {
      // NOTE: this is NOT truth; it is a view.
      name: 'Demo Mission',
      startX: 0,
      startY: 0,
      startAngle: 90,
      robotWidthCm: 12.7,
      robotLengthCm: 20.5,
      traceColor: '#008000',
      offsetY: 6.1,
      attachments: [],
      actions: [
        { type: 'move',   value: 50 },
        { type: 'rotate', value: -90 },
        { type: 'move',   value: 50 }
      ]
    },

    /* ========= Team / Cloud ========= */
    teamName: "public",
    teamPin: "",
    isTeamAuthed: false,

    cloudMissions: [],          // array of { name, updated_at?, ... } from list_missions
    selectedCloudMission: "",   // mission name selected in UI
    
    coachEmail: "",
    turnstileToken: "",

    // UX
    isCloudBusy: false,
    cloudError: null,
    cloudSuccess: null,

    /* ========= Internal sync guard ========= */
    _suspendEditorSync: false,
    _editorDebounceId: null,

    /* ========= Replay ========= */
  replayFrames: [],        // [{tMs, x, y, angle}]
  replayIndex: 0,          // slider index
  isReplaying: false,
  _replayRafId: null,
  replayFps: 60,           // frame rate for pre-sim
  replayTracePolyline: null // optional polyline element
  },

  methods: {
  /* =========================================================
   *  SINGLE SOURCE OF TRUTH (new framework)
   *  - this.mission is canonical
   *  - this.missionJsonText is the JSON editor text
   *  - Builder always reflects this.mission (and compiles back into it)
   * ========================================================= */

  // --- tiny helpers ---
  _safeNum(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  },

  normalizeColorToHex(colorStr) {
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return "#008000";
      ctx.fillStyle = "#000";
      ctx.fillStyle = String(colorStr || "");
      const computed = ctx.fillStyle;
      if (computed.charAt(0) === "#") return computed;
      const m = computed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
      if (!m) return "#008000";
      const toHex = (n) => ("0" + parseInt(n, 10).toString(16)).slice(-2);
      return "#" + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
    } catch (e) {
      return "#008000";
    }
  },

  normalizeMission(schema) {
    const s = schema || {};
    const name = (s.name || "Untitled Mission").toString();

    const startX = this._safeNum(s.startX, 0);
    const startY = this._safeNum(s.startY, 0);

    // Keep angles clean but allow any real number
    let startAngle = this._safeNum(s.startAngle, 0);
    startAngle = ((startAngle % 360) + 360) % 360;

    const robotWidthCm  = this._safeNum(s.robotWidthCm, 12.7);
    const robotLengthCm = this._safeNum(s.robotLengthCm, 20.5);
    const offsetY       = this._safeNum(s.offsetY, 0);

    const traceColor = this.normalizeColorToHex(s.traceColor || "#008000");

    const atts = Array.isArray(s.attachments) ? s.attachments : [];
    const attachments = atts
      .map((a) => ({
        side: (a.side || "").toString().toLowerCase(),
        widthCm: this._safeNum(a.widthCm, 0),
        lengthCm: this._safeNum(a.lengthCm, 0),
        positionCm: this._safeNum(a.positionCm, 0)
      }))
      .filter((a) => ["front", "rear", "left", "right"].includes(a.side));

    const acts = Array.isArray(s.actions) ? s.actions : [];
    const actions = acts
      .map((a) => ({
        type: (a.type || "").toString().toLowerCase(),
        value: this._safeNum(a.value, 0)
      }))
      .filter((a) => a.type === "move" || a.type === "rotate");

    return {
      name,
      startX,
      startY,
      startAngle,
      robotWidthCm,
      robotLengthCm,
      traceColor,
      offsetY,
      attachments,
      actions
    };
  },

  setMission(schema, opts) {
    const options = opts || {};
    const m = this.normalizeMission(schema);

    // canonical state
    this.mission = m;

    // keep builder in sync
    this.builderLoadFromSchema(m);

    // keep JSON editor in sync
    this.missionJsonText = JSON.stringify(m, null, 2);
    this.editorError = null;

    // render robot immediately unless caller asked not to
    if (!options.skipRender) {
      this.initializeMission(m);
    }
  },

  // Build -> mission (canonical)
  syncFromBuilder() {
    const payload = this.builderCompileSchema();
    this.setMission(payload);
  },

  // JSON editor -> mission (canonical)
  syncFromJson() {
    try {
      const parsed = JSON.parse(this.missionJsonText);
      this.setMission(parsed);
    } catch (e) {
      this.editorError = "Invalid JSON: " + e.message;
    }
  },

  /* =========================
   *  BUILDER (Beta)
   * ========================= */
  builderAdd(type) {
    const t = (type || "").toLowerCase();
    const value = t === "move" ? 50 : -90;
    this.builder.actions.push({ type: t, value });
  },
  builderDelete(idx) {
    this.builder.actions.splice(idx, 1);
  },

  builderCompileSchema() {
    return {
      name: (this.builder.name || "Untitled Mission").toString(),
      startX: this._safeNum(this.builder.startX, 0),
      startY: this._safeNum(this.builder.startY, 0),
      startAngle: this._safeNum(this.builder.startAngle, 0),
      robotWidthCm: this._safeNum(this.builder.robotWidthCm, 0),
      robotLengthCm: this._safeNum(this.builder.robotLengthCm, 0),
      traceColor: this.normalizeColorToHex(this.builder.traceColor || "#008000"),
      offsetY: this._safeNum(this.builder.offsetY, 0),
      attachments: Array.isArray(this.builder.attachments)
        ? this.builder.attachments.map((a) => ({
            side: (a.side || "").toString().toLowerCase(),
            widthCm: this._safeNum(a.widthCm, 0),
            lengthCm: this._safeNum(a.lengthCm, 0),
            positionCm: this._safeNum(a.positionCm, 0)
          }))
        : [],
      actions: (this.builder.actions || []).map((a) => ({
        type: (a.type || "").toString().toLowerCase(),
        value: this._safeNum(a.value, 0)
      }))
    };
  },

  builderLoadFromSchema(schema) {
    const m = this.normalizeMission(schema);

    this.builder.name          = m.name;
    this.builder.startX        = m.startX;
    this.builder.startY        = m.startY;
    this.builder.startAngle    = m.startAngle;
    this.builder.robotWidthCm  = m.robotWidthCm;
    this.builder.robotLengthCm = m.robotLengthCm;
    this.builder.offsetY       = m.offsetY;
    this.builder.traceColor    = m.traceColor;

    this.builder.attachments = (m.attachments || []).map((a) => ({
      side: a.side,
      widthCm: a.widthCm,
      lengthCm: a.lengthCm,
      positionCm: a.positionCm
    }));

    this.builder.actions = (m.actions || []).map((a) => ({
      type: a.type,
      value: a.value
    }));
  },

  // "Save Changes" in builder now means: compile -> canonical -> render
  builderUseInTool() {
    this.syncFromBuilder();
  },

  /* =========================
   *  JSON EDITOR actions
   * ========================= */
  saveMissionAndInitialize() {
    // Now: JSON editor becomes canonical if user clicks Save Changes there
    this.syncFromJson();
  },

  /* =========================
   *  Missions / Demo (no file import)
   * ========================= */
  loadDemoMission() {
    const demo = {
      name: "Demo Mission",
      startX: 0,
      startY: 0,
      startAngle: 90,
      robotWidthCm: 12.7,
      robotLengthCm: 20.5,
      traceColor: "#008000",
      offsetY: 6.1,
      attachments: [
        { side: "front", widthCm: 6, lengthCm: 5, positionCm: 0 },
        { side: "left",  widthCm: 4, lengthCm: 10, positionCm: 3 }
      ],
      actions: [
        { type: "move", value: 50 },
        { type: "rotate", value: -90 },
        { type: "move", value: 30 }
      ]
    };

    // Optional: keep old mission list if you still want it in UI
    this.missions = [demo];

    this.setMission(demo);
  },

  // Optional: keep this if you still show a list of missions in UI
  selectAndEditMission(mission) {
    this.setMission(mission);
  },

  /* =========================
   *  Share link
   * ========================= */
  generateShareLink() {
    const payload = this.normalizeMission(this.mission);
    const json = JSON.stringify(payload);

    const encoded = (function b64EncodeUnicode(str) {
      return btoa(
        encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, p1) {
          return String.fromCharCode(parseInt(p1, 16));
        })
      );
    })(json);

    return (
      window.location.origin +
      window.location.pathname +
      "?mission=" +
      encoded
    );
  },

  copyShareLink() {
    const url = this.generateShareLink();
    navigator.clipboard
      .writeText(url)
      .then(() => alert("Share link copied to clipboard!"))
      .catch(() => alert("Unable to copy. Here is the link:\n" + url));
  },

  emailShareLink() {
    try {
      const link = this.generateShareLink();
      const subject = "FLL Mission: " + ((this.mission && this.mission.name) || "Untitled");
      const body = [
        "Here’s a link to load this mission in the Builder:",
        "",
        link,
        "",
        "If the link doesn’t open automatically, copy and paste it into your browser."
      ].join("\n");

      window.location.href =
        "mailto:?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(body);
    } catch (e) {
      console.error("emailShareLink failed:", e);
      alert("Sorry—could not open your email client.");
    }
  },

  /* =========================
   *  TEAM CLOUD (Supabase) — primary source of truth for sharing
   *  Requires your edge functions:
   *   - list_missions  (existing)
   *   - get_mission    (recommended)
   *   - save_mission   (recommended)
   * ========================= */

  async registerTeam() {
    this.cloudError = null;
    this.cloudSuccess = null;
  
    const teamName = (this.teamName || "").trim();
    const pin = (this.teamPin || "").trim();
    const coachEmail = (this.coachEmail || "").trim();
    const turnstileToken = (this.turnstileToken || "").trim();
  
    if (!teamName || !pin || !coachEmail) {
      this.cloudError = "Please enter team name, coach email, and a 4-digit PIN.";
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      this.cloudError = "PIN must be exactly 4 digits.";
      return;
    }
    if (!turnstileToken) {
      this.cloudError = "Please complete the Turnstile check.";
      return;
    }
  
    this.isCloudBusy = true;
    try {
      const res = await fetch(SUPABASE_FN_BASE + "/register_team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ teamName, pin, coachEmail, turnstileToken })
      });
  
      const data = await res.json();
      if (!data.ok) {
        this.cloudError = data.error || "Registration failed";
        return;
      }
  
      // ✅ Success path
      this.cloudSuccess = `Team "${teamName}" registered successfully! You can now connect from the Mission Tool.`;
      this.cloudError = null;
  
      // Clear captcha token so it can't be reused
      this.turnstileToken = "";
  
      // Optional: reset Turnstile widget if available
      try {
        if (window.turnstile && typeof window.turnstile.reset === "function") {
          window.turnstile.reset();
        }
      } catch (e) {}
  
    } catch (e) {
      console.error(e);
      this.cloudError = "Network error registering team.";
    } finally {
      this.isCloudBusy = false;
    }
  },
  resetSignupForm() {
    this.teamName = "";
    this.teamPin = "";
    this.coachEmail = "";
    this.cloudError = null;
    this.cloudSuccess = null;
    this.turnstileToken = "";
  
    // Reset the Turnstile widget if available
    try {
      if (window.turnstile && typeof window.turnstile.reset === "function") {
        window.turnstile.reset();
      }
    } catch (e) {}
  },
  async connectTeam() {
    if (this.isCloudBusy) return;            // prevents double-click
    this.cloudError = null;
    this.cloudSuccess = null;
  
    const teamName = (this.teamName || "").trim();
    const pin = (this.teamPin || "").trim();
  
    if (!teamName || !pin) {
      this.cloudError = "Enter team name and 4-digit PIN.";
      return;
    }
  
    this.isCloudBusy = true;
  
    try {
      const res = await fetch(SUPABASE_FN_BASE + "/list_missions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ teamName, pin })
      });
  
      const data = await res.json();
  
      if (!data.ok) {
        this.isTeamAuthed = false;
        this.cloudMissions = [];
        this.cloudError = data.error || "Login failed";
        return;
      }
  
      this.cloudMissions = data.missions || [];
      this.isTeamAuthed = true;
      this.cloudSuccess = `Connected as team "${teamName}".`;
    } catch (e) {
      console.error(e);
      this.isTeamAuthed = false;
      this.cloudMissions = [];
      this.cloudError = "Network error connecting to Supabase.";
    } finally {
      this.isCloudBusy = false;
    }      
  },

  async refreshTeamMissions() {
    if (!this.isTeamAuthed) return;
    try {
      const res = await fetch(SUPABASE_FN_BASE + "/list_missions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          teamName: this.teamName,
          pin: this.teamPin
        })
      });
      const data = await res.json();
      if (data.ok) this.cloudMissions = data.missions || [];
    } catch (e) {
      console.error("refreshTeamMissions error:", e);
    }
  },

  async saveMissionToTeamCloud(nameOverride) {
    if (!this.isTeamAuthed) {
      alert("Connect as a team first.");
      return;
    }

    const name = ((nameOverride || (this.mission && this.mission.name) || "").toString()).trim();
    if (!name) {
      alert("Mission needs a name.");
      return;
    }

    const mission = this.normalizeMission(this.mission);

    try {
      const res = await fetch(SUPABASE_FN_BASE + "/save_mission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          teamName: this.teamName,
          pin: this.teamPin,
          missionName: name,
          mission: mission
        })
      });

      const data = await res.json();
      if (!data.ok) {
        alert(data.error || "Save failed");
        return;
      }

      await this.refreshTeamMissions();
      alert('Saved mission "' + name + '" to team cloud.');
    } catch (e) {
      console.error(e);
      alert("Network error saving to team cloud.");
    }
  },

  async loadMissionFromTeamCloud(nameOverride) {
    if (!this.isTeamAuthed) {
      alert("Connect as a team first.");
      return;
    }

    const name = ((nameOverride || this.selectedCloudMission || "").toString()).trim();
    if (!name) {
      alert("Select a cloud mission name to load.");
      return;
    }

    try {
      const res = await fetch(SUPABASE_FN_BASE + "/get_mission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          teamName: this.teamName,
          pin: this.teamPin,
          missionName: name
        })
      });

      const data = await res.json();
      if (!data.ok || !data.mission) {
        alert(data.error || "Mission not found.");
        return;
      }

      this.setMission(data.mission);
    } catch (e) {
      console.error(e);
      alert("Network error loading from team cloud.");
    }
  },
  async deleteSelectedMissionFromTeamCloud() {
    if (!this.isTeamAuthed) {
      alert("Connect as a team first.");
      return;
    }
  
    const name = String(this.selectedCloudMission || "").trim();
    if (!name) {
      alert("Select a mission to delete.");
      return;
    }
  
    const ok = confirm(`Delete mission "${name}"? This cannot be undone.`);
    if (!ok) return;
  
    try {
      const res = await fetch(SUPABASE_FN_BASE + "/delete_mission", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: "Bearer " + SUPABASE_ANON_KEY
        },
        body: JSON.stringify({
          teamName: this.teamName,
          pin: this.teamPin,
          name // <- IMPORTANT: matches your Edge Function expectation
        })
      });
  
      const data = await res.json();
  
      if (!data.ok) {
        alert(data.error || "Delete failed");
        return;
      }
  
      // Refresh dropdown
      await this.refreshTeamMissions();
  
      // Clear selection (and optionally clear the loaded mission if it was the one deleted)
      if (this.mission && this.mission.name === name) {
        this.mission = null;
        this.missionJsonText = "";
        this.editorError = null;
        this.resetRobot();
        this.clearField();
      }
  
      this.selectedCloudMission = "";
      alert(`Deleted mission "${name}".`);
    } catch (e) {
      console.error(e);
      alert("Network error deleting mission.");
    }
  },

  /* =========================
   *  SHARED CLOUD (Apps Script JSONP) — optional fallback
   *  Keep this if you still want the public “shared” bucket.
   * ========================= */
  jsonpRequest(url, callback) {
    const transformer = "https://jsonp.afeld.me/?callback=fllJsonp&url=";
    const finalUrl = transformer + encodeURIComponent(url);

    window.fllJsonp = (data) => {
      callback(null, data);
      delete window.fllJsonp;
    };

    const script = document.createElement("script");
    script.src = finalUrl;
    script.onerror = () => callback(new Error("JSONP failed"));
    document.head.appendChild(script);
  },

  // IMPORTANT: This method name is kept for your current HTML buttons.
  // New behavior:
  //  - If team-authed => save to team cloud (primary)
  //  - else => save to shared Apps Script (fallback)
  saveMissionToCloud() {
    const name = ((this.savedMissionName || (this.mission && this.mission.name) || "").toString()).trim();
    if (!name) {
      alert("Enter a mission name.");
      return;
    }

    if (this.isTeamAuthed) {
      this.saveMissionToTeamCloud(name);
      return;
    }

    // fallback shared
    const mission = this.normalizeMission(this.mission);
    const encodedMission = encodeURIComponent(JSON.stringify(mission));
    const url =
      APPS_BASE +
      "?action=save&name=" +
      encodeURIComponent(name) +
      "&mission=" +
      encodedMission;

    this.jsonpRequest(url, (err, data) => {
      if (err) {
        console.error("Save JSONP error:", err);
        alert("Network error saving mission to shared cloud.");
        return;
      }
      if (!data || data.error || data.ok === false) {
        console.error("Save error:", data);
        alert("Error saving mission to shared cloud.");
        return;
      }
      alert('Mission "' + name + '" saved to shared cloud.');
    });
  },

  // IMPORTANT: This method name is kept for your current HTML buttons.
  // New behavior:
  //  - If team-authed => load from team cloud (primary)
  //  - else => load from shared Apps Script (fallback)
  loadMissionFromCloudByName() {
    const name = ((this.savedMissionName || (this.mission && this.mission.name) || "").toString()).trim();
    if (!name) {
      alert("Enter a mission name to load.");
      return;
    }

    if (this.isTeamAuthed) {
      this.loadMissionFromTeamCloud(name);
      return;
    }

    const url = APPS_BASE + "?action=get&name=" + encodeURIComponent(name);

    this.jsonpRequest(url, (err, data) => {
      if (err) {
        console.error("Load JSONP error:", err);
        alert("Network error loading mission from shared cloud.");
        return;
      }
      if (!data || data.error || !data.mission) {
        alert('Mission "' + name + '" not found or invalid.');
        return;
      }
      this.setMission(data.mission);
    });
  },

  /* =========================
   *  Durations & easing
   * ========================= */
  moveDurationMs(distanceCm) {
    const s = Math.max(0.1, Number(this.moveSpeedCmPerSec) || 20);
    return Math.max(1, Math.abs(distanceCm) / s * 1000);
  },
  rotateDurationMs(angleDeg) {
    const s = Math.max(1, Number(this.rotateSpeedDegPerSec) || 90);
    return Math.max(1, Math.abs(angleDeg) / s * 1000);
  },
  easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  },

  /* =========================
   *  SVG field management
   * ========================= */
  clearField() {
    const svgRoot = document.getElementById("mission-field");
    if (!svgRoot) return;

    const dynamicElements = Array.prototype.filter.call(svgRoot.children, (child) => {
      return !child.hasAttribute("static");
    });
    dynamicElements.forEach((el) => svgRoot.removeChild(el));

    this.robot = null;

    // re-render current mission (canonical)
    if (this.mission) this.initializeMission(this.mission);
  },

  resetRobot() {
    const svgRoot = document.getElementById("mission-field");
    if (this.robot && svgRoot) {
      svgRoot.removeChild(this.robot);
      this.robot = null;
    }
  },

  _makeAttachmentRect(att, mission) {
    const w   = Number(att.widthCm) || 0;
    const l   = Number(att.lengthCm) || 0;
    const pos = Number(att.positionCm) || 0;
    if (w <= 0 || l <= 0) return null;

    const wX = w * this.scaleX;
    const lY = l * this.scaleY;
    const posX = pos * this.scaleX;
    const posY = pos * this.scaleY;

    const halfW = (mission.robotWidthCm  * this.scaleX) / 2;
    const halfL = (mission.robotLengthCm * this.scaleY) / 2;

    let x = 0, y = 0, wRect = wX, hRect = lY;

    switch ((att.side || "").toLowerCase()) {
      case "front":
        x = -wRect / 2 + posX;
        y = -halfL - hRect;
        break;
      case "rear":
        x = -wRect / 2 + posX;
        y = halfL;
        break;
      case "left":
        x = -halfW - wRect;
        y = -hRect / 2 - posY;
        break;
      case "right":
        x = halfW;
        y = -hRect / 2 - posY;
        break;
      default:
        return null;
    }

    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.setAttribute("x", x.toFixed(2));
    r.setAttribute("y", y.toFixed(2));
    r.setAttribute("width",  wRect.toFixed(2));
    r.setAttribute("height", hRect.toFixed(2));
    r.setAttribute("fill", "#FFD400");
    r.setAttribute("fill-opacity", "0.4");
    r.setAttribute("stroke", "#000");
    r.setAttribute("stroke-width", "3");
    r.setAttribute("vector-effect", "non-scaling-stroke");
    return r;
  },

  /* =========================
   *  Mission execution
   * ========================= */
  startMission() {
    if (!this.mission) {
      alert("Load a mission first");
      return;
    }
    if (this.isRunning) return;

    this.stopRequested = false;
    this.isRunning = true;

    const acts = (this.mission.actions || []).slice();
    this.executeActions(acts);
  },

  stopMission() {
    if (!this.isRunning) return;
    this.stopRequested = true;
    this._cancelRaf();
    this._finishRun("stopped");
  },

  _finishRun() {
    this._cancelRaf();
    this.isRunning = false;
  },

  _cancelRaf() {
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  },

  executeActions(actions) {
    if (this.stopRequested) { this._finishRun(); return; }
    if (!actions || actions.length === 0) { this._finishRun(); return; }

    const action = actions.shift();
    const self = this;

    if (action.type === "move") {
      this.moveForward(action.value, function () {
        self.executeActions(actions);
      });
    } else if (action.type === "rotate") {
      this.rotateRobotStatic(action.value, function () {
        self.executeActions(actions);
      });
    } else {
      this.executeActions(actions);
    }
  },

  /* =========================
   *  Kinematics
   * ========================= */

  drawRotationArc(pivotX, pivotY, radius, startAngleDeg, endAngleDeg, color) {
    const svgRoot = document.getElementById("mission-field");
    if (!svgRoot) return;
  
    // Convert "heading degrees" into SVG math angle:
    // Your kinematics use: x += cos(a), y -= sin(a)
    // That's equivalent to standard math coords (y up), so we can use angle as-is,
    // but we must convert to SVG screen coords (y down) when computing points.
    const toRad = (d) => (d * Math.PI) / 180;
  
    const x1 = pivotX + radius * Math.cos(toRad(startAngleDeg));
    const y1 = pivotY - radius * Math.sin(toRad(startAngleDeg));
    const x2 = pivotX + radius * Math.cos(toRad(endAngleDeg));
    const y2 = pivotY - radius * Math.sin(toRad(endAngleDeg));
  
    const delta = ((endAngleDeg - startAngleDeg) % 360 + 360) % 360; // 0..359
    const largeArc = delta > 180 ? 1 : 0;
  
    // sweep-flag: 1 means arc goes "positive angle direction" in SVG coordinate system.
    // Because SVG Y is down, the sign is flipped vs normal math. Easiest:
    // If endAngle is greater (in your heading system), we want the arc to visually
    // turn the same way your robot turns. Empirically this flag often needs inversion.
    const sweep = 0; // try 0 first; if it draws the "other way", flip to 1
  
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute(
      "d",
      `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color || this.traceColor || "#ff00aa");
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("vector-effect", "non-scaling-stroke");
  
    svgRoot.appendChild(path);
  },

  /* ========================================================
 *  START POSE (rear-left after rotation)
 *  startX/startY are rear-left corner of the robot AFTER startAngle
 *  currentX/currentY represent the robot CENTER
 * ========================================================= */

  _computeStartPose(missionInput) {
    const svgRoot = document.getElementById("mission-field");
    if (!svgRoot) return null;
  
    const mission = this.normalizeMission(missionInput || this.mission);
  
    // Ensure scale (match initializeMission: scaleY == scaleX)
    this.scaleX = svgRoot.viewBox.baseVal.width / 200;
    this.scaleY = this.scaleX;
  
    const thetaDeg = ((mission.startAngle % 360) + 360) % 360;
    const r = thetaDeg * Math.PI / 180;
    const c = Math.cos(r);
    const s = Math.sin(r);
  
    // Same half-dimensions and same dx/dy logic
    const halfLx = (mission.robotLengthCm * this.scaleX) / 2;
    const halfLy = (mission.robotLengthCm * this.scaleY) / 2;
    const halfWx = (mission.robotWidthCm  * this.scaleX) / 2;
    const halfWy = (mission.robotWidthCm  * this.scaleY) / 2;
  
    const dx = Math.abs(c) * halfLx + Math.abs(s) * halfWx;
    const dy = Math.abs(s) * halfLy + Math.abs(c) * halfWy;
  
    // IMPORTANT:
    // startX/startY are interpreted exactly as in initializeMission:
    // (cm from bottom-left) but "start point" represents the lower-left of the *rotated robot's AABB*.
    const x = mission.startX * this.scaleX + dx;
    const y = svgRoot.viewBox.baseVal.height - (mission.startY * this.scaleY) - dy;
  
    return { x, y, angle: thetaDeg, mission };
  },

initializeMission(missionInput) {
  const svgRoot = document.getElementById("mission-field");
  if (!svgRoot) return;

  const pose0 = this._computeStartPose(missionInput || this.mission);
  if (!pose0) return;

  const mission = pose0.mission;

  // keep canonical (and builder/json) aligned
  this.mission = mission;
  this.builderLoadFromSchema(mission);
  this.missionJsonText = JSON.stringify(mission, null, 2);

  this.resetRobot();

  this.currentX     = pose0.x;
  this.currentY     = pose0.y;
  this.currentAngle = pose0.angle;
  this.traceColor   = mission.traceColor;

  // Draw initial trace point (the point you trace during moves)
  if (this.tracePath) {
    const off0 = this.offsetXY(this.currentAngle); // vector trace -> center
    const traceX0 = this.currentX - off0.ox;
    const traceY0 = this.currentY - off0.oy;

    const dot0 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot0.setAttribute("cx", traceX0.toFixed(2));
    dot0.setAttribute("cy", traceY0.toFixed(2));
    dot0.setAttribute("r", 0.8);
    dot0.setAttribute("fill", this.traceColor);
    svgRoot.appendChild(dot0);
  }

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("id", "robot-group");

  const base = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  base.setAttribute("x", -mission.robotWidthCm * this.scaleX / 2);
  base.setAttribute("y", -mission.robotLengthCm * this.scaleY / 2);
  base.setAttribute("width",  mission.robotWidthCm * this.scaleX);
  base.setAttribute("height", mission.robotLengthCm * this.scaleY);
  base.setAttribute("fill", "blue");
  base.setAttribute("fill-opacity", "0.6");
  base.setAttribute("stroke", "red");
  base.setAttribute("stroke-width", "3");
  base.setAttribute("vector-effect", "non-scaling-stroke");
  g.appendChild(base);

  const atts = Array.isArray(mission.attachments) ? mission.attachments : [];
  for (let i = 0; i < atts.length; i++) {
    const rect = this._makeAttachmentRect(atts[i], mission);
    if (rect) g.appendChild(rect);
  }

  g.setAttribute(
    "transform",
    "translate(" + this.currentX.toFixed(2) + ", " + this.currentY.toFixed(2) + ") rotate(" + (90 - this.currentAngle) + ")"
  );

  svgRoot.appendChild(g);
  this.robot = g;
},

/* =========================
 *  Offset helper (unchanged)
 *  Returns vector from TRACE POINT -> ROBOT CENTER
 * ========================= */
offsetXY(angleDeg) {
  const oCm = (this.mission && this.mission.offsetY) || 0;
  const oSvg = oCm * this.scaleY;
  const r = (angleDeg * Math.PI) / 180;
  return {
    ox:  oSvg * Math.cos(r),
    oy: -oSvg * Math.sin(r)
  };
},

/* =========================
 *  Kinematics (trace is correct as long as currentX/Y are CENTER)
 * ========================= */
moveForward(distance, callback) {
  const svgRoot = document.getElementById("mission-field");
  if (!svgRoot || !this.robot) return;

  const distanceSvg = distance * this.scaleY;

  const startX = this.currentX;
  const startY = this.currentY;

  const angleRad = (this.currentAngle * Math.PI) / 180;
  const endX = startX + distanceSvg * Math.cos(angleRad);
  const endY = startY - distanceSvg * Math.sin(angleRad);

  const duration = this.moveDurationMs(distance);
  const t0 = performance.now();
  const self = this;

  function animate(t) {
    if (self.stopRequested) { self._finishRun(); return; }

    const raw = Math.min((t - t0) / duration, 1);
    const p = self.easeInOut(raw);

    self.currentX = startX + p * (endX - startX);
    self.currentY = startY + p * (endY - startY);

    const off = self.offsetXY(self.currentAngle); // trace -> center
    const traceX = self.currentX - off.ox;
    const traceY = self.currentY - off.oy;

    self.robot.setAttribute(
      "transform",
      "translate(" + self.currentX.toFixed(2) + ", " + self.currentY.toFixed(2) + ") rotate(" + (90 - self.currentAngle) + ")"
    );

    if (self.tracePath) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", traceX.toFixed(2));
      dot.setAttribute("cy", traceY.toFixed(2));
      dot.setAttribute("r", 0.8);
      dot.setAttribute("fill", self.traceColor);
      svgRoot.appendChild(dot);
    }

    if (raw < 1) {
      self._rafId = requestAnimationFrame(animate);
    } else {
      self.currentX = endX;
      self.currentY = endY;
      if (!self.stopRequested && typeof callback === "function") callback();
    }
  }

  this._rafId = requestAnimationFrame(animate);
},

/* =========================
 *  Rotation (pivot is TRACE POINT)
 *  Note: tracing during rotation would not draw an arc because pivot stays fixed.
 * ========================= */
rotateRobotStatic(angle, callback) {
  const svgRoot = document.getElementById("mission-field");
  if (!svgRoot || !this.robot) return;

  const startAngle = this.currentAngle;
  const targetAngle = startAngle + angle;

  // pivot = trace point (fixed)
  const off0 = this.offsetXY(startAngle); // trace -> center
  const pivotX = this.currentX - off0.ox;
  const pivotY = this.currentY - off0.oy;

  const duration = this.rotateDurationMs(angle);
  const t0 = performance.now();
  const self = this;

  function animate(t) {
    if (self.stopRequested) { self._finishRun(); return; }

    const raw = Math.min((t - t0) / duration, 1);
    const p = self.easeInOut(raw);
    const a = startAngle + (targetAngle - startAngle) * p;

    const off = self.offsetXY(a); // trace -> center (for new angle)
    const x = pivotX + off.ox;
    const y = pivotY + off.oy;

    self.robot.setAttribute(
      "transform",
      "translate(" + x.toFixed(2) + ", " + y.toFixed(2) + ") rotate(" + (90 - a) + ")"
    );

    if (raw < 1) {
      self._rafId = requestAnimationFrame(animate);
    } else {
      self.currentAngle = targetAngle;

      const offF = self.offsetXY(self.currentAngle);
      self.currentX = pivotX + offF.ox;
      self.currentY = pivotY + offF.oy;

      if (!self.stopRequested && typeof callback === "function") callback();
    }
  }

  this._rafId = requestAnimationFrame(animate);
  },
  /* =========================
 *  REPLAY METHODS (drop-in)
 *  Assumes you already have:
 *   - _computeStartPose(missionInput)  (shared with live runner)
 *   - offsetXY(angleDeg)              (uses this.mission.offsetY)
 *   - moveDurationMs(), rotateDurationMs(), easeInOut()
 *   - initializeMission()
 * ========================= */

_cancelReplayRaf() {
  if (this._replayRafId != null) {
    cancelAnimationFrame(this._replayRafId);
    this._replayRafId = null;
  }
},

stopReplay() {
  this.isReplaying = false;
  this._cancelReplayRaf();
},

_ensureScale() {
  const svgRoot = document.getElementById("mission-field");
  if (!svgRoot) return null;

  this.scaleX = svgRoot.viewBox.baseVal.width / 200;
  this.scaleY = this.scaleX;
  return svgRoot;
},

buildReplayFrames() {
  const svgRoot = this._ensureScale();
  if (!svgRoot) return;

  if (!this.mission) {
    alert("Load a mission first.");
    return;
  }

  // Normalize and ensure this.mission is the one replay will use (important for offsetXY)
  const mission = this.normalizeMission(this.mission);
  this.mission = mission;

  // Start pose MUST match live runner start pose
  const pose0 = this._computeStartPose(mission);
  if (!pose0) return;

  const fps = Math.max(10, Number(this.replayFps) || 60);
  const dtMs = 1000 / fps;

  const frames = [];
  let tMs = 0;

  let x = pose0.x;
  let y = pose0.y;
  let a = pose0.angle;

  frames.push({ tMs, x, y, angle: a });

  const actions = Array.isArray(mission.actions) ? mission.actions : [];
  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    if (!act || !act.type) continue;

    if (act.type === "move") {
      const distCm = Number(act.value) || 0;
      const distSvg = distCm * this.scaleY;

      const durMs = this.moveDurationMs(distCm);
      const n = Math.max(1, Math.ceil(durMs / dtMs));

      const startX = x, startY = y;
      const angleRad = (a * Math.PI) / 180;
      const endX = startX + distSvg * Math.cos(angleRad);
      const endY = startY - distSvg * Math.sin(angleRad);

      for (let k = 1; k <= n; k++) {
        const raw = k / n;
        const p = this.easeInOut(raw);
        tMs += dtMs;

        x = startX + p * (endX - startX);
        y = startY + p * (endY - startY);

        frames.push({ tMs, x, y, angle: a });
      }

      x = endX; y = endY;

    } else if (act.type === "rotate") {
      const delta = Number(act.value) || 0;

      // Live runner rotates around the TRACE POINT (center - offset)
      const off0 = this.offsetXY(a);            // trace->center
      const pivotX = x - off0.ox;               // trace point
      const pivotY = y - off0.oy;

      const target = a + delta;

      const durMs = this.rotateDurationMs(delta);
      const n = Math.max(1, Math.ceil(durMs / dtMs));

      const startA = a;

      for (let k = 1; k <= n; k++) {
        const raw = k / n;
        const p = this.easeInOut(raw);
        const aa = startA + (target - startA) * p;
        tMs += dtMs;

        // keep pivot fixed while offset changes with angle
        const off = this.offsetXY(aa);
        x = pivotX + off.ox;
        y = pivotY + off.oy;

        frames.push({ tMs, x, y, angle: aa });
      }

      a = target;

      // final snap
      const offF = this.offsetXY(a);
      x = pivotX + offF.ox;
      y = pivotY + offF.oy;
    }
  }

  this.replayFrames = frames;
  this.replayIndex = 0;

  // Ensure robot exists visually, then render first frame
  if (!this.robot) this.initializeMission(mission);
  this.renderReplayFrame(0);
},

renderReplayFrame(idx) {
  if (!this.replayFrames || !this.replayFrames.length) return;

  const i = Math.max(0, Math.min(this.replayFrames.length - 1, Number(idx) || 0));
  const f = this.replayFrames[i];

  if (!this.robot) {
    this.initializeMission(this.mission);
    if (!this.robot) return;
  }

  this.robot.setAttribute(
    "transform",
    "translate(" + f.x.toFixed(2) + ", " + f.y.toFixed(2) + ") rotate(" + (90 - f.angle) + ")"
  );

  this.currentX = f.x;
  this.currentY = f.y;
  this.currentAngle = f.angle;

  this.renderReplayTrace(i);
},

renderReplayTrace(uptoIndex) {
  const svgRoot = document.getElementById("mission-field");
  if (!svgRoot) return;
  if (!this.mission || !this.replayFrames || !this.replayFrames.length) return;

  // remove old polyline
  if (this.replayTracePolyline && this.replayTracePolyline.parentNode) {
    this.replayTracePolyline.parentNode.removeChild(this.replayTracePolyline);
    this.replayTracePolyline = null;
  }

  if (!this.tracePath) return;

  const mission = this.normalizeMission(this.mission);
  const end = Math.max(0, Math.min(uptoIndex, this.replayFrames.length - 1));

  const pts = [];
  for (let i = 0; i <= end; i++) {
    const f = this.replayFrames[i];
    const off = this.offsetXY(f.angle);     // trace->center
    const tx = f.x - off.ox;                // trace point
    const ty = f.y - off.oy;
    pts.push(tx.toFixed(2) + "," + ty.toFixed(2));
  }

  const pl = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  pl.setAttribute("points", pts.join(" "));
  pl.setAttribute("fill", "none");
  pl.setAttribute("stroke", mission.traceColor || "#008000");
  pl.setAttribute("stroke-width", "1.5");
  pl.setAttribute("vector-effect", "non-scaling-stroke");
  pl.setAttribute("opacity", "0.9");

  svgRoot.appendChild(pl);
  this.replayTracePolyline = pl;
},

onReplaySliderInput() {
  this.stopReplay();
  this.renderReplayFrame(this.replayIndex);
},

playReplay() {
  if (!this.replayFrames || this.replayFrames.length < 2) {
    this.buildReplayFrames();
    if (!this.replayFrames || this.replayFrames.length < 2) return;
  }

  this.isReplaying = true;
  this._cancelReplayRaf();

  const self = this;

  function tick() {
    if (!self.isReplaying) return;

    const next = Number(self.replayIndex) + 1;
    if (next >= self.replayFrames.length) {
      self.isReplaying = false;
      self._cancelReplayRaf();
      return;
    }

    self.replayIndex = next;
    self.renderReplayFrame(next);

    self._replayRafId = requestAnimationFrame(tick);
  }

  this._replayRafId = requestAnimationFrame(tick);
},

resetReplay() {
  this.stopReplay();
  this.replayIndex = 0;

  if (this.replayFrames && this.replayFrames.length) {
    this.renderReplayFrame(0);
  } else {
    this.buildReplayFrames();
  }
}
    
},   
mounted() {
  // Signup page: do nothing mission-related
  if (window.PAGE === "signup") {
    this.cloudError = null;
    this.cloudSuccess = null;
    this.isCloudBusy = false;
    this.turnstileToken = "";
    return;
  }

  // Tool page
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("mission");

  // If a mission link is present, load it and STOP (do not load demo)
  if (encoded) {
    try {
      const json = decodeURIComponent(
        Array.prototype.map
          .call(atob(encoded), (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
          .join("")
      );
      const mission = JSON.parse(json);
      this.setMission(mission);
      return; // ✅ prevents demo mission override
    } catch (e) {
      console.error("Invalid mission link", e);
      alert("The mission link is invalid or corrupted.");
      // fall through to demo load if you want
    }
  }

  // No mission param => safe to load demo (or do nothing)
  this.loadDemoMission();
}

});

// Make Vue accessible to Turnstile callbacks
window.app = app;















































