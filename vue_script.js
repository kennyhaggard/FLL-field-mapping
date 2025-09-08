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

    // Mission editor
    isEditing: true,
    missionEditorContent: '',
    editorError: null,

    // Builder (Beta)
    builder: {
      name: 'Demo Mission',
      startX: 0,
      startY: 0,
      startAngle: 90,
      robotWidthCm: 10,
      robotLengthCm: 12,
      traceColor: '#008000',
      offsetY: -3.2,
      actions: [] // { type: 'move'|'rotate', value: number }
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
      // EXACT schema for your tool
      return {
        name: this.builder.name || 'Demo Mission',
        startX: Number(this.builder.startX) || 0,
        startY: Number(this.builder.startY) || 0,
        startAngle: Number(this.builder.startAngle) || 0,
        robotWidthCm: Number(this.builder.robotWidthCm) || 0,
        robotLengthCm: Number(this.builder.robotLengthCm) || 0,
        traceColor: this.builder.traceColor || '#008000',
        offsetY: Number(this.builder.offsetY) || 0,
        actions: this.builder.actions.map(a => ({
          type: a.type,
          value: Number(a.value) || 0
        }))
      };
    },
    builderUseInTool() {
      // 1) dump builder JSON into your existing editor
      const payload = this.builderCompileSchema();
      this.missionEditorContent = JSON.stringify(payload, null, 4);

      // 2) reuse your existing flow to place robot
      this.saveMissionAndInitialize();
    },

    /* =========================
     *  Existing mission UI helpers
     * ========================= */
    selectAndEditMission(mission) {
      this.initializeMission(mission); // Initialize the mission
      this.missionEditorContent = JSON.stringify(mission, null, 4); // Pre-fill the editor
    },
    loadDemoMission() {
      this.missions = [
        {
          name: "Demo Mission",
          startX: 0,
          startY: 0,
          startAngle: 90,
          robotWidthCm: 10,
          robotLengthCm: 12,
          traceColor: "green",
          offsetY: -3.2,
          actions: [
            { type: "move", value: 50 },
            { type: "rotate", value: -90 },
            { type: "move", value: 30 }
          ]
        }
      ];
    },
    saveMissionAndInitialize() {
      try {
        const updatedMission = JSON.parse(this.missionEditorContent);
        this.selectedMission = updatedMission;
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
    },

    initializeMission(mission) {
      this.selectedMission = mission;
      this.resetRobot();

      const svgRoot = document.getElementById("mission-field");
      if (!svgRoot) return;

      // Scale (200 cm world width assumed)
      this.scaleX = svgRoot.viewBox.baseVal.width / 200;
      this.scaleY = this.scaleX;

      // Normalize start angle
      const thetaDeg = ((mission.startAngle % 360) + 360) % 360;
      const thetaRad = thetaDeg * Math.PI / 180;
      const c = Math.cos(thetaRad);
      const s = Math.sin(thetaRad);

      // Half-dimensions projected to SVG units
      const halfLx = (mission.robotLengthCm * this.scaleX) / 2;
      const halfLy = (mission.robotLengthCm * this.scaleY) / 2;
      const halfWx = (mission.robotWidthCm  * this.scaleX) / 2;
      const halfWy = (mission.robotWidthCm  * this.scaleY) / 2;

      // Axis-aligned half-extents (AABB) of rotated robot
      const dx = Math.abs(c) * halfLx + Math.abs(s) * halfWx;
      const dy = Math.abs(s) * halfLy + Math.abs(c) * halfWy;

      // Place robot center in-field from left/bottom edges
      this.currentX     = mission.startX * this.scaleX + dx;
      this.currentY     = svgRoot.viewBox.baseVal.height - (mission.startY * this.scaleY) - dy;
      this.currentAngle = thetaDeg;

      // Trace color (string: hex or name)
      this.traceColor = mission.traceColor;

      // Draw robot rect centered at (0,0); we move it via transform
      const robot = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      robot.setAttribute("x", -mission.robotWidthCm * this.scaleX / 2);
      robot.setAttribute("y", -mission.robotLengthCm * this.scaleY / 2);
      robot.setAttribute("width", mission.robotWidthCm * this.scaleX);
      robot.setAttribute("height", mission.robotLengthCm * this.scaleY);
      robot.setAttribute("fill", "blue");
      robot.setAttribute("fill-opacity", "0.6");
      robot.setAttribute("stroke", "red");
      // Note rotation is about the rect origin, which we've centered via x/y above
      robot.setAttribute("transform", `translate(${this.currentX}, ${this.currentY}) rotate(${90 - this.currentAngle})`);

      svgRoot.appendChild(robot);
      this.robot = robot;
    },

    /* =========================
     *  Mission execution
     * ========================= */
    startMission() {
      if (!this.selectedMission) {
        alert("Please select a mission first");
        return;
      }
      this.executeActions([...this.selectedMission.actions]);
    },

    resetRobot() {
      const svgRoot = document.getElementById("mission-field");
      if (this.robot && svgRoot) {
        svgRoot.removeChild(this.robot);
        this.robot = null;
      }
    },

    executeActions(actions) {
      if (actions.length === 0) {
        console.log("Mission complete!");
        return;
      }
      const action = actions.shift();
      if (action.type === "move") {
        this.moveForward(action.value, () => this.executeActions(actions));
      } else if (action.type === "rotate") {
        this.rotateRobotStatic(action.value, () => this.executeActions(actions));
      } else {
        // Unknown action type; skip
        this.executeActions(actions);
      }
    },

    /* =========================
     *  Offset helper (recompute-on-demand)
     *  Returns offset (ox, oy) in SVG units for a given absolute angle.
     *  Positive offsetY means forward along the robot's heading.
     * ========================= */
    offsetXY(angleDeg) {
      const oCm = this.selectedMission?.offsetY ?? 0; // cm
      const oSvg = oCm * this.scaleY;                 // convert to SVG units
      const r = (angleDeg * Math.PI) / 180;
      return {
        ox:  oSvg * Math.cos(r),
        oy: -oSvg * Math.sin(r)
      };
    },

    /* =========================
     *  Kinematics (animated)
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

      const duration = 2000;
      const t0 = performance.now();

      const animate = (t) => {
        const p = Math.min((t - t0) / duration, 1);
        this.currentX = startX + p * (endX - startX);
        this.currentY = startY + p * (endY - startY);

        // Trace point at offset-adjusted position (recompute each frame)
        const { ox, oy } = this.offsetXY(this.currentAngle);
        const traceX = this.currentX - ox;
        const traceY = this.currentY - oy;

        // Update robot pose
        this.robot.setAttribute(
          "transform",
          `translate(${this.currentX.toFixed(2)}, ${this.currentY.toFixed(2)}) rotate(${90 - this.currentAngle})`
        );

        // Drop a trace dot
        if (this.tracePath) {
          const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
          dot.setAttribute("cx", traceX.toFixed(2));
          dot.setAttribute("cy", traceY.toFixed(2));
          dot.setAttribute("r", 0.8);
          dot.setAttribute("fill", this.traceColor);
          svgRoot.appendChild(dot);
        }

        if (p < 1) requestAnimationFrame(animate);
        else {
          // finalize exact end
          this.currentX = endX;
          this.currentY = endY;
          callback();
        }
      };

      requestAnimationFrame(animate);
    },

    rotateRobotStatic(angle, callback) {
      const svgRoot = document.getElementById("mission-field");
      if (!svgRoot || !this.robot) return;

      const startAngle = this.currentAngle;
      const targetAngle = startAngle + angle;

      // Pivot center = current pose minus current offset (so rotation keeps trace point fixed)
      const { ox: ox0, oy: oy0 } = this.offsetXY(startAngle);
      const pivotX = this.currentX - ox0;
      const pivotY = this.currentY - oy0;

      const duration = 1000;
      const t0 = performance.now();

      const animate = (t) => {
        const p = Math.min((t - t0) / duration, 1);
        const a = startAngle + (targetAngle - startAngle) * p;

        // Reapply offset at interpolated angle
        const { ox, oy } = this.offsetXY(a);
        const x = pivotX + ox;
        const y = pivotY + oy;

        this.robot.setAttribute(
          "transform",
          `translate(${x.toFixed(2)}, ${y.toFixed(2)}) rotate(${90 - a})`
        );

        if (p < 1) requestAnimationFrame(animate);
        else {
          // finalize
          this.currentAngle = targetAngle;
          const { ox: oxF, oy: oyF } = this.offsetXY(this.currentAngle);
          this.currentX = pivotX + oxF;
          this.currentY = pivotY + oyF;
          callback();
        }
      };

      requestAnimationFrame(animate);
    }
  }
});
