// Import Vue.js (or include via a CDN script in your HTML)
const app = new Vue({
    el: '#app', // Bind Vue.js to your HTML container
    data: {
        missions: [], // Holds the mission data loaded from JSON
        selectedMission: null, // Tracks the current selected mission
        robot: null, // Reference to the robot element
        scaleX: null, // Scaling factor for X
        scaleY: null, // Scaling factor for Y
        currentX: null, // Current X position of the robot
        currentY: null, // Current Y position of the robot
        currentAngle: null, // Current angle of the robot
	tracePath: true	
    },
    methods: {
        // Trigger the file input dialog
        triggerFileUpload() {
            document.getElementById("file-upload").click();
        },
        // Load JSON file dynamically
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
        // Initialize mission
        initializeMission(mission) {
            this.selectedMission = mission;
            this.resetRobot();

            const svgRoot = document.getElementById("mission-field");
            this.scaleX = svgRoot.viewBox.baseVal.width / 200; // Adjust based on realWidth
            this.scaleY = this.scaleX; // Uniform scaling

            this.currentX = mission.startX * this.scaleX + mission.robotWidthCm * this.scaleX / 2;
            this.currentY = svgRoot.viewBox.baseVal.height - mission.startY * this.scaleY - mission.robotHeightCm * this.scaleY / 2 ;
            this.currentAngle = mission.startAngle;
	    this.traceColor = mission.traceColor;

            // Create robot SVG element
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
        // Start mission
        startMission() {
            if (!this.selectedMission) {
                alert("Please select a mission first");
                return;
            }
            this.executeActions([...this.selectedMission.actions]);
        },
        // Reset robot on new mission
        resetRobot() {
            const svgRoot = document.getElementById("mission-field");
            if (this.robot) {
                svgRoot.removeChild(this.robot);
                this.robot = null;
            }
        },
        // Execute robot actions
        executeActions(actions) {
            if (actions.length === 0) {
                console.log("Mission complete!");
                return;
            }

            const action = actions.shift();
            if (action.type === "move") {
                this.moveForward(action.value, () => this.executeActions(actions));
            } else if (action.type === "rotate") {
                this.rotateRobot(action.value, () => this.executeActions(actions));
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
        rotateRobot(angle, callback) {
            const fromAngle = this.currentAngle;
            const toAngle = fromAngle + angle;

            const duration = 1000;
            const startTime = performance.now();

            const animate = (currentTime) => {
                const elapsedTime = currentTime - startTime;
                const progress = Math.min(elapsedTime / duration, 1);
                const interpolatedAngle = fromAngle + progress * (toAngle - fromAngle);

                this.robot.setAttribute(
                    "transform",
                    `translate(${this.currentX}, ${this.currentY}) rotate(${90 - interpolatedAngle})`
                );

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.currentAngle = toAngle;
                    callback();
                }
            };

            requestAnimationFrame(animate);
        }
    },
    mounted() {
        // Trigger file upload automatically when the app loads
        this.triggerFileUpload();
    }
});
