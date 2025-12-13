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

    // UX
    isCloudBusy: false,
    cloudError: null,

    /* ========= Internal sync guard ========= */
    _suspendEditorSync: false,
    _editorDebounceId: null
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
  async connectTeam() {
    if (!this.teamName || !this.teamPin) {
      alert("Enter team name and 4-digit PIN");
      return;
    }

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

      if (!data.ok) {
        alert(data.error || "Login failed");
        return;
      }

      this.cloudMissions = data.missions || [];
      this.isTeamAuthed = true;
      alert('Connected as team "' + this.teamName + '"');
    } catch (e) {
      console.error(e);
      alert("Network error connecting to Supabase");
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

  initializeMission(missionInput) {
    const mission = this.normalizeMission(missionInput || this.mission);

    // keep canonical (and builder/json) aligned
    this.mission = mission;
    this.builderLoadFromSchema(mission);
    this.missionJsonText = JSON.stringify(mission, null, 2);

    this.resetRobot();

    const svgRoot = document.getElementById("mission-field");
    if (!svgRoot) return;

    this.scaleX = svgRoot.viewBox.baseVal.width / 200;
    this.scaleY = this.scaleX;

    const thetaDeg = ((mission.startAngle % 360) + 360) % 360;
    const c = Math.cos(thetaDeg * Math.PI / 180);
    const s = Math.sin(thetaDeg * Math.PI / 180);

    const halfLx = (mission.robotLengthCm * this.scaleX) / 2;
    const halfLy = (mission.robotLengthCm * this.scaleY) / 2;
    const halfWx = (mission.robotWidthCm  * this.scaleX) / 2;
    const halfWy = (mission.robotWidthCm  * this.scaleY) / 2;
    const dx = Math.abs(c) * halfLx + Math.abs(s) * halfWx;
    const dy = Math.abs(s) * halfLy + Math.abs(c) * halfWy;

    this.currentX     = mission.startX * this.scaleX + dx;
    this.currentY     = svgRoot.viewBox.baseVal.height - (mission.startY * this.scaleY) - dy;
    this.currentAngle = thetaDeg;
    this.traceColor   = mission.traceColor;

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
      "translate(" + this.currentX + ", " + this.currentY + ") rotate(" + (90 - this.currentAngle) + ")"
    );

    svgRoot.appendChild(g);
    this.robot = g;
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
   *  Offset helper
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
   *  Kinematics
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

      const off = self.offsetXY(self.currentAngle);
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

  rotateRobotStatic(angle, callback) {
    const svgRoot = document.getElementById("mission-field");
    if (!svgRoot || !this.robot) return;

    const startAngle = this.currentAngle;
    const targetAngle = startAngle + angle;

    const off0 = this.offsetXY(startAngle);
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

      const off = self.offsetXY(a);
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
  }
  }
});






















