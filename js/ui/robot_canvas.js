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

  drawFrontIndicator() {
    const halfWidth = this.robot.robotWidthCm / 2;
    const halfLength = this.robot.robotLengthCm / 2;
    const frontY = -halfLength;
    const markerSize = Math.max(1, Math.min(this.robot.robotWidthCm, this.robot.robotLengthCm) * 0.075);

    const frontEdge = document.createElementNS("http://www.w3.org/2000/svg", "line");
    frontEdge.setAttribute("data-front-indicator", "edge");
    frontEdge.setAttribute("x1", String(-halfWidth));
    frontEdge.setAttribute("y1", String(frontY));
    frontEdge.setAttribute("x2", String(halfWidth));
    frontEdge.setAttribute("y2", String(frontY));
    frontEdge.setAttribute("stroke", "#ed1c24");
    frontEdge.setAttribute("stroke-width", "0.45");
    frontEdge.setAttribute("stroke-linecap", "square");
    this.svg.appendChild(frontEdge);

    const pointer = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    pointer.setAttribute("data-front-indicator", "pointer");
    pointer.setAttribute(
      "points",
      [
        `0,${(frontY - markerSize).toFixed(2)}`,
        `${(-markerSize * 0.55).toFixed(2)},${(frontY + markerSize * 0.28).toFixed(2)}`,
        `${(markerSize * 0.55).toFixed(2)},${(frontY + markerSize * 0.28).toFixed(2)}`
      ].join(" ")
    );
    pointer.setAttribute("fill", "#ed1c24");
    pointer.setAttribute("stroke", "#ffffff");
    pointer.setAttribute("stroke-width", "0.15");
    this.svg.appendChild(pointer);
  }

  drawOffsetMarker() {
    const y = this.robot.offsetY;
    const radius = Math.max(0.75, Math.min(this.robot.robotWidthCm, this.robot.robotLengthCm) * 0.055);
    const cross = radius * 1.45;

    const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
    marker.setAttribute("data-offset-marker", "1");
    marker.setAttribute("fill", "rgba(125, 60, 152, 0.16)");
    marker.setAttribute("stroke", "#7d3c98");
    marker.setAttribute("stroke-width", "0.25");
    marker.setAttribute("stroke-linecap", "round");

    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", "0");
    ring.setAttribute("cy", String(y));
    ring.setAttribute("r", String(radius));
    marker.appendChild(ring);

    const horizontal = document.createElementNS("http://www.w3.org/2000/svg", "line");
    horizontal.setAttribute("x1", String(-cross));
    horizontal.setAttribute("y1", String(y));
    horizontal.setAttribute("x2", String(cross));
    horizontal.setAttribute("y2", String(y));
    marker.appendChild(horizontal);

    const vertical = document.createElementNS("http://www.w3.org/2000/svg", "line");
    vertical.setAttribute("x1", "0");
    vertical.setAttribute("y1", String(y - cross));
    vertical.setAttribute("x2", "0");
    vertical.setAttribute("y2", String(y + cross));
    marker.appendChild(vertical);

    this.svg.appendChild(marker);
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
    base.setAttribute("stroke-width", "0.35");
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
      rect.setAttribute("stroke-width", "0.3");
      rect.setAttribute("data-index", String(index));
      rect.setAttribute("cursor", "grab");
      this.svg.appendChild(rect);
    });

    this.drawOffsetMarker();
    this.drawFrontIndicator();
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
