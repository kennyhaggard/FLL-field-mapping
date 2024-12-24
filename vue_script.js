const app = new Vue({
    el: '#app',
    data: {
        missions: [],
        selectedMission: null,
        robot: null,
        scaleX: null,
        scaleY: null,
        currentX: null,
        currentY: null,
        currentAngle: null,
        tracePath: true,
        isEditing: true, // New state to track mission editor visibility
        missionEditorContent: '', // Holds the JSON text for editing
        editorError: null // Holds validation error messages
    },
    methods: {
        selectAndEditMission(mission) {
        this.initializeMission(mission); // Initialize the mission
        this.missionEditorContent = JSON.stringify(mission, null, 4); // Pre-fill the editor
    },
        loadDemoMission() {
            this.missions = [
                {
                    name: "Demo Mission",
                    startX: 10,
                    startY: 0,
                    startAngle: 90,
                    robotWidthCm: 18,
                    robotHeightCm: 15,
                    traceColor: "blue",
                    offsetY: 1.8,
                    actions: [
                        { type: "move", value: 35 },
                        { type: "rotate", value: -45 },
                        { type: "move", value: 30 },
                        { type: "rotate", value: -45 },
                        { type: "move", value: 10 }
                    ]
                }
            ];
        },
        openMissionEditor() {
            if (!this.selectedMission) {
                alert("Please select a mission first");
                return;
            }
            this.isEditing = true;
            this.missionEditorContent = JSON.stringify(this.selectedMission, null, 4); // Pre-fill editor with current mission
            this.editorError = null; // Reset error state
        },
        saveMissionEdits() {
            try {
                const updatedMission = JSON.parse(this.missionEditorContent);
                this.selectedMission = updatedMission; // Overwrite selected mission
                this.isEditing = false; // Close the editor
                alert("Mission updated successfully!");
            } catch (error) {
                this.editorError = "Invalid JSON: " + error.message; // Display error
            }
        },
        cancelMissionEdit() {
            this.isEditing = false; // Close the editor without saving
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
        clearField() {
            const svgRoot = document.getElementById("mission-field");
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
            this.scaleX = svgRoot.viewBox.baseVal.width / 200;
            this.scaleY = this.scaleX;
            this.scaleOffsetY = -mission.offsetY * this.scaleY

            this.currentX = mission.startX * this.scaleX + mission.robotWidthCm * this.scaleX / 2;
            this.currentY = svgRoot.viewBox.baseVal.height - mission.startY * this.scaleY - mission.robotHeightCm * this.scaleY / 2;
            this.currentAngle = mission.startAngle;
            this.traceColor = mission.traceColor;

            const robot = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            robot.setAttribute("x", -mission.robotWidthCm * this.scaleX / 2);
            robot.setAttribute("y", -mission.robotHeightCm * this.scaleY / 2);
            robot.setAttribute("width", mission.robotWidthCm * this.scaleX);
            robot.setAttribute("height", mission.robotHeightCm * this.scaleY);
            robot.setAttribute("fill", "blue");
            robot.setAttribute("fill-opacity", "0.6");
            robot.setAttribute("stroke", "red");
            robot.setAttribute("transform", `translate(${this.currentX}, ${this.currentY}) rotate(${90 - this.currentAngle})`);

            svgRoot.appendChild(robot);
            this.robot = robot;
        },
        startMission() {
            if (!this.selectedMission) {
                alert("Please select a mission first");
                return;
            }
            this.executeActions([...this.selectedMission.actions]);
        },
        resetRobot() {
            const svgRoot = document.getElementById("mission-field");
            if (this.robot) {
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
                this.rotateRobotStatic(action.value,() => this.executeActions(actions));
            }
        },
        moveForward(distance, callback) {
            const distanceSvg = distance * this.scaleY;
            const angleRadians = (this.currentAngle * Math.PI) / 180;
            const deltaX = distanceSvg * Math.cos(angleRadians);
            const deltaY = -distanceSvg * Math.sin(angleRadians);

            const startX = this.currentX;
            const startY = this.currentY;
            const endX = startX + deltaX;
            const endY = startY + deltaY;

            const duration = 2000;
            const startTime = performance.now();

            const animate = (currentTime) => {
                const elapsedTime = currentTime - startTime;
                const progress = Math.min(elapsedTime / duration, 1);
                this.currentX = startX + progress * (endX - startX);
                this.currentY = startY + progress * (endY - startY);

                this.robot.setAttribute("transform", `translate(${this.currentX}, ${this.currentY}) rotate(${90 - this.currentAngle})`);

                if (this.tracePath) {
                    const trace = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    trace.setAttribute("cx", this.currentX);
                    trace.setAttribute("cy", this.currentY);
                    trace.setAttribute("r", 0.8);
                    trace.setAttribute("fill", this.traceColor);
                    const svgRoot = document.getElementById("mission-field");
                    svgRoot.appendChild(trace);
                }

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    callback();
                }
            };
            requestAnimationFrame(animate);
        },
        rotateRobotStatic(angle,callback) {
            
        
            const angleRadians = ((this.currentAngle-angle-90) * Math.PI) / 180;
            const adjustedX = this.currentX - this.scaleOffsetY * Math.sin(angleRadians);
            const adjustedY = this.currentY - this.scaleOffsetY * Math.cos(angleRadians);
            this.currentAngle += angle;

            console.log("=== Diagnostic Info ===");
            console.log(`Offset set to -14`);
            console.log(`Angle (Degrees): ${this.currentAngle}`);
            console.log(`Angle (Radians): ${angleRadians}`);
            console.log(`Original Position: (${this.currentX.toFixed(2)}, ${this.currentY.toFixed(2)})`);
            console.log(`Offset Adjusted Position: (${adjustedX.toFixed(2)}, ${adjustedY.toFixed(2)})`);
            console.log("=======================");

            this.robot.setAttribute(
                "transform",
                `translate(${adjustedX}, ${adjustedY}) rotate(${90 - this.currentAngle})`
            );

            this.currentX = adjustedX;
            this.currentY = adjustedY;
            callback();
        }
    }
});
