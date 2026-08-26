import { FIELD_WIDTH_CM } from "../domain/constants.js";
import {
  buildReplayFrames,
  computeBearingMove,
  computeRobotLocalBoundsCm,
  computeStartPoseCm,
  fieldAngleToGlobalHeading,
  getAttachmentRectCm,
  normalizeMission,
  poseToTracePointCm
} from "../domain/model.js?v=global-zero-direction";

function colorWithAlpha(hexColor, alpha) {
  const match = String(hexColor || "").match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  if (!match) return `rgba(0, 102, 179, ${alpha})`;
  const [, r, g, b] = match;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
}

class FieldRenderer {
  constructor(host, fieldSvgUrl = "./field.svg?v=mission-model-layer-2") {
    this.host = host;
    this.fieldSvgUrl = fieldSvgUrl;
    this.svg = null;
    this.robotEl = null;
    this.traceEl = null;
    this.wireframeOpacity = 1;
    this.graphicalOpacity = 0.66;
    this.missionModelOpacity = 1;
    this.backgroundMode = "wireframe";
    this.currentPose = null;
    this.onRobotDragStart = null;
    this.onRobotDrop = null;
  }

  setRobotDragHandlers({ onStart, onDrop } = {}) {
    this.onRobotDragStart = typeof onStart === "function" ? onStart : null;
    this.onRobotDrop = typeof onDrop === "function" ? onDrop : null;
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

      this.setWireframeOpacity(this.wireframeOpacity);
      this.setGraphicalOpacity(this.graphicalOpacity);
      this.setMissionModelOpacity(this.missionModelOpacity);
      this.setBackgroundMode(this.backgroundMode);

      this.host.removeAttribute("data-state");
      return true;
    } catch (error) {
      this.host.dataset.state = "error";
      this.host.textContent = "Could not load the field artwork. Refresh the page and try again.";
      return false;
    }
  }

  setWireframeOpacity(opacity) {
    const numericOpacity = Number(opacity);
    this.wireframeOpacity = Number.isFinite(numericOpacity)
      ? Math.max(0, Math.min(1, numericOpacity))
      : 1;

    if (this.host) this.host.style.setProperty("--wireframe-opacity", String(this.wireframeOpacity));
  }

  setGraphicalOpacity(opacity) {
    const numericOpacity = Number(opacity);
    this.graphicalOpacity = Number.isFinite(numericOpacity)
      ? Math.max(0, Math.min(1, numericOpacity))
      : 0.66;

    if (this.host) {
      this.host.style.setProperty("--graphical-opacity", String(this.graphicalOpacity));
      this.host.style.setProperty("--graphical-grayscale", String(1 - this.graphicalOpacity));
      this.host.style.setProperty("--graphical-saturation", String(this.graphicalOpacity));
      this.host.style.setProperty("--graphical-contrast", String(0.35 + this.graphicalOpacity * 0.65));
    }
  }

  setMissionModelOpacity(opacity) {
    const numericOpacity = Number(opacity);
    this.missionModelOpacity = Number.isFinite(numericOpacity)
      ? Math.max(0, Math.min(1, numericOpacity))
      : 1;

    if (this.host) {
      this.host.style.setProperty("--mission-model-opacity", String(this.missionModelOpacity));
    }
  }

  setBackgroundMode(mode) {
    this.backgroundMode = ["wireframe", "graphical", "overlay"].includes(mode) ? mode : "wireframe";
    if (this.host) this.host.dataset.background = this.backgroundMode;

    const backgroundImage = this.svg?.querySelector("#field-background-image");
    if (backgroundImage) backgroundImage.style.display = this.backgroundMode === "wireframe" ? "none" : "inline";

    const artwork = this.svg?.querySelector("#field-artwork");
    if (artwork) artwork.style.display = this.backgroundMode === "graphical" ? "none" : "";
  }

  clearDynamic() {
    if (!this.svg) return;
    Array.from(this.svg.querySelectorAll('[data-dynamic="1"]')).forEach((node) => node.remove());
    this.robotEl = null;
    this.traceEl = null;
    this.currentPose = null;
  }

  renderMission(missionLike) {
    const mission = normalizeMission(missionLike);
    const frames = buildReplayFrames(mission);
    const finalPose = frames[frames.length - 1] || computeStartPoseCm(mission);
    this.clearDynamic();
    this.renderTrace(mission, frames, frames.length - 1);
    this.drawRobot(mission, finalPose);
  }

  renderStartPosition(missionLike) {
    const mission = normalizeMission(missionLike);
    this.clearDynamic();
    this.drawRobot(mission, computeStartPoseCm(mission));
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
    this.updateVisibleAttachments(pose.visibleAttachmentIndexes);

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

  eventToFieldPoint(event) {
    if (!this.svg) return null;
    const ctm = this.svg.getScreenCTM();
    if (!ctm) return null;

    const svgPoint = this.svg.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const localPoint = svgPoint.matrixTransform(ctm.inverse());
    const { scaleX, scaleY } = this.getScale();
    const fieldHeightSvg = this.svg.viewBox.baseVal.height || 0;
    return {
      x: localPoint.x / scaleX,
      y: (fieldHeightSvg - localPoint.y) / scaleY
    };
  }

  constrainDragEndPoint(rawEndPoint, startPoint, startHeadingDeg, mission) {
    const { scaleY } = this.getScale();
    const fieldHeightCm = (this.svg?.viewBox?.baseVal?.height || 0) / scaleY;
    let endPoint = { ...rawEndPoint };

    for (let iteration = 0; iteration < 3; iteration += 1) {
      const movement = computeBearingMove(startPoint, endPoint, startHeadingDeg);
      const radians = (movement.headingDeg * Math.PI) / 180;
      const localBounds = {
        xMin: -mission.robotWidthCm / 2,
        xMax: mission.robotWidthCm / 2,
        yMin: -mission.robotLengthCm / 2,
        yMax: mission.robotLengthCm / 2
      };
      const corners = [
        [localBounds.xMin, localBounds.yMin],
        [localBounds.xMin, localBounds.yMax],
        [localBounds.xMax, localBounds.yMin],
        [localBounds.xMax, localBounds.yMax]
      ].map(([x, y]) => ({
        x: Math.cos(radians) * y + Math.sin(radians) * x,
        y: Math.sin(radians) * y - Math.cos(radians) * x
      }));
      const minX = Math.min(...corners.map((corner) => corner.x));
      const maxX = Math.max(...corners.map((corner) => corner.x));
      const minY = Math.min(...corners.map((corner) => corner.y));
      const maxY = Math.max(...corners.map((corner) => corner.y));
      const offsetX = Math.cos(radians) * mission.offsetY;
      const offsetY = Math.sin(radians) * mission.offsetY;
      endPoint = {
        x: Math.max(-minX - offsetX, Math.min(FIELD_WIDTH_CM - maxX - offsetX, rawEndPoint.x)),
        y: Math.max(-minY - offsetY, Math.min(fieldHeightCm - maxY - offsetY, rawEndPoint.y))
      };
    }

    return endPoint;
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
    polyline.setAttribute("stroke-width", "4");
    polyline.setAttribute("stroke-linecap", "round");
    polyline.setAttribute("stroke-linejoin", "round");
    polyline.setAttribute("vector-effect", "non-scaling-stroke");
    this.svg.appendChild(polyline);
    this.traceEl = polyline;
    return polyline;
  }

  getVisibleRobotBounds(mission, selection) {
    const visibleAttachments = selection === "all" || !Array.isArray(selection)
      ? mission.attachments
      : mission.attachments.filter((_, index) => selection.includes(index));
    return computeRobotLocalBoundsCm({ ...mission, attachments: visibleAttachments });
  }

  renderTraceCorridor(mission, frames, frameIndex, trace) {
    this.svg.querySelector('[data-replay-corridor="1"]')?.remove();
    const safeIndex = typeof frameIndex === "number" ? frameIndex : frames.length - 1;
    const segments = [];

    for (let index = 1; index <= safeIndex; index += 1) {
      const startPoint = poseToTracePointCm(frames[index - 1], mission);
      const endPoint = poseToTracePointCm(frames[index], mission);
      const deltaX = endPoint.x - startPoint.x;
      const deltaY = endPoint.y - startPoint.y;
      const distanceCm = Math.hypot(deltaX, deltaY);
      if (distanceCm <= 0.0001) continue;

      const bounds = this.getVisibleRobotBounds(mission, frames[index].visibleAttachmentIndexes);
      const lateralUnit = { x: deltaY / distanceCm, y: -deltaX / distanceCm };
      const edgePoints = [bounds.xMin, bounds.xMax].map((offset) => ({
        start: this.fieldToSvgPoint(
          startPoint.x + lateralUnit.x * offset,
          startPoint.y + lateralUnit.y * offset
        ),
        end: this.fieldToSvgPoint(
          endPoint.x + lateralUnit.x * offset,
          endPoint.y + lateralUnit.y * offset
        )
      }));
      const startSvg = this.fieldToSvgPoint(startPoint.x, startPoint.y);
      const endSvg = this.fieldToSvgPoint(endPoint.x, endPoint.y);
      const previous = segments[segments.length - 1];
      const previousDirection = previous && {
        x: previous.end.x - previous.start.x,
        y: previous.end.y - previous.start.y
      };
      const currentDirection = {
        x: endSvg.x - startSvg.x,
        y: endSvg.y - startSvg.y
      };
      const directionsAlign = previous &&
        Math.abs(previousDirection.x * currentDirection.y - previousDirection.y * currentDirection.x) < 0.001 &&
        previousDirection.x * currentDirection.x + previousDirection.y * currentDirection.y > 0;
      const widthsMatch = previous && edgePoints.every((edge, edgeIndex) => (
        Math.hypot(
          edge.start.x - previous.edges[edgeIndex].end.x,
          edge.start.y - previous.edges[edgeIndex].end.y
        ) < 0.01
      ));
      if (directionsAlign && widthsMatch) {
        previous.end = endSvg;
        previous.edges.forEach((edge, edgeIndex) => {
          edge.end = edgePoints[edgeIndex].end;
        });
        continue;
      }
      segments.push({
        start: startSvg,
        end: endSvg,
        edges: edgePoints,
        connectedEdges: [false, false],
        edgeJoins: [null, null]
      });
    }

    if (!segments.length) return;
    const pointDistance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);
    for (let index = 1; index < segments.length; index += 1) {
      const previous = segments[index - 1];
      const current = segments[index];
      if (pointDistance(previous.end, current.start) > 0.01) continue;
      const previousDirection = {
        x: previous.end.x - previous.start.x,
        y: previous.end.y - previous.start.y
      };
      const currentDirection = {
        x: current.end.x - current.start.x,
        y: current.end.y - current.start.y
      };
      const turnCross = previousDirection.x * currentDirection.y -
        previousDirection.y * currentDirection.x;
      [0, 1].forEach((edgeIndex) => {
        const previousEdge = previous.edges[edgeIndex];
        const currentEdge = current.edges[edgeIndex];
        if (pointDistance(previousEdge.end, currentEdge.start) <= 0.01) {
          current.connectedEdges[edgeIndex] = true;
          return;
        }
        const previousRadius = pointDistance(previousEdge.end, previous.end);
        const currentRadius = pointDistance(currentEdge.start, current.start);
        current.connectedEdges[edgeIndex] = true;
        current.edgeJoins[edgeIndex] = {
          type: "arc",
          center: previous.end,
          radius: (previousRadius + currentRadius) / 2,
          sweep: turnCross > 0 ? 1 : 0,
          start: { ...previousEdge.end },
          end: { ...currentEdge.start }
        };
      });
    }

    const fillSegments = [];
    const edgeSegments = [[], []];
    const corridorPolygons = segments.map((segment) => [
      segment.edges[0].start,
      segment.edges[0].end,
      segment.edges[1].end,
      segment.edges[1].start
    ]);
    const pointInPolygon = (point, polygon) => {
      let inside = false;
      for (let currentIndex = 0, previousIndex = polygon.length - 1;
        currentIndex < polygon.length;
        previousIndex = currentIndex, currentIndex += 1) {
        const current = polygon[currentIndex];
        const previous = polygon[previousIndex];
        const crosses = (current.y > point.y) !== (previous.y > point.y) &&
          point.x < ((previous.x - current.x) * (point.y - current.y)) /
            (previous.y - current.y) + current.x;
        if (crosses) inside = !inside;
      }
      return inside;
    };
    const clipEdgeOutsidePolygons = (edge, ownPolygonIndex) => {
      let intervals = [[0, 1]];
      const direction = {
        x: edge.end.x - edge.start.x,
        y: edge.end.y - edge.start.y
      };
      corridorPolygons.forEach((polygon, polygonIndex) => {
        if (polygonIndex === ownPolygonIndex || !intervals.length) return;
        const intersections = [0, 1];
        polygon.forEach((point, index) => {
          const next = polygon[(index + 1) % polygon.length];
          const polygonDirection = { x: next.x - point.x, y: next.y - point.y };
          const denominator = direction.x * polygonDirection.y - direction.y * polygonDirection.x;
          if (Math.abs(denominator) < 0.000001) return;
          const delta = { x: point.x - edge.start.x, y: point.y - edge.start.y };
          const edgeScale = (delta.x * polygonDirection.y - delta.y * polygonDirection.x) / denominator;
          const polygonScale = (delta.x * direction.y - delta.y * direction.x) / denominator;
          if (edgeScale > 0 && edgeScale < 1 && polygonScale >= 0 && polygonScale <= 1) {
            intersections.push(edgeScale);
          }
        });
        intersections.sort((first, second) => first - second);
        const outsideIntervals = [];
        for (let index = 1; index < intersections.length; index += 1) {
          const start = intersections[index - 1];
          const end = intersections[index];
          const middle = (start + end) / 2;
          const middlePoint = {
            x: edge.start.x + direction.x * middle,
            y: edge.start.y + direction.y * middle
          };
          if (!pointInPolygon(middlePoint, polygon)) outsideIntervals.push([start, end]);
        }
        intervals = intervals.flatMap(([intervalStart, intervalEnd]) => (
          outsideIntervals
            .map(([outsideStart, outsideEnd]) => [
              Math.max(intervalStart, outsideStart),
              Math.min(intervalEnd, outsideEnd)
            ])
            .filter(([start, end]) => end - start > 0.0001)
        ));
      });
      return intervals.map(([start, end]) => ({
        start: {
          x: edge.start.x + direction.x * start,
          y: edge.start.y + direction.y * start
        },
        end: {
          x: edge.start.x + direction.x * end,
          y: edge.start.y + direction.y * end
        }
      }));
    };
    segments.forEach((segment, index) => {
      fillSegments.push(
        `M ${segment.edges[0].start.x} ${segment.edges[0].start.y}`,
        `L ${segment.edges[0].end.x} ${segment.edges[0].end.y}`,
        `L ${segment.edges[1].end.x} ${segment.edges[1].end.y}`,
        `L ${segment.edges[1].start.x} ${segment.edges[1].start.y} Z`
      );
      const previous = segments[index - 1];
      const isConnected = previous && pointDistance(previous.end, segment.start) <= 0.01;
      if (isConnected) {
        fillSegments.push(
          `M ${previous.edges[0].end.x} ${previous.edges[0].end.y}`,
          `L ${segment.edges[0].start.x} ${segment.edges[0].start.y}`,
          `L ${segment.edges[1].start.x} ${segment.edges[1].start.y}`,
          `L ${previous.edges[1].end.x} ${previous.edges[1].end.y} Z`
        );
        segment.edgeJoins.forEach((join) => {
          if (join?.type !== "arc") return;
          fillSegments.push(
            `M ${join.center.x} ${join.center.y}`,
            `L ${join.start.x} ${join.start.y}`,
            `A ${join.radius} ${join.radius} 0 0 ${join.sweep} ${join.end.x} ${join.end.y}`,
            `L ${join.center.x} ${join.center.y} Z`
          );
        });
      }
      segment.edges.forEach((edge, edgeIndex) => {
        clipEdgeOutsidePolygons(edge, index).forEach((visibleEdge) => {
          edgeSegments[edgeIndex].push(
            `M ${visibleEdge.start.x} ${visibleEdge.start.y}`,
            `L ${visibleEdge.end.x} ${visibleEdge.end.y}`
          );
        });
      });
    });
    segments.forEach((segment) => {
      segment.edgeJoins.forEach((join, edgeIndex) => {
        if (join?.type !== "arc") return;
        edgeSegments[edgeIndex].push(
          `M ${join.start.x} ${join.start.y}`,
          `A ${join.radius} ${join.radius} 0 0 ${join.sweep} ${join.end.x} ${join.end.y}`
        );
      });
    });

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-dynamic", "1");
    group.setAttribute("data-replay-corridor", "1");

    const fill = document.createElementNS("http://www.w3.org/2000/svg", "path");
    fill.setAttribute("data-replay-corridor-fill", "1");
    fill.setAttribute("d", fillSegments.join(" "));
    fill.setAttribute("fill", mission.traceColor);
    fill.setAttribute("opacity", "0.3");

    const edges = document.createElementNS("http://www.w3.org/2000/svg", "path");
    edges.setAttribute("data-replay-corridor-edges", "1");
    edges.setAttribute("d", edgeSegments.flat().join(" "));
    edges.setAttribute("fill", "none");
    edges.setAttribute("stroke", mission.traceColor);
    edges.setAttribute("stroke-width", "2");
    edges.setAttribute("stroke-dasharray", "1 7");
    edges.setAttribute("stroke-linecap", "round");
    edges.setAttribute("opacity", "0.36");
    edges.setAttribute("vector-effect", "non-scaling-stroke");

    group.append(fill, edges);
    this.svg.insertBefore(group, trace);
  }

  renderTrace(mission, frames, frameIndex) {
    const trace = this.ensureTrace(mission.traceColor);
    if (!trace) return;

    trace.setAttribute("stroke", mission.traceColor || "#0066b3");
    trace.setAttribute("opacity", "1");
    trace.setAttribute("stroke-dasharray", "");
    trace.setAttribute("data-active-trace", "1");
    trace.setAttribute("data-training-trace", "");
    this.renderTraceCorridor(mission, frames, frameIndex, trace);
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
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-dynamic", "1");
    group.setAttribute("data-pause-outline", "1");
    group.setAttribute("fill", "none");
    group.setAttribute("stroke", color);
    group.setAttribute("stroke-width", "1.25");
    group.setAttribute("stroke-linejoin", "round");
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

    mission.attachments.forEach((attachment, index) => {
      if (pose.visibleAttachmentIndexes !== "all" && !pose.visibleAttachmentIndexes?.includes(index)) return;
      const rectCm = getAttachmentRectCm(attachment, mission);
      if (!rectCm) return;
      const rect = this.rectToSvg(rectCm);
      const attachmentEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      attachmentEl.setAttribute("x", rect.x);
      attachmentEl.setAttribute("y", rect.y);
      attachmentEl.setAttribute("width", rect.width);
      attachmentEl.setAttribute("height", rect.height);
      attachmentEl.setAttribute("stroke-width", "1");
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
    const markerSize = Math.max(3, Math.min(mission.robotWidthCm * scaleX, mission.robotLengthCm * scaleY) * 0.075);

    const frontEdge = document.createElementNS("http://www.w3.org/2000/svg", "line");
    frontEdge.setAttribute("data-front-indicator", "edge");
    frontEdge.setAttribute("x1", String(-halfWidthSvg));
    frontEdge.setAttribute("y1", String(frontY));
    frontEdge.setAttribute("x2", String(halfWidthSvg));
    frontEdge.setAttribute("y2", String(frontY));
    frontEdge.setAttribute("stroke", "#ed1c24");
    frontEdge.setAttribute("stroke-width", "1.25");
    frontEdge.setAttribute("stroke-linecap", "square");
    group.appendChild(frontEdge);

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
    pointer.setAttribute("stroke-width", "0.44");
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
    marker.setAttribute("stroke-width", "1");
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

    group.appendChild(marker);
  }

  drawRobot(mission, pose) {
    if (!this.svg) return;

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
    base.setAttribute("fill", colorWithAlpha(mission.robotColor, 0.22));
    base.setAttribute("stroke", mission.robotColor);
    base.setAttribute("stroke-width", "1");
    group.appendChild(base);

    mission.attachments.forEach((attachment, index) => {
      const rectCm = getAttachmentRectCm(attachment, mission);
      if (!rectCm) return;
      const rect = this.rectToSvg(rectCm);
      const attachmentEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      attachmentEl.setAttribute("x", rect.x);
      attachmentEl.setAttribute("y", rect.y);
      attachmentEl.setAttribute("width", rect.width);
      attachmentEl.setAttribute("height", rect.height);
      attachmentEl.setAttribute("fill", colorWithAlpha(mission.robotColor, 0.18));
      attachmentEl.setAttribute("stroke", mission.robotColor);
      attachmentEl.setAttribute("stroke-width", "0.81");
      attachmentEl.setAttribute("data-robot-attachment-index", String(index));
      group.appendChild(attachmentEl);
    });

    this.appendOffsetMarker(group, mission);
    this.appendFrontIndicator(group, mission);

    this.svg.appendChild(group);
    this.robotEl = group;
    this.updateRobotTransform(pose);
    this.updateVisibleAttachments(pose.visibleAttachmentIndexes);
    this.enableRobotDragging(group, mission, pose);
  }

  updateVisibleAttachments(selection) {
    if (!this.robotEl) return;
    this.robotEl.querySelectorAll("[data-robot-attachment-index]").forEach((attachmentEl) => {
      const index = Number(attachmentEl.getAttribute("data-robot-attachment-index"));
      attachmentEl.setAttribute(
        "display",
        selection === "all" || selection?.includes(index) ? "inline" : "none"
      );
    });
  }

  enableRobotDragging(group, mission, pose) {
    if (!this.onRobotDrop) return;

    group.setAttribute("data-draggable-robot", "1");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", "Drag robot to add a turn and move");

    group.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const pointerStart = this.eventToFieldPoint(event);
      if (!pointerStart) return;

      event.preventDefault();
      this.onRobotDragStart?.();
      group.setPointerCapture(event.pointerId);
      group.setAttribute("data-dragging", "1");

      const startPose = { ...(this.currentPose || pose) };
      const startPoint = poseToTracePointCm(startPose, mission);
      const preview = this.createDragPreview();
      let result = null;

      const move = (moveEvent) => {
        const pointer = this.eventToFieldPoint(moveEvent);
        if (!pointer) return;

        const rawEndPoint = {
          x: startPoint.x + pointer.x - pointerStart.x,
          y: startPoint.y + pointer.y - pointerStart.y
        };
        const endPoint = this.constrainDragEndPoint(rawEndPoint, startPoint, startPose.headingDeg, mission);
        const movement = computeBearingMove(startPoint, endPoint, startPose.headingDeg);
        const radians = (movement.headingDeg * Math.PI) / 180;
        const nextPose = {
          x: endPoint.x + Math.cos(radians) * mission.offsetY,
          y: endPoint.y + Math.sin(radians) * mission.offsetY,
          headingDeg: movement.headingDeg,
          turnCenterX: endPoint.x,
          turnCenterY: endPoint.y
        };

        result = { ...movement, startPoint, endPoint, startPose, nextPose };
        this.updateRobotTransform(nextPose);
        this.updateDragPreview(preview, result, mission, pointer);
      };

      const finish = (finishEvent) => {
        group.removeEventListener("pointermove", move);
        group.removeEventListener("pointerup", finish);
        group.removeEventListener("pointercancel", cancel);
        group.removeAttribute("data-dragging");
        preview.guides.remove();
        preview.popup.remove();
        if (group.hasPointerCapture(finishEvent.pointerId)) {
          group.releasePointerCapture(finishEvent.pointerId);
        }
        if (result?.distanceCm > 0.05) {
          this.onRobotDrop(result);
        } else {
          this.renderMission(mission);
        }
      };

      const cancel = (cancelEvent) => {
        result = null;
        finish(cancelEvent);
      };

      group.addEventListener("pointermove", move);
      group.addEventListener("pointerup", finish);
      group.addEventListener("pointercancel", cancel);
    });
  }

  createDragPreview() {
    const guides = document.createElementNS("http://www.w3.org/2000/svg", "g");
    guides.setAttribute("data-dynamic", "1");
    guides.setAttribute("data-drag-preview", "1");
    guides.innerHTML = [
      '<polygon data-drag-corridor="1" />',
      '<line data-drag-edge="left" vector-effect="non-scaling-stroke" />',
      '<line data-drag-edge="right" vector-effect="non-scaling-stroke" />',
      '<line data-drag-line="1" vector-effect="non-scaling-stroke" />',
      '<circle data-drag-origin="1" r="5" vector-effect="non-scaling-stroke" />'
    ].join("");
    const popup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    popup.setAttribute("data-dynamic", "1");
    popup.setAttribute("data-drag-popup", "1");
    popup.setAttribute("pointer-events", "none");
    popup.innerHTML = [
      '<rect data-drag-label-background="1" rx="6" ry="6" vector-effect="non-scaling-stroke" />',
      '<text data-drag-label="1" text-anchor="middle"></text>'
    ].join("");
    this.svg.insertBefore(guides, this.robotEl);
    this.svg.appendChild(popup);
    return { guides, popup };
  }

  updateDragPreview(preview, result, mission, pointer) {
    const start = this.fieldToSvgPoint(result.startPoint.x, result.startPoint.y);
    const end = this.fieldToSvgPoint(result.endPoint.x, result.endPoint.y);
    const line = preview.guides.querySelector("[data-drag-line]");
    line.setAttribute("x1", start.x);
    line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x);
    line.setAttribute("y2", end.y);

    const localBounds = this.getVisibleRobotBounds(
      mission,
      result.startPose.visibleAttachmentIndexes
    );
    const lateralUnit = {
      x: (result.endPoint.y - result.startPoint.y) / result.distanceCm,
      y: -(result.endPoint.x - result.startPoint.x) / result.distanceCm
    };
    const edgePoints = [localBounds.xMin, localBounds.xMax].map((lateralOffset, index) => {
      const edgeStart = this.fieldToSvgPoint(
        result.startPoint.x + lateralUnit.x * lateralOffset,
        result.startPoint.y + lateralUnit.y * lateralOffset
      );
      const edgeEnd = this.fieldToSvgPoint(
        result.endPoint.x + lateralUnit.x * lateralOffset,
        result.endPoint.y + lateralUnit.y * lateralOffset
      );
      const edge = preview.guides.querySelector(`[data-drag-edge="${index === 0 ? "left" : "right"}"]`);
      edge.setAttribute("x1", edgeStart.x);
      edge.setAttribute("y1", edgeStart.y);
      edge.setAttribute("x2", edgeEnd.x);
      edge.setAttribute("y2", edgeEnd.y);
      return { start: edgeStart, end: edgeEnd };
    });
    const corridor = preview.guides.querySelector("[data-drag-corridor]");
    corridor.setAttribute("points", [
      edgePoints[0].start,
      edgePoints[0].end,
      edgePoints[1].end,
      edgePoints[1].start
    ].map((point) => `${point.x},${point.y}`).join(" "));

    const origin = preview.guides.querySelector("[data-drag-origin]");
    origin.setAttribute("cx", start.x);
    origin.setAttribute("cy", start.y);

    const label = preview.popup.querySelector("[data-drag-label]");
    const angleDeg = mission.headingMode === "global"
      ? fieldAngleToGlobalHeading(result.headingDeg, mission.globalZeroDirection)
      : result.turnDeg;
    label.textContent = `${angleDeg.toFixed(1)}° / ${result.distanceCm.toFixed(1)} cm`;

    const cursor = this.fieldToSvgPoint(pointer.x, pointer.y);
    const viewBox = this.svg.viewBox.baseVal;
    const screenMatrix = this.svg.getScreenCTM();
    const screenScale = Math.hypot(screenMatrix?.a || 1, screenMatrix?.b || 0) || 1;
    const padding = 8;
    const labelPaddingX = 6 / screenScale;
    const labelPaddingY = 3 / screenScale;
    const gap = 10 / screenScale;
    label.style.fontSize = `${13 / screenScale}px`;
    const cursorX = Math.max(padding, Math.min(viewBox.width - padding, cursor.x));
    const cursorY = Math.max(padding, Math.min(viewBox.height - padding, cursor.y));
    const placeOnRight = viewBox.width - cursorX >= cursorX;
    label.setAttribute("text-anchor", placeOnRight ? "start" : "end");
    label.setAttribute("x", cursorX + (placeOnRight ? gap : -gap));
    label.setAttribute("y", cursorY);

    const bounds = label.getBBox();
    const shiftX = bounds.x - labelPaddingX < padding
      ? padding - (bounds.x - labelPaddingX)
      : Math.min(0, viewBox.width - padding - (bounds.x + bounds.width + labelPaddingX));
    const shiftY = bounds.y - labelPaddingY < padding
      ? padding - (bounds.y - labelPaddingY)
      : Math.min(0, viewBox.height - padding - (bounds.y + bounds.height + labelPaddingY));
    label.setAttribute("x", Number(label.getAttribute("x")) + shiftX);
    label.setAttribute("y", Number(label.getAttribute("y")) + shiftY);

    const adjustedBounds = label.getBBox();
    const background = preview.popup.querySelector("[data-drag-label-background]");
    background.setAttribute("rx", 6 / screenScale);
    background.setAttribute("ry", 6 / screenScale);
    background.setAttribute("x", adjustedBounds.x - labelPaddingX);
    background.setAttribute("y", adjustedBounds.y - labelPaddingY);
    background.setAttribute("width", adjustedBounds.width + labelPaddingX * 2);
    background.setAttribute("height", adjustedBounds.height + labelPaddingY * 2);
  }

  updateRobotTransform(poseLike) {
    if (!this.robotEl) return;
    this.currentPose = { ...(poseLike || {}) };
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
