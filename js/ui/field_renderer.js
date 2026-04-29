import { FIELD_WIDTH_CM } from "../domain/constants.js";
import {
  computeStartPoseCm,
  getAttachmentRectCm,
  normalizeMission,
  poseToTracePointCm
} from "../domain/model.js";

class FieldRenderer {
  constructor(host, fieldSvgUrl = "./field.svg") {
    this.host = host;
    this.fieldSvgUrl = fieldSvgUrl;
    this.svg = null;
    this.robotEl = null;
    this.traceEl = null;
  }

  async load() {
    if (!this.host) return false;

    try {
      const response = await fetch(this.fieldSvgUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      this.host.innerHTML = await response.text();
      this.svg = this.host.querySelector("#mission-field");
      if (!this.svg) {
        throw new Error("Mission field SVG is missing its root id.");
      }

      this.host.removeAttribute("data-state");
      return true;
    } catch (error) {
      this.host.dataset.state = "error";
      this.host.textContent = "Could not load the field artwork. Refresh the page and try again.";
      return false;
    }
  }

  clearDynamic() {
    if (!this.svg) return;
    Array.from(this.svg.querySelectorAll('[data-dynamic="1"]')).forEach((node) => node.remove());
    this.robotEl = null;
    this.traceEl = null;
  }

  renderMission(missionLike) {
    const mission = normalizeMission(missionLike);
    const startPose = computeStartPoseCm(mission);
    this.clearDynamic();
    this.renderTrace(mission, [startPose], 0);
    this.drawRobot(mission, startPose);
  }

  renderFrameSequence(missionLike, frames, frameIndex) {
    const mission = normalizeMission(missionLike);
    if (!Array.isArray(frames) || !frames.length) return;

    const safeIndex = Math.max(0, Math.min(frameIndex, frames.length - 1));
    const pose = frames[safeIndex];

    if (!this.robotEl) {
      this.drawRobot(mission, pose);
    } else {
      this.updateRobotTransform(pose);
    }

    this.renderTrace(mission, frames, safeIndex);
  }

  getScale() {
    if (!this.svg) return { scaleX: 1, scaleY: 1 };
    const width = this.svg.viewBox.baseVal.width || this.svg.clientWidth || FIELD_WIDTH_CM;
    const scale = width / FIELD_WIDTH_CM;
    return { scaleX: scale, scaleY: scale };
  }

  fieldToSvgPoint(xCm, yCm) {
    const { scaleX, scaleY } = this.getScale();
    const fieldHeightSvg = this.svg?.viewBox?.baseVal?.height || 0;
    return {
      x: xCm * scaleX,
      y: fieldHeightSvg - yCm * scaleY
    };
  }

  rectToSvg(rectCm) {
    const { scaleX, scaleY } = this.getScale();
    return {
      x: rectCm.xMin * scaleX,
      y: -(rectCm.yMin + rectCm.height) * scaleY,
      width: rectCm.width * scaleX,
      height: rectCm.height * scaleY
    };
  }

  ensureTrace(color) {
    if (this.traceEl) return this.traceEl;
    if (!this.svg) return null;

    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("data-dynamic", "1");
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", color || "#108368");
    polyline.setAttribute("stroke-width", "2.4");
    polyline.setAttribute("stroke-linecap", "round");
    polyline.setAttribute("stroke-linejoin", "round");
    polyline.setAttribute("vector-effect", "non-scaling-stroke");
    this.svg.appendChild(polyline);
    this.traceEl = polyline;
    return polyline;
  }

  renderTrace(mission, frames, frameIndex) {
    const trace = this.ensureTrace(mission.traceColor);
    if (!trace) return;

    const safeIndex = typeof frameIndex === "number" ? frameIndex : frames.length - 1;
    const points = [];
    for (let index = 0; index <= safeIndex; index += 1) {
      const tracePoint = poseToTracePointCm(frames[index], mission);
      const svgPoint = this.fieldToSvgPoint(tracePoint.x, tracePoint.y);
      points.push(`${svgPoint.x.toFixed(2)},${svgPoint.y.toFixed(2)}`);
    }
    trace.setAttribute("points", points.join(" "));
  }

  drawRobot(mission, pose) {
    if (!this.svg) return;

    const { scaleX, scaleY } = this.getScale();
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-dynamic", "1");

    const baseRect = this.rectToSvg({
      xMin: -mission.robotWidthCm / 2,
      yMin: -mission.robotLengthCm / 2,
      width: mission.robotWidthCm,
      height: mission.robotLengthCm
    });
    const base = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    base.setAttribute("x", baseRect.x);
    base.setAttribute("y", baseRect.y);
    base.setAttribute("width", baseRect.width);
    base.setAttribute("height", baseRect.height);
    base.setAttribute("fill", "rgba(16, 131, 104, 0.24)");
    base.setAttribute("stroke", mission.traceColor);
    base.setAttribute("stroke-width", "2");
    group.appendChild(base);

    mission.attachments.forEach((attachment) => {
      const rectCm = getAttachmentRectCm(attachment, mission);
      if (!rectCm) return;
      const rect = this.rectToSvg(rectCm);
      const attachmentEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      attachmentEl.setAttribute("x", rect.x);
      attachmentEl.setAttribute("y", rect.y);
      attachmentEl.setAttribute("width", rect.width);
      attachmentEl.setAttribute("height", rect.height);
      attachmentEl.setAttribute("fill", "rgba(37, 99, 235, 0.2)");
      attachmentEl.setAttribute("stroke", "#1e3a8a");
      attachmentEl.setAttribute("stroke-width", String(Math.max(1.2, Math.min(scaleX, scaleY) * 0.35)));
      group.appendChild(attachmentEl);
    });

    this.svg.appendChild(group);
    this.robotEl = group;
    this.updateRobotTransform(pose);
  }

  updateRobotTransform(poseLike) {
    if (!this.robotEl) return;
    const pose = poseLike || {};
    const svgPoint = this.fieldToSvgPoint(pose.x || 0, pose.y || 0);
    const headingDeg = Number.isFinite(pose.headingDeg) ? pose.headingDeg : pose.angle || 0;
    this.robotEl.setAttribute(
      "transform",
      `translate(${svgPoint.x.toFixed(2)}, ${svgPoint.y.toFixed(2)}) rotate(${(90 - headingDeg).toFixed(2)})`
    );
  }
}

export { FieldRenderer };
