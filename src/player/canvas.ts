import { zoomCamera, gridValues, validViewport } from "./viewport.ts";
import { sampleFunctionPlot } from "./function-plot.ts";
import { transformedGridBounds, type GridBounds } from "./grid-bounds.ts";
import type { SpaceDefinition, SpaceFrame, Vec3 } from "../document/types.ts";
import { transformSpacePoint } from "../document/space-transform.ts";
import {
  axesEnabled,
  distanceToSegment,
  initialCamera,
  shownPoints,
  strokePaths,
  arrowTips,
  type RenderAdapter,
} from "./adapter.ts";

function gridStep(pixelsPerUnit: number): number {
  // Advance before cells become cramped, using familiar 1–2–5 intervals.
  const minimumStep = 40 / pixelsPerUnit;
  const magnitude = 10 ** Math.floor(Math.log10(minimumStep));
  const normalized = minimumStep / magnitude;
  const multiplier =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

export function createCanvasAdapter(
  space: SpaceDefinition,
  changed: () => void,
): RenderAdapter {
  const element = document.createElement("canvas"),
    ctx = element.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D rendering is unavailable");
  element.style.touchAction = "none";
  let width = 1,
    height = 1,
    enabled = true,
    pan: { x: number; y: number; id: number } | null = null;
  let boundsKey = "",
    cachedBounds: GridBounds;
  const plotCache = new Map<string, { key: string; points: Vec3[] }>();
  const camera = initialCamera(space),
    nonInteractive = new Set<string>(),
    hits: {
      id: string;
      points: Vec3[];
      filled: boolean;
      radius: number;
      fillOnly?: boolean;
      contours?: Vec3[][];
    }[] = [];
  const project = (p: Vec3): Vec3 => [
    width / 2 + (p[0] - camera.center[0]) * camera.scale,
    height / 2 - (p[1] - camera.center[1]) * camera.scale,
    p[2],
  ];
  const line = (points: Vec3[], color: string, width = 1) => {
    ctx.beginPath();
    let active = false;
    for (const p of points) {
      const q = project(p);
      if (!q.every(Number.isFinite)) {
        active = false;
        continue;
      }
      if (!active) {
        ctx.moveTo(q[0], q[1]);
        active = true;
      } else ctx.lineTo(q[0], q[1]);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  };
  const move = (event: PointerEvent) => {
    if (!pan || !enabled) return;
    const center = [...camera.center] as Vec3;
    center[0] -= (event.clientX - pan.x) / camera.scale;
    center[1] += (event.clientY - pan.y) / camera.scale;
    if (validViewport(center, camera.scale, width, height))
      camera.center = center;
    pan.x = event.clientX;
    pan.y = event.clientY;
    changed();
  };
  const down = (e: PointerEvent) => {
    if (!enabled || e.button !== 0) return;
    stopZoom();
    pan = { x: e.clientX, y: e.clientY, id: e.pointerId };
    element.setPointerCapture(e.pointerId);
  };
  const up = () => {
    pan = null;
  };
  let zoomRequest = 0,
    remainingZoom = 0,
    zoomX = 0,
    zoomY = 0,
    lastZoom = 0,
    expensiveUntil = 0;
  const stopZoom = () => {
    if (zoomRequest) cancelAnimationFrame(zoomRequest);
    zoomRequest = 0;
    remainingZoom = 0;
  };
  const zoomFrame = (stamp: number) => {
    zoomRequest = 0;
    const fraction = 1 - Math.exp(-Math.min(64, stamp - lastZoom) / 45);
    lastZoom = stamp;
    const delta =
      stamp < expensiveUntil || Math.abs(remainingZoom) < 0.0001
        ? remainingZoom
        : remainingZoom * fraction;
    remainingZoom -= delta;
    const old = camera.scale;
    const accepted = zoomCamera(camera, delta, zoomX, zoomY, width, height);
    if (camera.scale !== old) {
      const started = performance.now();
      changed();
      // Expensive scenes get batched direct zoom instead of extra easing frames.
      if (performance.now() - started > 8) expensiveUntil = stamp + 1000;
    }
    if (!accepted) remainingZoom = 0;
    if (remainingZoom) zoomRequest = requestAnimationFrame(zoomFrame);
  };
  const wheel = (e: WheelEvent) => {
    if (!enabled) return;
    e.preventDefault();
    const r = element.getBoundingClientRect();
    zoomX = e.clientX - r.left - width / 2;
    zoomY = e.clientY - r.top - height / 2;
    const pixels =
      e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1);
    if (!Number.isFinite(pixels)) return;
    remainingZoom = Math.max(
      -700,
      Math.min(700, remainingZoom - pixels * 0.001),
    );
    if (!zoomRequest && remainingZoom) {
      lastZoom = performance.now();
      zoomRequest = requestAnimationFrame(zoomFrame);
    }
  };
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
  element.addEventListener("wheel", wheel, { passive: false });
  return {
    setCamera(value) {
      Object.assign(camera, structuredClone(value));
    },
    element,
    camera,
    project,
    resize(w, h) {
      stopZoom();
      width = w;
      height = h;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.round(w * dpr);
      element.height = Math.round(h * dpr);
      element.style.width = w + "px";
      element.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    draw(frame, hover) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = frame.theme.background;
      ctx.fillRect(0, 0, width, height);
      hits.length = 0;
      nonInteractive.clear();
      for (const o of frame.objects)
        if (o.interactive === false) nonInteractive.add(o.id);
      const spanX = width / camera.scale / 2,
        spanY = height / camera.scale / 2;
      const view = {
        minX: camera.center[0] - spanX,
        maxX: camera.center[0] + spanX,
        minY: camera.center[1] - spanY,
        maxY: camera.center[1] + spanY,
      };
      const key = JSON.stringify([view, frame.transforms]);
      if (key !== boundsKey) {
        cachedBounds = transformedGridBounds(view, frame.transforms);
        boundsKey = key;
      }
      const { minX, maxX, minY, maxY } = cachedBounds;
      const minimumStep = Math.max(maxX - minX, maxY - minY) / 140;
      const step = Math.max(gridStep(camera.scale), gridStep(40 / minimumStep));
      const mapped = (fn: (t: number) => Vec3) =>
        Array.from({ length: 81 }, (_, i) =>
          transformSpacePoint(fn(i / 80), frame.transforms),
        );
      ctx.globalAlpha = 1;
      if (space.grid !== false && space.type !== "axis1d") {
        if (space.type === "polar2d") {
          const radius = Math.hypot(
            Math.max(Math.abs(minX), Math.abs(maxX)),
            Math.max(Math.abs(minY), Math.abs(maxY)),
          );
          for (let r = step; r <= radius && r / step < 150; r += step)
            line(
              mapped((t) => [
                r * Math.cos(t * Math.PI * 2),
                r * Math.sin(t * Math.PI * 2),
                0,
              ]),
              frame.theme.grid,
            );
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 6)
            line(
              mapped((t) => [
                radius * t * Math.cos(a),
                radius * t * Math.sin(a),
                0,
              ]),
              frame.theme.grid,
            );
        } else {
          for (const x of gridValues(minX, maxX, step))
            line(
              mapped((t) => [x, minY + (maxY - minY) * t, 0]),
              frame.theme.grid,
            );
          for (const y of gridValues(minY, maxY, step))
            line(
              mapped((t) => [minX + (maxX - minX) * t, y, 0]),
              frame.theme.grid,
            );
        }
      }
      ctx.globalAlpha = 1;
      if (axesEnabled(space, "x"))
        line(
          mapped((t) => [minX + (maxX - minX) * t, 0, 0]),
          frame.theme.axes,
          1.3,
        );
      ctx.globalAlpha = 1;
      if (axesEnabled(space, "y") && space.type !== "axis1d")
        line(
          mapped((t) => [0, minY + (maxY - minY) * t, 0]),
          frame.theme.axes,
          1.3,
        );
      const tickLabels: { x: number; y: number; width: number }[] = [];
      const tickLabel = (value: number, x: number, y: number) => {
        if (x < 0 || x > width || y < 0 || y > height) return;
        const text = Number(value.toPrecision(5)).toString();
        const textWidth = text.length * 7;
        if (
          tickLabels.some(
            (label) =>
              Math.abs(label.y - y) < 14 &&
              x < label.x + label.width + 6 &&
              x + textWidth + 6 > label.x,
          )
        )
          return;
        tickLabels.push({ x, y, width: textWidth });
        ctx.fillText(text, x, y);
      };
      if (space.ticks !== false) {
        ctx.font = "11px sans-serif";
        ctx.fillStyle = frame.theme.foreground;
        ctx.globalAlpha = 1;
        if (axesEnabled(space, "x"))
          for (const x of gridValues(minX, maxX, step)) {
            const p = project(transformSpacePoint([x, 0, 0], frame.transforms));
            ctx.fillRect(p[0], p[1] - 3, 1, 6);
            tickLabel(x, p[0] + 3, p[1] + 15);
          }
        ctx.globalAlpha = 1;
        if (axesEnabled(space, "y") && space.type !== "axis1d")
          for (const y of gridValues(minY, maxY, step)) {
            const p = project(transformSpacePoint([0, y, 0], frame.transforms));
            ctx.fillRect(p[0] - 3, p[1], 6, 1);
            if (Math.abs(y) > step / 2) tickLabel(y, p[0] + 5, p[1] - 4);
          }
      }
      // Draw handles last; reverse-order picking gives them priority too.
      const ordered = [
        ...frame.objects.filter((o) => !o.draggable),
        ...frame.objects.filter((o) => o.draggable),
      ];
      for (const id of plotCache.keys())
        if (!ordered.some((o) => o.id === id)) plotCache.delete(id);
      for (const original of ordered) {
        let object = original;
        if (
          object.geometry.functionPlot &&
          object.reveal >= 1 &&
          object.visible &&
          !object.strokeRange
        ) {
          const key = JSON.stringify([
            object.geometry.functionPlot,
            object.matrix,
            frame.transforms,
            view,
            width,
            height,
          ]);
          let cached = plotCache.get(object.id);
          if (cached?.key !== key) {
            cached = {
              key,
              points: sampleFunctionPlot(
                object,
                frame.transforms,
                cachedBounds,
                project,
                width,
              ),
            };
            plotCache.set(object.id, cached);
          }
          object = {
            ...object,
            geometry: { ...object.geometry, points: cached.points },
          };
        }
        if (
          !object.visible ||
          object.opacity <= 0 ||
          object.geometry.kind === "group"
        )
          continue;
        ctx.globalAlpha = object.opacity;
        ctx.strokeStyle = object.color;
        ctx.fillStyle = object.color;
        ctx.lineWidth =
          (object.style.strokeWidth ?? 2) + (hover === object.id ? 1.5 : 0);
        const points = shownPoints(object).map(project);
        if (!points.length) continue;
        const radius = object.draggable
          ? Math.max(6, object.style.pointSize ?? 6)
          : (object.style.pointSize ?? 5) *
            Math.hypot(object.matrix[0], object.matrix[4], object.matrix[8]);
        if (object.geometry.kind === "point") {
          if (object.draggable) {
            ctx.globalAlpha =
              object.opacity * (hover === object.id ? 0.32 : 0.2);
            ctx.beginPath();
            ctx.arc(points[0][0], points[0][1], radius + 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = object.opacity;
          }
          ctx.beginPath();
          ctx.arc(points[0][0], points[0][1], radius, 0, Math.PI * 2);
          ctx.fill();
        } else if (object.geometry.kind === "image") {
          hits.push({
            id: object.id,
            points: [...points, points[0]],
            filled: true,
            radius: 0,
          });
          continue;
        } else if (object.geometry.kind === "text") {
          hits.push({
            id: object.id,
            points,
            filled: false,
            radius: Math.max(12, (object.geometry.text?.length ?? 1) * 6),
          });
          continue;
        } else {
          // Fill the complete shape with reveal-weighted opacity; drawing the
          // partial outline as a fill would create a moving diagonal edge.
          if (
            object.geometry.closed &&
            (object.fillReveal ?? object.reveal) > 0
          ) {
            ctx.beginPath();
            object.geometry.points.forEach((p, i) => {
              const q = project(p);
              if (i && !object.geometry.breaks?.includes(i))
                ctx.lineTo(q[0], q[1]);
              else {
                if (i) ctx.closePath();
                ctx.moveTo(q[0], q[1]);
              }
            });
            ctx.closePath();
            ctx.globalAlpha =
              object.opacity *
              (object.style.fillOpacity ?? 0.15) *
              (object.fillReveal ?? object.reveal);
            ctx.fill("evenodd");
            if (
              object.geometry.breaks &&
              (object.style.fillOpacity ?? 0.15) > 0
            )
              hits.push({
                id: object.id,
                points: object.geometry.points.map(project),
                filled: true,
                radius: 0,
                fillOnly: true,
                contours: object.geometry.breaks.map((start, i, starts) =>
                  object.geometry.points
                    .slice(
                      start,
                      starts[i + 1] ?? object.geometry.points.length,
                    )
                    .map(project),
                ),
              });
            ctx.globalAlpha = object.opacity;
          }
          ctx.beginPath();
          for (const path of strokePaths(object)) {
            let active = false;
            for (const world of path) {
              const p = project(world);
              if (!p.every(Number.isFinite)) {
                active = false;
                continue;
              }
              if (active) ctx.lineTo(p[0], p[1]);
              else ctx.moveTo(p[0], p[1]);
              active = true;
            }
            if (object.geometry.dash || object.geometry.breaks)
              hits.push({
                id: object.id,
                points: path.map(project),
                filled: false,
                radius: 0,
              });
          }
          if (
            object.geometry.closed &&
            object.reveal >= 1 &&
            !object.strokeRange
          )
            ctx.closePath();
          ctx.stroke();
          for (const [tip, adjacent] of arrowTips(object)) {
            const p = project(tip),
              q = project(adjacent),
              a = Math.atan2(p[1] - q[1], p[0] - q[0]),
              tipLength = 10 * (object.arrowScale ?? 1);
            ctx.beginPath();
            ctx.moveTo(p[0], p[1]);
            ctx.lineTo(
              p[0] - tipLength * Math.cos(a - 0.4),
              p[1] - tipLength * Math.sin(a - 0.4),
            );
            ctx.lineTo(
              p[0] - tipLength * Math.cos(a + 0.4),
              p[1] - tipLength * Math.sin(a + 0.4),
            );
            ctx.closePath();
            ctx.fill();
          }
        }
        if (!object.geometry.dash && !object.geometry.breaks)
          hits.push({
            id: object.id,
            points:
              object.geometry.closed &&
              (object.fillReveal ?? object.reveal) > 0 &&
              (object.style.fillOpacity ?? 0.15) > 0
                ? object.geometry.points.map(project)
                : points,
            filled:
              !!object.geometry.closed &&
              (object.fillReveal ?? object.reveal) > 0 &&
              (object.style.fillOpacity ?? 0.15) > 0,
            radius: object.draggable ? radius + 7 : radius,
          });
      }
      ctx.globalAlpha = 1;
    },
    pick(x, y) {
      for (const hit of [...hits].reverse()) {
        if (nonInteractive.has(hit.id)) continue;
        if (
          hit.points.length === 1 &&
          Math.hypot(x - hit.points[0][0], y - hit.points[0][1]) <
            hit.radius + 5
        )
          return hit.id;
        for (let i = 1; !hit.fillOnly && i < hit.points.length; i++)
          if (distanceToSegment(x, y, hit.points[i - 1], hit.points[i]) < 7)
            return hit.id;
        if (hit.filled) {
          let inside = false;
          for (const contour of hit.contours ?? [hit.points])
            for (
              let i = 0, j = contour.length - 1;
              i < contour.length;
              j = i++
            ) {
              const a = contour[i],
                b = contour[j];
              if (
                a[1] > y !== b[1] > y &&
                x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
              )
                inside = !inside;
            }
          if (inside) return hit.id;
        }
      }
      return null;
    },
    navigate(value) {
      enabled = value;
      if (!value) {
        pan = null;
        stopZoom();
      }
    },
    reset() {
      stopZoom();
      Object.assign(camera, initialCamera(space));
      changed();
    },
    dispose() {
      stopZoom();
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", up);
      element.removeEventListener("wheel", wheel);
      element.width = element.height = 1;
      element.remove();
    },
  };
}
