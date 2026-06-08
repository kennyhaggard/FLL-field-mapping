import {
  clampAttachmentPositionCm,
  computeRobotLocalBoundsCm,
  getAttachmentRectCm,
  normalizeRobot
} from "../domain/model.js";

class RobotCanvas {
  constructor(svg) {
    this.svg = svg;
    this.robot = normalizeRobot(null);
  }

  setRobot(robotLike) {
    this.robot = normalizeRobot(robotLike);
    this.render();
  }

  render() {
    if (!this.svg) return;

    const bounds = computeRobotLocalBoundsCm(this.robot);
    const padding = 10;
    const width = Math.max(40, bounds.xMax - bounds.xMin + padding * 2);
    const height = Math.max(40, bounds.yMax - bounds.yMin + padding * 2);
    this.svg.setAttribute(
      "viewBox",
      `${(bounds.xMin - padding).toFixed(2)} ${(-bounds.yMax - padding).toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`
    );
    this.svg.innerHTML = "";

    const base = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    base.setAttribute("x", String(-this.robot.robotWidthCm / 2));
    base.setAttribute("y", String(-this.robot.robotLengthCm / 2));
    base.setAttribute("width", String(this.robot.robotWidthCm));
    base.setAttribute("height", String(this.robot.robotLengthCm));
    base.setAttribute("fill", "rgba(0, 102, 179, 0.18)");
    base.setAttribute("stroke", "#0066b3");
    base.setAttribute("stroke-width", "1.6");
    this.svg.appendChild(base);

    this.robot.attachments.forEach((attachment, index) => {
      const rectCm = getAttachmentRectCm(attachment, this.robot);
      if (!rectCm) return;

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(rectCm.xMin));
      rect.setAttribute("y", String(-(rectCm.yMin + rectCm.height)));
      rect.setAttribute("width", String(rectCm.width));
      rect.setAttribute("height", String(rectCm.height));
      rect.setAttribute("fill", "rgba(37, 99, 235, 0.18)");
      rect.setAttribute("stroke", "#1e3a8a");
      rect.setAttribute("stroke-width", "1.2");
      rect.setAttribute("data-index", String(index));
      rect.setAttribute("cursor", "grab");
      this.svg.appendChild(rect);
    });
  }

  getLocalPoint(evt) {
    const svgPoint = this.svg.createSVGPoint();
    svgPoint.x = evt.clientX;
    svgPoint.y = evt.clientY;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const point = svgPoint.matrixTransform(ctm.inverse());
    return { x: point.x, y: -point.y };
  }

  updateDraggedAttachment(index, evt) {
    const attachment = this.robot.attachments[index];
    if (!attachment) return this.robot;

    const point = this.getLocalPoint(evt);
    const nextPosition =
      attachment.side === "front" || attachment.side === "rear" ? point.x : point.y;

    attachment.positionCm = clampAttachmentPositionCm(this.robot, attachment, nextPosition);
    this.robot = normalizeRobot(this.robot);
    this.render();
    return this.robot;
  }
}

export { RobotCanvas };
