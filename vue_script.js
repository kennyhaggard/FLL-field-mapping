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
console.log(`Start position move forward: (${this.currentX}, ${this.currentY})`);
    const distanceSvg = distance * this.scaleY;
    const angleRadians = (this.currentAngle * Math.PI) / 180;
    const deltaX = distanceSvg * Math.cos(angleRadians);
    const deltaY = -distanceSvg * Math.sin(angleRadians);

    const startX = this.currentX;
    const startY = this.currentY;
    const endX = startX + deltaX;
    const endY = startY + deltaY;

    const duration = 2000; // Duration for the movement animation
    const startTime = performance.now();

    const animate = (currentTime) => {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);

        // Update the robot's position incrementally
        this.currentX = startX + progress * (endX - startX);
        this.currentY = startY + progress * (endY - startY);

        // Adjust for the robot's offset (ensure it matches rotation offsets)
        const offsetAngleRadians = this.currentAngle * (Math.PI / 180);
        const offsetX = this.selectedMission.offsetY * this.scaleY * Math.cos(offsetAngleRadians);
        const offsetY = -this.selectedMission.offsetY * this.scaleY * Math.sin(offsetAngleRadians);

        const traceX = this.currentX - offsetX;
        const traceY = this.currentY - offsetY;

        // Update the robot's position and rotation in the SVG
        this.robot.setAttribute(
            "transform",
            `translate(${this.currentX.toFixed(2)}, ${this.currentY.toFixed(2)}) rotate(${90 - this.currentAngle})`
        );

        // Add a trace point at the adjusted position
        if (this.tracePath) {
            const trace = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            trace.setAttribute("cx", traceX.toFixed(2));
            trace.setAttribute("cy", traceY.toFixed(2));
            trace.setAttribute("r", 0.8);
            trace.setAttribute("fill", this.traceColor);
            const svgRoot = document.getElementById("mission-field");
            svgRoot.appendChild(trace);
        }

        if (progress < 1) {
            requestAnimationFrame(animate); // Continue animation
        } else {
            // Ensure final position is accurate
            this.currentX = endX;
            this.currentY = endY;
            callback(); // Invoke callback when animation completes
        }
    };

    // Start the animation
    requestAnimationFrame(animate);
},
        rotateRobotStatic(angle, callback) {
    const startAngle = this.currentAngle;
    const targetAngle = startAngle + angle;
    const duration = 1000; // Animation duration in milliseconds (adjustable)
    const startTime = performance.now();

    const angleRadians = startAngle * (Math.PI / 180);
    const RoffsetX = this.selectedMission.offsetY * this.scaleY * Math.cos(angleRadians);
    const RoffsetY = -this.selectedMission.offsetY * this.scaleY * Math.sin(angleRadians);
    const adjustedX = this.currentX - RoffsetX;
    const adjustedY = this.currentY - RoffsetY;

    const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1); // Clamp progress to [0, 1]

        // Interpolate the angle based on progress
        const currentAngle = startAngle + (targetAngle - startAngle) * progress;
        const currentAngleRadians = currentAngle * (Math.PI / 180);

        // Calculate the offset at the current interpolated angle
        const RoffsetX2 = this.selectedMission.offsetY * this.scaleY * Math.cos(currentAngleRadians);
        const RoffsetY2 = -this.selectedMission.offsetY * this.scaleY * Math.sin(currentAngleRadians);

        const animatedX = adjustedX + RoffsetX2;
        const animatedY = adjustedY + RoffsetY2;

        // Update the transform with the interpolated values
        this.robot.setAttribute(
            "transform",
            `translate(${animatedX.toFixed(2)}, ${animatedY.toFixed(2)}) rotate(${90 - currentAngle})`
        );

        if (progress < 1) {
            // Continue animation if not finished
            requestAnimationFrame(animate);
        } else {
            // Finalize the state and invoke the callback
            this.currentAngle = targetAngle;
            callback();
        }

    };

    // Start the animation
    requestAnimationFrame(animate);
    console.log(`Final position rotate: (${this.currentX}, ${this.currentY})`);


}

    }
});
