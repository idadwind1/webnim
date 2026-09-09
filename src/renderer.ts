import {resolveTheme,themeFrame,type ThemeOptions,type EngineTheme} from "./theme.ts";
import { transform, flattenPath, partialPolyline } from "./vector.ts";
import {
  worldToScreen,
  screenToWorld,
  tickSpacing,
  type Camera,
  type Vec,
  type Viewport,
} from "./camera.ts";
import {
  distanceToSegment,
  sampleTransformedCurve,
  type Segment,
} from "./geometry.ts";
import { formatNumber } from "./math.ts";
import type { ResolvedNode, SceneFrame } from "./scene.ts";
export interface HitTarget {
  id: string;
  name: string;
  point?: Vec;
  segments?: Segment[];
  draggable?: boolean;
  areas?: Vec[][];
}
export interface RenderOptions {
  camera: Camera;
  viewport: Viewport;
  frame: SceneFrame;
  highlight: string[];
  grid: boolean;
  theme?: ThemeOptions;
}
export function renderScene(
  ctx: CanvasRenderingContext2D,
  { camera: c, viewport: v, frame, highlight, grid, theme:options }: RenderOptions,
): HitTarget[] {
  const theme=resolveTheme(options);
  frame=themeFrame(frame,theme);
  ctx.clearRect(0, 0, v.width, v.height);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, v.width, v.height);
  if (grid) drawGrid(ctx, c, v,theme);
  const hits: HitTarget[] = [];
  for (const node of frame.nodes) {
    if (node.opacity < 0.015 || node.reveal <= 0) continue;
    ctx.save();
    ctx.globalAlpha = node.opacity;
    ctx.strokeStyle = node.color;
    ctx.fillStyle = node.color;
    const lit =
      highlight.includes(node.id) ||
      node.ancestors.some((id) => highlight.includes(id));
    ctx.lineWidth = node.strokeWidth + (lit ? 1.5 : 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (lit) {
      ctx.shadowColor = node.color;
      ctx.shadowBlur = 11;
    }
    let segments: Segment[] = [];
    if (node.type === "curve") {
      const range: [number, number] | undefined =
        node.reveal < 0.9999
          ? [
              node.domain[0],
              node.domain[0] + (node.domain[1] - node.domain[0]) * node.reveal,
            ]
          : undefined;
      segments = sampleTransformedCurve(node.fn, node.matrix, c, v, range);
      drawSegments(ctx, segments);
    } else if (node.type === "line") {
      const at = worldToScreen(transform(node.at, node.matrix), c, v);
      const dx = node.matrix[0] + node.matrix[2] * node.slope,
        dy = -(node.matrix[1] + node.matrix[3] * node.slope);
      const xdir = dx / Math.hypot(dx, dy),
        ydir = dy / Math.hypot(dx, dy);
      const length =
        (Math.hypot(v.width, v.height) +
          Math.hypot(at.x - v.width / 2, at.y - v.height / 2)) *
        node.reveal;
      if ([at.x, at.y, xdir, ydir].every(Number.isFinite)) {
        segments = [
          [
            { x: at.x - xdir * length, y: at.y - ydir * length },
            { x: at.x + xdir * length, y: at.y + ydir * length },
          ],
        ];
        if (node.dashed) ctx.setLineDash([5, 6]);
        drawSegments(ctx, segments);
      }
    } else if (node.type === "polyline") {
      const points = partialPolyline(node.points, node.reveal).map((p) =>
        worldToScreen(transform(p, node.matrix), c, v),
      );
      segments = points.slice(1).map((p, i) => [points[i], p]);
      ctx.lineWidth = 1;
      if (node.dashed) ctx.setLineDash([4, 5]);
      drawSegments(ctx, segments);
      if (
        node.id === "rise-run" &&
        points.length === 3 &&
        Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) > 38
      ) {
        ctx.setLineDash([]);
        ctx.font = "italic 12px Georgia";
        ctx.fillText("Δx", (points[0].x + points[1].x) / 2, points[0].y + 21);
        ctx.fillText("Δy", points[1].x + 12, (points[1].y + points[2].y) / 2);
      }
    } else if (node.type === "path") {
      const magnitude = Math.max(
        Math.hypot(node.matrix[0], node.matrix[1]),
        Math.hypot(node.matrix[2], node.matrix[3]),
        0.00001,
      );
      const points = partialPolyline(
        flattenPath(node.path, Math.max(1e-8, 0.35 / (c.scale * magnitude))),
        node.reveal,
      ).map((p) => worldToScreen(transform(p, node.matrix), c, v));
      if (points.length) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (const p of points.slice(1)) ctx.lineTo(p.x, p.y);
        if (node.path.closed && node.reveal >= 0.999) {
          ctx.closePath();
          if (node.fillOpacity > 0) {
            ctx.globalAlpha = node.opacity * node.fillOpacity;
            ctx.fill();
            ctx.globalAlpha = node.opacity;
            hits.push({ id: node.id, name: node.name, areas: [points] });
          }
        }
        ctx.stroke();
        segments = points.slice(1).map((p, i) => [points[i], p]);
        if (node.arrow && points.length > 1) {
          const tip = points[points.length - 1],
            before = points[points.length - 2],
            angle = Math.atan2(tip.y - before.y, tip.x - before.x),
            size = 11;
          ctx.beginPath();
          ctx.moveTo(tip.x, tip.y);
          ctx.lineTo(
            tip.x - size * Math.cos(angle - 0.4),
            tip.y - size * Math.sin(angle - 0.4),
          );
          ctx.lineTo(
            tip.x - size * Math.cos(angle + 0.4),
            tip.y - size * Math.sin(angle + 0.4),
          );
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (node.type === "text") {
      const p = worldToScreen(transform(node.at, node.matrix), c, v);
      const scale = Math.max(
        0.00001,
        Math.hypot(node.matrix[0], node.matrix[1]),
      );
      const angle = -Math.atan2(node.matrix[1], node.matrix[0]);
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.font = `${node.fontSize * scale}px Georgia`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = Array.from(node.text)
        .slice(0, Math.ceil(Array.from(node.text).length * node.reveal))
        .join("");
      const lines = text.split("\n");
      const width = Math.max(
          ...lines.map((line) => ctx.measureText(line).width),
        ),
        height = node.fontSize * scale * 1.3 * lines.length;
      if (!node.math)
        lines.forEach((line, i) =>
          ctx.fillText(
            line,
            0,
            (i - (lines.length - 1) / 2) * node.fontSize * scale * 1.3,
          ),
        );
      const box = [
        { x: -width / 2, y: -height / 2 },
        { x: width / 2, y: -height / 2 },
        { x: width / 2, y: height / 2 },
        { x: -width / 2, y: height / 2 },
      ].map((q) => ({
        x: p.x + q.x * Math.cos(angle) - q.y * Math.sin(angle),
        y: p.y + q.x * Math.sin(angle) + q.y * Math.cos(angle),
      }));
      hits.push({ id: node.id, name: node.name, areas: [box] });
    } else if (node.type === "point") {
      const p = worldToScreen(transform(node.at, node.matrix), c, v);
      if (p.x < -30 || p.x > v.width + 30 || p.y < -30 || p.y > v.height + 30) {
        ctx.restore();
        continue;
      }
      ctx.globalAlpha = node.opacity * (lit ? 0.18 : 0.09);
      ctx.beginPath();
      ctx.arc(p.x, p.y, lit ? 20 : 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = node.opacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lit ? 6.5 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = theme.background;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.font = "italic 17px Georgia";
      ctx.fillText(node.label, p.x + (node.id === "P" ? -23 : 12), p.y - 14);
      hits.push({
        id: node.id,
        name: node.name,
        point: p,
        draggable: node.draggable,
      });
    }
    if (segments.length) hits.push({ id: node.id, name: node.name, segments });
    ctx.restore();
  }
  return hits;
}
function drawSegments(ctx: CanvasRenderingContext2D, segments: Segment[]) {
  ctx.beginPath();
  for (const [a, b] of segments) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}
function drawGrid(ctx: CanvasRenderingContext2D, c: Camera, v: Viewport, theme:EngineTheme) {
  const step = tickSpacing(c.scale);
  const min = screenToWorld({ x: 0, y: v.height }, c, v),
    max = screenToWorld({ x: v.width, y: 0 }, c, v);
  const origin = worldToScreen({ x: 0, y: 0 }, c, v);
  ctx.save();
  for (const minor of [true, false]) {
    const spacing = minor ? step / 5 : step;
    ctx.lineWidth = 1;
    ctx.strokeStyle = minor ? theme.gridMinor : theme.gridMajor;
    ctx.beginPath();
    for (
      let i = Math.ceil(min.x / spacing), end = Math.floor(max.x / spacing);
      i <= end && i - Math.ceil(min.x / spacing) < 200;
      i++
    ) {
      const x = worldToScreen({ x: i * spacing, y: 0 }, c, v).x;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, v.height);
    }
    for (
      let i = Math.ceil(min.y / spacing), end = Math.floor(max.y / spacing);
      i <= end && i - Math.ceil(min.y / spacing) < 200;
      i++
    ) {
      const y = worldToScreen({ x: 0, y: i * spacing }, c, v).y;
      ctx.moveTo(0, y);
      ctx.lineTo(v.width, y);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = theme.axes;
  ctx.globalAlpha = 0.65;
  ctx.beginPath();
  ctx.moveTo(origin.x, 0);
  ctx.lineTo(origin.x, v.height);
  ctx.moveTo(0, origin.y);
  ctx.lineTo(v.width, origin.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = "10px ui-monospace, SFMono-Regular, monospace";
  ctx.fillStyle = theme.tickLabels;
  ctx.textAlign = "center";
  const labelY = Math.min(v.height - 12, Math.max(18, origin.y + 19));
  for (let i = Math.ceil(min.x / step); i <= Math.floor(max.x / step); i++) {
    if (i === 0) continue;
    const x = worldToScreen({ x: i * step, y: 0 }, c, v).x;
    if (x > 25 && x < v.width - 30)
      ctx.fillText(formatNumber(i * step, 8), x, labelY);
  }
  ctx.textAlign = "right";
  const labelX = Math.min(v.width - 14, Math.max(46, origin.x - 12));
  for (let i = Math.ceil(min.y / step); i <= Math.floor(max.y / step); i++) {
    if (i === 0) continue;
    const y = worldToScreen({ x: 0, y: i * step }, c, v).y;
    if (y > 22 && y < v.height - 25)
      ctx.fillText(formatNumber(i * step, 8), labelX, y + 3);
  }
  if (origin.x > 0 && origin.x < v.width && origin.y > 0 && origin.y < v.height)
    ctx.fillText("0", origin.x - 11, origin.y + 19);
  ctx.font = "italic 15px Georgia";
  ctx.fillStyle = theme.axisLabels;
  ctx.fillText(
    "x",
    v.width - 15,
    Math.min(v.height - 15, Math.max(25, origin.y - 12)),
  );
  ctx.fillText("y", Math.min(v.width - 15, Math.max(22, origin.x + 21)), 22);
  ctx.restore();
}
export function hitTest(targets: HitTarget[], p: Vec): HitTarget | undefined {
  const point = targets.findLast(
    (t) => t.point && Math.hypot(t.point.x - p.x, t.point.y - p.y) < 17,
  );
  if (point) return point;
  let best: HitTarget | undefined;
  let distance = 8;
  for (const target of targets)
    for (const [a, b] of target.segments ?? []) {
      const d = distanceToSegment(p, a, b);
      if (d < distance) {
        distance = d;
        best = target;
      }
    }
  if (best) return best;
  return targets.findLast((t) =>
    t.areas?.some((points) => {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i],
          b = points[j];
        if (
          a.y > p.y !== b.y > p.y &&
          p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
        )
          inside = !inside;
      }
      return inside;
    }),
  );
}
export function nodeDescription(node: ResolvedNode): string {
  if (node.type === "point")
    return `${node.name} · (${formatNumber(node.at.x)}, ${formatNumber(node.at.y)})`;
  if (node.type === "line")
    return `${node.name} · slope ${formatNumber(node.slope, 4)}`;
  return node.name;
}
