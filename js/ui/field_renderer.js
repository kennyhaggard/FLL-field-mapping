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
    this.renderPauseOutlines(mission, frames, safeIndex);
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
    polyline.setAttribute("stroke", color || "#0066b3");
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

    trace.setAttribute("stroke", mission.traceColor || "#0066b3");
    trace.setAttribute("opacity", "1");
    trace.setAttribute("stroke-dasharray", "");
    trace.setAttribute("data-active-trace", "1");
    trace.setAttribute("data-training-trace", "");
    this.setTracePoints(trace, mission, frames, frameIndex);
  }

  setTracePoints(trace, mission, frames, frameIndex) {
    const safeIndex = typeof frameIndex === "number" ? frameIndex : frames.length - 1;
    const points = [];
    for (let index = 0; index <= safeIndex; index += 1) {
      const tracePoint = poseToTracePointCm(frames[index], mission);
      const svgPoint = this.fieldToSvgPoint(tracePoint.x, tracePoint.y);
      points.push(`${svgPoint.x.toFixed(2)},${svgPoint.y.toFixed(2)}`);
    }
    trace.setAttribute("points", points.join(" "));
  }

  addTraceOverlay(missionLike, frames, frameIndex, color = "#0066b3") {
    const mission = normalizeMission(missionLike);
    if (!this.svg || !Array.isArray(frames) || !frames.length) return null;

    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    polyline.setAttribute("data-training-trace", "1");
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", color);
    polyline.setAttribute("stroke-width", "3");
    polyline.setAttribute("stroke-linecap", "round");
    polyline.setAttribute("stroke-linejoin", "round");
    polyline.setAttribute("vector-effect", "non-scaling-stroke");
    polyline.setAttribute("opacity", "0.82");
    this.setTracePoints(polyline, mission, frames, frameIndex);
    this.svg.insertBefore(polyline, this.robotEl || null);
    return polyline;
  }

  clearTraceOverlays() {
    if (!this.svg) return;
    Array.from(this.svg.querySelectorAll('[data-training-trace="1"]')).forEach((node) => node.remove());
  }

  renderPauseOutlines(mission, frames, frameIndex) {
    if (!this.svg) return;

    Array.from(this.svg.querySelectorAll('[data-pause-outline="1"]')).forEach((node) => node.remove());

    const safeIndex = typeof frameIndex === "number" ? frameIndex : frames.length - 1;
    const pausePoses = new Map();
    for (let index = 0; index <= safeIndex; index += 1) {
      const frame = frames[index];
      if (!Number.isInteger(frame?.pauseActionIndex)) continue;
      if (!pausePoses.has(frame.pauseActionIndex)) {
        pausePoses.set(frame.pauseActionIndex, frame);
      }
    }

    pausePoses.forEach((pose) => {
      this.drawRobotOutline(mission, pose, "#7d3c98");
    });
  }

  drawRobotOutline(mission, pose, color) {
    const { scaleX, scaleY } = this.getScale();
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-dynamic", "1");
    group.setAttribute("data-pause-outline", "1");
    group.setAttribute("fill", "none");
    group.setAttribute("stroke", color);
    group.setAttribute("stroke-width", "1.6");
    group.setAttribute("stroke-linejoin", "round");
    group.setAttribute("vector-effect", "non-scaling-stroke");
    group.setAttribute("opacity", "0.9");

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
      attachmentEl.setAttribute("stroke-width", String(Math.max(1, Math.min(scaleX, scaleY) * 0.28)));
      group.appendChild(attachmentEl);
    });

    this.appendFrontIndicator(group, mission);

    this.svg.insertBefore(group, this.robotEl || null);
    this.updateGroupTransform(group, pose);
  }

  appendFrontIndicator(group, mission) {
    const { scaleX, scaleY } = this.getScale();
    const halfWidthSvg = (mission.robotWidthCm / 2) * scaleX;
    const halfLengthSvg = (mission.robotLengthCm / 2) * scaleY;
    const frontY = -halfLengthSvg;
    const markerSize = Math.max(4, Math.min(mission.robotWidthCm * scaleX, mission.robotLengthCm * scaleY) * 0.12);

    const frontEdge = document.createElementNS("http://www.w3.org/2000/svg", "line");
    frontEdge.setAttribute("data-front-indicator", "edge");
    frontEdge.setAttribute("x1", String(-halfWidthSvg));
    frontEdge.setAttribute("y1", String(frontY));
    frontEdge.setAttribute("x2", String(halfWidthSvg));
    frontEdge.setAttribute("y2", String(frontY));
    frontEdge.setAttribute("stroke", "#ed1c24");
    frontEdge.setAttribute("stroke-width", "2");
    frontEdge.setAttribute("stroke-linecap", "square");
    frontEdge.setAttribute("vector-effect", "non-scaling-stroke");
    group.appendChild(frontEdge);

    const pointer = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
    pointer.setAttribute("data-front-indicator", "pointer");
    pointer.setAttribute(
      "points",
      [
        `0,${(frontY - markerSize).toFixed(2)}`,
        `${(-markerSize * 0.75).toFixed(2)},${(frontY + markerSize * 0.45).toFixed(2)}`,
        `${(markerSize * 0.75).toFixed(2)},${(frontY + markerSize * 0.45).toFixed(2)}`
      ].join(" ")
    );
    pointer.setAttribute("fill", "#ed1c24");
    pointer.setAttribute("stroke", "#ffffff");
    pointer.setAttribute("stroke-width", "0.8");
    pointer.setAttribute("vector-effect", "non-scaling-stroke");
    group.appendChild(pointer);
  }

  appendOffsetMarker(group, mission) {
    const { scaleX, scaleY } = this.getScale();
    const y = mission.offsetY * scaleY;
    const radius = Math.max(3, Math.min(mission.robotWidthCm * scaleX, mission.robotLengthCm * scaleY) * 0.055);
    const cross = radius * 1.45;

    const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
    marker.setAttribute("data-offset-marker", "1");
    marker.setAttribute("fill", "rgba(125, 60, 152, 0.16)");
    marker.setAttribute("stroke", "#7d3c98");
    marker.setAttribute("stroke-width", "1.4");
    marker.setAttribute("stroke-linecap", "round");
    marker.setAttribute("vector-effect", "non-scaling-stroke");

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

    group.appendChild(marker);
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
    base.setAttribute("fill", "rgba(0, 102, 179, 0.22)");
    base.setAttribute("stroke", mission.traceColor);
    base.setAttribute("stroke-width", "1.25");
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
      attachmentEl.setAttribute("stroke-width", String(Math.max(0.9, Math.min(scaleX, scaleY) * 0.24)));
      group.appendChild(attachmentEl);
    });

    this.appendOffsetMarker(group, mission);
    this.appendFrontIndicator(group, mission);

    this.svg.appendChild(group);
    this.robotEl = group;
    this.updateRobotTransform(pose);
  }

  updateRobotTransform(poseLike) {
    if (!this.robotEl) return;
    this.updateGroupTransform(this.robotEl, poseLike);
  }

  updateGroupTransform(group, poseLike) {
    if (!group) return;
    const pose = poseLike || {};
    const svgPoint = this.fieldToSvgPoint(pose.x || 0, pose.y || 0);
    const headingDeg = Number.isFinite(pose.headingDeg) ? pose.headingDeg : pose.angle || 0;
    group.setAttribute(
      "transform",
      `translate(${svgPoint.x.toFixed(2)}, ${svgPoint.y.toFixed(2)}) rotate(${(90 - headingDeg).toFixed(2)})`
    );
  }
}

export { FieldRenderer };
