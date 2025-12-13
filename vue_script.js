const SUPABASE_URL = "https://yyqsvertfdlywlbtoaht.supabase.co";
const SUPABASE_FN_BASE = "https://yyqsvertfdlywlbtoaht.functions.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY_HERE";

const app = new Vue({
  el: '#app',
  data: {
    /* ========= Single Source of Truth ========= */
    mission: null,              // <- the one and only mission object
    missionJsonText: '',        // JSON editor view of `mission`
    editorError: null,
    isEditing: true,

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
  /* =========================
   *  Mission normalization & truth
   * ========================= */
  normalizeMission(m) {
    const safe = (m && typeof m === 'object') ? m : {};
    return {
      name: String(safe.name || 'Untitled Mission'),
      startX: Number(safe.startX) || 0,
      startY: Number(safe.startY) || 0,
      startAngle: Number(safe.startAngle) || 0,
      robotWidthCm: Number(safe.robotWidthCm) || 12.7,
      robotLengthCm: Number(safe.robotLengthCm) || 20.5,
      traceColor: this.normalizeColorToHex(safe.traceColor || '#008000'),
      offsetY: Number(safe.offsetY) || 0,
      attachments: Array.isArray(safe.attachments)
        ? safe.attachments.map(a => ({
            side: String(a.side || '').toLowerCase(),
            widthCm: Number(a.widthCm) || 0,
            lengthCm: Number(a.lengthCm) || 0,
            positionCm: Number(a.positionCm) || 0
          }))
        : [],
      actions: Array.isArray(safe.actions)
        ? safe.actions.map(a => ({
            type: (a.type === 'move' || a.type === 'rotate') ? a.type : 'move',
            value: Number(a.value) || 0
          }))
        : []
    };
  },

  setMission(missionObj, opts = {}) {
    const options = Object.assign(
      { syncBuilder: true, syncEditor: true, render: true },
      opts
    );

    const normalized = this.normalizeMission(missionObj);
    this.mission = normalized;

    if (options.syncBuilder) this.builderLoadFromMission(normalized);
    if (options.syncEditor)  this.editorLoadFromMission(normalized);
    if (options.render)      this.initializeMission(normalized);
  },

  /* =========================
   *  Builder ↔ Mission
   * ========================= */
  builderLoadFromMission(m) {
    this.builder.name          = m.name;
    this.builder.startX        = m.startX;
    this.builder.startY        = m.startY;
    this.builder.startAngle    = m.startAngle;
    this.builder.robotWidthCm  = m.robotWidthCm;
    this.builder.robotLengthCm = m.robotLengthCm;
    this.builder.traceColor    = m.traceColor;
    this.builder.offsetY       = m.offsetY;
    this.builder.attachments   = (m.attachments || []).map(a => ({ ...a }));
    this.builder.actions       = (m.actions || []).map(a => ({ ...a }));
  },

  buildMissionFromBuilder() {
    return this.normalizeMission({
      name: this.builder.name,
      startX: this.builder.startX,
      startY: this.builder.startY,
      startAngle: this.builder.startAngle,
      robotWidthCm: this.builder.robotWidthCm,
      robotLengthCm: this.builder.robotLengthCm,
      traceColor: this.builder.traceColor,
      offsetY: this.builder.offsetY,
      attachments: this.builder.attachments,
      actions: this.builder.actions
    });
  },

  applyBuilderToMission() {
    const m = this.buildMissionFromBuilder();
    this.setMission(m, { syncBuilder: false, syncEditor: true, render: true });
  },

  builderAdd(type) {
    const value = (type === 'move') ? 50 : -90;
    this.builder.actions.push({ type, value });
    this.applyBuilderToMission();
  },

  builderDelete(idx) {
    this.builder.actions.splice(idx, 1);
    this.applyBuilderToMission();
  },

  builderUseInTool() {
    this.applyBuilderToMission();
    this.isEditing = false;
  },

  /* =========================
   *  Editor ↔ Mission
   * ========================= */
  editorLoadFromMission(m) {
    this._suspendEditorSync = true;
    this.missionJsonText = JSON.stringify(m, null, 4);
    this.editorError = null;
    this._suspendEditorSync = false;
  },

  applyEditorToMission() {
    try {
      const parsed = JSON.parse(this.missionJsonText);
      this.editorError = null;
      this.setMission(parsed, { syncBuilder: true, syncEditor: false, render: true });
    } catch (e) {
      this.editorError = 'Invalid JSON: ' + e.message;
    }
  },

  openMissionEditor() {
    this.isEditing = true;
    if (this.mission) this.editorLoadFromMission(this.mission);
  },

  saveMissionEdits() {
    this.applyEditorToMission();
    if (!this.editorError) this.isEditing = false;
  },

  cancelMissionEdit() {
    if (this.mission) this.editorLoadFromMission(this.mission);
    this.editorError = null;
    this.isEditing = false;
  },

  /* =========================
   *  Supabase helpers
   * ========================= */
  async _fnPost(fnName, payload) {
    const res = await fetch(`${SUPABASE_FN_BASE}/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + SUPABASE_ANON_KEY
      },
      body: JSON.stringify(payload || {})
    });
    return await res.json();
  },

  async connectTeam() {
    if (!this.teamName || !this.teamPin) {
      alert("Enter team name and PIN");
      return;
    }
    const data = await this._fnPost("list_missions", {
      teamName: this.teamName,
      pin: this.teamPin
    });

    if (!data || !data.ok) {
      alert(data?.error || "Login failed");
      return;
    }

    this.cloudMissions = data.missions || [];
    this.isTeamAuthed = true;
    alert(`Connected as team "${this.teamName}"`);
  },

  async refreshCloudList() {
    if (!this.isTeamAuthed) return;
    const data = await this._fnPost("list_missions", {
      teamName: this.teamName,
      pin: this.teamPin
    });
    if (data?.ok) this.cloudMissions = data.missions || [];
  },

  async loadSelectedCloudMission() {
    if (!this.isTeamAuthed || !this.selectedCloudMission) return;

    const data = await this._fnPost("get_mission", {
      teamName: this.teamName,
      pin: this.teamPin,
      name: this.selectedCloudMission
    });

    if (!data?.ok || !data.mission) {
      alert("Mission not found");
      return;
    }

    this.setMission(data.mission, { syncBuilder: true, syncEditor: true, render: true });
    this.isEditing = false;
  },

  async saveMissionToCloud() {
    if (!this.isTeamAuthed || !this.mission) return;

    const name = this.mission.name?.trim();
    if (!name) {
      alert("Mission name required");
      return;
    }

    if (this.isEditing) {
      this.applyEditorToMission();
      if (this.editorError) {
        alert("Fix JSON errors before saving");
        return;
      }
    }

    const data = await this._fnPost("save_mission", {
      teamName: this.teamName,
      pin: this.teamPin,
      name,
      mission: this.mission
    });

    if (!data?.ok) {
      alert(data?.error || "Save failed");
      return;
    }

    alert(`Saved "${name}"`);
    await this.refreshCloudList();
  },

  /* =========================
   *  Runner entry
   * ========================= */
  startMission() {
    if (!this.mission || this.isRunning) return;
    this.stopRequested = false;
    this.isRunning = true;
    const actions = Array.isArray(this.mission.actions)
      ? this.mission.actions.slice()
      : [];
    this.executeActions(actions);
  }
});















