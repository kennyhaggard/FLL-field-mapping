const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwyZNtSiyRiRQJHzrN_jhjEWLB0yP4FRzKdmroF3Gwv/exec';

const app = new Vue({
  el: '#app',
  data: {
    missions: [],
    selectedMission: null,

    // Robot / field state
    robot: null,
    scaleX: null,
    scaleY: null,
    currentX: null,
    currentY: null,
    currentAngle: null,

    traceColor: '#008000',
    tracePath: true,

    // Animation speeds (global)
    moveSpeedCmPerSec: 20,    // cm/s
    rotateSpeedDegPerSec: 45, // deg/s

    // Mission editor
    isEditing: true,
    missionEditorContent: '',
    editorError: null,

    // ---- NEW: runner state ----
    isRunning: false,     // true while executing a mission
    stopRequested: false, // set to interrupt flow immediately
    _rafId: null,         // current requestAnimationFrame handle

    // Cloud / lookup
    savedMissionName: '',   // <--- added so you can type a name and load it

    // Builder (Beta)
    builder: {
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
        {type: 'move', value: 50},
        {type: 'rotate', value: -90},
        {type: 'move', value: 50}
      ] // { type: 'move'|'rotate', value: number }
    }
  },

  methods: {
    /* =========================
     *  Builder (Beta)
     * ========================= */
    builderAdd(type) {
      const value = (type === 'move') ? 50 : -90; // defaults
      this.builder.actions.push({ type, value });
    },
    builderDelete(idx) {
      this.builder.actions.splice(idx, 1);
    },
    builderCompileSchema() {
      return {
        name: this.builder.name || 'Demo Mission',
        startX: Number(this.builder.startX) || 0,
        startY: Number(this.builder.startY) || 0,
        startAngle: Number(this.builder.startAngle) || 0,
        robotWidthCm: Number(this.builder.robotWidthCm) || 0,
        robotLengthCm: Number(this.builder.robotLengthCm) || 0,
        traceColor: this.builder.traceColor || '#008000',
        offsetY: Number(this.builder.offsetY) || 0,
        attachments: Array.isArray(this.builder.attachments)
          ? this.builder.attachments.map(a => ({
              side: (a.side || '').toLowerCase(),
              widthCm: Number(a.widthCm) || 0,
              lengthCm: Number(a.lengthCm) || 0,
              positionCm: Number(a.positionCm) || 0
            }))
          : [],
        actions: (this.builder.actions || []).map(a => ({
          type: a.type,
          value: Number(a.value) || 0
        }))
      };
    },
    builderUseInTool() {
      const payload = this.builderCompileSchema();
      this.missionEditorContent = JSON.stringify(payload, null, 4);
      this.saveMissionAndInitialize();
    },

    builderLoadFromSchema(schema) {
      if (!schema) return;
      this.builder.name          = schema.name ?? 'Demo Mission';
      this.builder.startX        = Number(schema.startX ?? 0);
      this.builder.startY        = Number(schema.startY ?? 0);
      this.builder.startAngle    = Number(schema.startAngle ?? 0);
      this.builder.robotWidthCm  = Number(schema.robotWidthCm ?? 0);
      this.builder.robotLengthCm = Number(schema.robotLengthCm ?? 0);
      this.builder.offsetY       = Number(schema.offsetY ?? 0);
      this.builder.traceColor    = this.normalizeColorToHex(schema.traceColor ?? '#008000');

      const attSafe = Array.isArray(schema.attachments) ? schema.attachments : [];
      this.builder.attachments = attSafe.map(a => ({
        side: (a.side || '').toLowerCase(),
        widthCm: Number(a.widthCm) || 0,
        lengthCm: Number(a.lengthCm) || 0,
        positionCm: Number(a.positionCm) || 0
      }));

      const actSafe = Array.isArray(schema.actions) ? schema.actions : [];
      this.builder.actions = actSafe.map(a => ({
        type: a.type,
        value: Number(a.value) || 0
      }));
    },

    // Normalize any CSS color to full hex (for the picker)
    normalizeColorToHex(colorStr) {
      try {
        const ctx = document.createElement('canvas').getContext('2d');
        if (!ctx) return '#008000';
        ctx.fillStyle = '#000';
        ctx.fillStyle = String(colorStr);
        const computed = ctx.fillStyle;
        if (computed.startsWith('#')) return computed;
        const m = computed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
        if (!m) return '#008000';
        const toHex = n => ('0' + parseInt(n, 10).toString(16)).slice(-2);
        return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
      } catch {
        return '#008000';
      }
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
     *  Existing mission UI helpers
     * ========================= */
    selectAndEditMission(mission) {
      this.initializeMission(mission);
      this.missionEditorContent = JSON.stringify(mission, null, 4);
      this.builderLoadFromSchema(mission);
    },
    loadDemoMission() {
      this.missions = [
        {
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
        }
      ];
      // this.selectAndEditMission(this.missions[0]);
    },
    saveMissionAndInitialize() {
      try {
        const updatedMission = JSON.parse(this.missionEditorContent);
        this.selectedMission = updatedMission;
        this.builderLoadFromSchema(updatedMission);
        this.initializeMission(updatedMission);
        this.editorError = null;
      } catch (error) {
        this.editorError = `Invalid JSON: ${error.message}`;
      }
    },
    openMissionEditor() {
      if (!this.selectedMission) {
        alert("Please select a mission first");
        return;
      }
      this.isEditing = true;
      this.missionEditorContent = JSON.stringify(this.selectedMission, null, 4);
      this.editorError = null;
    },
    saveMissionEdits() {
      try {
        const updatedMission = JSON.parse(this.missionEditorContent);
        this.selectedMission = updatedMission;
        this.isEditing = false;
        alert("Mission updated successfully!");
      } catch (error) {
        this.editorError = "Invalid JSON: " + error.message;
      }
    },
    cancelMissionEdit() {
      this.isEditing = false;
      this.editorError = null;
    },
    loadMissions(event) {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            this.missions = JSON.parse(e.target.result);
            console.log("Missions loaded:", this.missions);
          } catch (error) {
            alert("Invalid JSON format");
          }
        };
        reader.readAsText(file);
      }
    },
    generateShareLink() {
      const payload = this.builderCompileSchema();
      const json = JSON.stringify(payload);
      const encoded = b64EncodeUnicode(json);
      const link = `${window.location.origin}${window.location.pathname}?mission=${encoded}`;
      return link;

      function b64EncodeUnicode(str){
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_,p1)=>String.fromCharCode('0x'+p1)));
      }
    },
    copyShareLink() {
      const url = this.generateShareLink();
      navigator.clipboard.writeText(url)
        .then(() => alert('Share link copied to clipboard!'))
        .catch(() => alert('Unable to copy. Here is the link:\n' + url));
    },
    emailShareLink() {
      try {
        const link = this.generateShareLink();
        if (!link || typeof link !== 'string') {
          alert('Could not create share link.');
          return;
        }

        const subject = `FLL Mission: ${this.builder?.name || 'Untitled'}`;
        const body = [
          `Here’s a link to load this mission in the Builder:`,
          ``,
          link,
          ``,
          `If the link doesn’t open automatically, copy and paste it into your browser.`
        ].join('\n');

        const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailto;
      } catch (e) {
        console.error('emailShareLink failed:', e);
        alert('Sorry—could not open your email client.');
      }
    },

    /* =========================
     *  SVG field management
     * ========================= */
    clearField() {
      const svgRoot = document.getElementById("mission-field");
      if (!svgRoot) return;
      const dynamicElements = Array.from(svgRoot.children).filter(
        (child) => !child.hasAttribute("static")
      );
      dynamicElements.forEach((element) => svgRoot.removeChild(element));
      this.robot = null;

      this.saveMissionAndInitialize();
    },

    initializeMission(mission) {
      this.selectedMission = mission;
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
      for (const att of atts) {
        const rect = this._makeAttachmentRect(att, mission);
        if (rect) g.appendChild(rect);
      }

      g.setAttribute("transform", `translate(${this.currentX}, ${this.currentY}) rotate(${90 - this.currentAngle})`);
      svgRoot.appendChild(g);
      this.robot = g;
    },

    _makeAttachmentRect(att, mission) {
      const w  = Number(att.widthCm)     || 0;
      const l  = Number(att.lengthCm)    || 0;
      const pos= Number(att.positionCm)  || 0;
      if (w <= 0 || l <= 0) return null;

      const wX = w * this.scaleX, wY = w * this.scaleY;
      const lX = l * this.scaleX, lY = l * this.scaleY;
      const posX = pos * this.scaleX, posY = pos * this.scaleY;

      const halfW = (mission.robotWidthCm  * this.scaleX) / 2;
      const halfL = (mission.robotLengthCm * this.scaleY) / 2;

      let x=0, y=0, wRect=0, hRect=0;

      wRect = wX;
      hRect = lY;

      switch ((att.side || '').toLowerCase()) {
        case 'front':
          x = -wRect/2 + posX;
          y = -halfL - hRect;
          break;
        case 'rear':
          x = -wRect/2 + posX;
          y =  halfL;
          break;
        case 'left':
          x = -halfW - wRect;
          y = -hRect/2 - posY;
          break;
        case 'right':
          x =  halfW;
          y = -hRect/2 - posY;
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
      if (!this.selectedMission) {
        alert("Please select a mission first");
        return;
      }
      if (this.isRunning) return;
      this.stopRequested = false;
      this.isRunning = true;
      this.executeActions([...this.selectedMission.actions]);
    },

    stopMission() {
      if (!this.isRunning) return;
      this.stopRequested = true;
      this._cancelRaf();
      this._finishRun('stopped');
    },

    _finishRun(status) {
      this._cancelRaf();
      this.isRunning = false;
    },

    _cancelRaf() {
      if (this._rafId != null) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
    },

    resetRobot() {
      const svgRoot = document.getElementById("mission-field");
      if (this.robot && svgRoot) {
        svgRoot.removeChild(this.robot);
        this.robot = null;
      }
    },

    executeActions(actions) {
      if (this.stopRequested) { this._finishRun('stopped'); return; }
      if (actions.length === 0) { this._finishRun('done'); return; }

      const action = actions.shift();
      if (action.type === "move") {
        this.moveForward(action.value, () => this.executeActions(actions));
      } else if (action.type === "rotate") {
        this.rotateRobotStatic(action.value, () => this.executeActions(actions));
      } else {
        this.executeActions(actions);
      }
    },

    offsetXY(angleDeg) {
      const oCm = this.selectedMission?.offsetY ?? 0;
      const oSvg = oCm * this.scaleY;
      const r = (angleDeg * Math.PI) / 180;
      return {
        ox:  oSvg * Math.cos(r),
        oy: -oSvg * Math.sin(r)
      };
    },

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

      const animate = (t) => {
        if (this.stopRequested) { this._finishRun('stopped'); return; }

        const raw = Math.min((t - t0) / duration, 1);
        const p = this.easeInOut(raw);

        this.currentX = startX + p * (endX - startX);
        this.currentY = startY + p * (endY - startY);

        const { ox, oy } = this.offsetXY(this.currentAngle);
        const traceX = this.currentX - ox;
        const traceY = this.currentY - oy;

        this.robot.setAttribute(
          "transform",
          `translate(${this.currentX.toFixed(2)}, ${this.currentY.toFixed(2)}) rotate(${90 - this.currentAngle})`
        );

        if (this.tracePath) {
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", traceX.toFixed(2));
          dot.setAttribute("cy", traceY.toFixed(2));
          dot.setAttribute("r", 0.8);
          dot.setAttribute("fill", this.traceColor);
          svgRoot.appendChild(dot);
        }

        if (raw < 1) {
          this._rafId = requestAnimationFrame(animate);
        } else {
          this.currentX = endX; this.currentY = endY;
          if (!this.stopRequested) callback();
        }
      };

      this._rafId = requestAnimationFrame(animate);
    },

    rotateRobotStatic(angle, callback) {
      const svgRoot = document.getElementById("mission-field");
      if (!svgRoot || !this.robot) return;

      const startAngle = this.currentAngle;
      const targetAngle = startAngle + angle;

      const { ox: ox0, oy: oy0 } = this.offsetXY(startAngle);
      const pivotX = this.currentX - ox0;
      const pivotY = this.currentY - oy0;

      const duration = this.rotateDurationMs(angle);
      const t0 = performance.now();

      const animate = (t) => {
        if (this.stopRequested) { this._finishRun('stopped'); return; }

        const raw = Math.min((t - t0) / duration, 1);
        const p = this.easeInOut(raw);
        const a = startAngle + (targetAngle - startAngle) * p;

        const { ox, oy } = this.offsetXY(a);
        const x = pivotX + ox;
        const y = pivotY + oy;

        this.robot.setAttribute(
          "transform",
          `translate(${x.toFixed(2)}, ${y.toFixed(2)}) rotate(${90 - a})`
        );

        if (raw < 1) {
          this._rafId = requestAnimationFrame(animate);
        } else {
          this.currentAngle = targetAngle;
          const { ox: oxF, oy: oyF } = this.offsetXY(this.currentAngle);
          this.currentX = pivotX + oxF;
          this.currentY = pivotY + oyF;
          if (!this.stopRequested) callback();
        }
      };

      this._rafId = requestAnimationFrame(animate);
    },

    /* =========================
     *  Cloud save/load
     * ========================= */
    async saveMissionToCloud() {
      const name = (this.builder.name || '').trim();
      if (!name) {
        alert('Give your mission a name in the Builder first.');
        return;
      }

      const mission = this.builderCompileSchema();

      try {
        const res = await fetch(APPS_SCRIPT_URL + '?action=save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mission })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.ok) {
          console.error('Save error:', data);
          alert('Error saving mission to cloud.');
          return;
        }

        alert(`Mission "${name}" saved to cloud.`);
      } catch (e) {
        console.error(e);
        alert('Network error saving mission to cloud.');
      }
    },

    async loadMissionFromCloudByName() {
      const name = (this.savedMissionName || this.builder.name || '').trim();
      if (!name) {
        alert('Enter a mission name (or set Builder name) to load.');
        return;
      }

      try {
        const url = APPS_SCRIPT_URL + '?action=get&name=' + encodeURIComponent(name);
        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok || data.error) {
          alert(`Mission "${name}" not found.`);
          return;
        }

        const mission = data.mission;
        this.builderLoadFromSchema(mission);
        this.missionEditorContent = JSON.stringify(mission, null, 4);
        this.initializeMission(mission);
        this.selectedMission = mission;
      } catch (e) {
        console.error(e);
        alert('Network error loading mission from cloud.');
      }
    }
  },

  mounted() {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('mission');
    if (encoded) {
      try {
        const json = decodeURIComponent(escape(atob(encoded)));
        const mission = JSON.parse(json);
        this.builderLoadFromSchema(mission);
        this.missionEditorContent = JSON.stringify(mission, null, 4);
        this.initializeMission(mission);
      } catch (e) {
        console.error('Invalid mission link', e);
        alert('The mission link is invalid or corrupted.');
      }
    }
  }
});
