import type {
  ObjectFrame,
  SpaceDefinition,
  SpaceFrame,
  Vec3,
} from "../document/types.ts";
import { along } from "../document/spatial.ts";
export interface ViewCamera {
  center: Vec3;
  position: Vec3;
  scale: number;
  projection: "perspective" | "orthographic";
}
export interface RenderAdapter {
  element: HTMLCanvasElement;
  camera: ViewCamera;
  setCamera(camera: ViewCamera): void;
  cancelZoom(): void;
  zoomBy(logDelta: number): boolean;
  resize(width: number, height: number): void;
  draw(frame: SpaceFrame, hover: string | null): void;
  project(p: Vec3): Vec3;
  pick(x: number, y: number): string | null;
  navigate(enabled: boolean): void;
  reset(): void;
  dispose(): void;
}
export function initialCamera(space: SpaceDefinition): ViewCamera {
  return {
    center: [...(space.camera?.center ?? [0, 0, 0])],
    position: [...(space.camera?.position ?? [7, -9, 7])],
    scale: space.camera?.scale ?? 60,
    projection:
      space.camera?.projection ??
      (space.type === "space3d" ? "perspective" : "orthographic"),
  };
}
export function distanceToSegment(x: number, y: number, a: Vec3, b: Vec3) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}
export function shownPoints(object: ObjectFrame): Vec3[] {
  if (!object.geometry.points.length) return [];
  let points = object.geometry.closed
    ? [...object.geometry.points, object.geometry.points[0]]
    : object.geometry.points;
  if (object.strokeRange) {
    const [start, end] = object.strokeRange;
    if (start >= end || points.length < 2) return [];
    const distances = [0];
    for (let i = 1; i < points.length; i++)
      distances.push(
        distances[i - 1] +
          Math.hypot(...points[i].map((v, k) => v - points[i - 1][k])),
      );
    const length = distances.at(-1)!;
    if (!Number.isFinite(length) || length <= 0) return [];
    points = [
      along(points, start),
      ...points.filter(
        (_, i) => distances[i] > length * start && distances[i] < length * end,
      ),
      along(points, end),
    ];
  }
  if (object.reveal >= 1) return points;
  const n = (points.length - 1) * object.reveal,
    i = Math.floor(n);
  if (!points.length) return [];
  return [
    ...points.slice(0, i + 1),
    points[Math.min(i, points.length - 1)].map(
      (v, k) => v + ((points[i + 1] ?? points[i])[k] - v) * (n - i),
    ) as Vec3,
  ];
}

/** Split dashes by world-space arc length, preserving a bounded amount of work. */
export function strokePaths(object: ObjectFrame): Vec3[][] {
  if (object.geometry.breaks) {
    const ends = [
      ...object.geometry.breaks.slice(1),
      object.geometry.points.length,
    ];
    return object.geometry.breaks.map((start, i) =>
      shownPoints({
        ...object,
        geometry: {
          ...object.geometry,
          breaks: undefined,
          points: object.geometry.points.slice(start, ends[i]),
        },
      }),
    );
  }
  const points = shownPoints(object),
    dash = object.geometry.dash;
  if (!dash || points.length < 2) return [points];
  const total = points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(...p.map((x, k) => x - points[i][k])),
      0,
    );
  if (!Number.isFinite(total) || total <= 0) return [];
  const period = Math.max(dash.length / dash.ratio, total / 2048);
  const paths: Vec3[][] = [];
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(...b.map((x, k) => x - a[k]));
    if (!length) continue;
    const end = travelled + length;
    for (let j = Math.floor(travelled / period); j * period < end; j++) {
      const start = Math.max(travelled, j * period),
        stop = Math.min(end, (j + dash.ratio) * period);
      if (stop > start)
        paths.push(
          [start, stop].map(
            (distance) =>
              a.map(
                (x, k) => x + ((b[k] - x) * (distance - travelled)) / length,
              ) as Vec3,
          ),
        );
    }
    travelled = end;
  }
  return paths;
}

/** [tip, adjacent path point] for each visible arrowhead. */
export function arrowTips(
  object: ObjectFrame,
  points = shownPoints(object),
): [Vec3, Vec3][] {
  if (object.strokeRange) return [];
  if (object.geometry.arrows && object.reveal > 0)
    return strokePaths(object)
      .filter((path) => path.length > 1)
      .map((path) => [path.at(-1)!, path.at(-2)!]);
  if (points.length < 2 || object.reveal <= 0) return [];
  const both =
    object.type === "DoubleArrow" || object.type === "CurvedDoubleArrow";
  if (!both && object.type !== "Arrow" && object.type !== "CurvedArrow")
    return [];
  return [
    [points.at(-1)!, points.at(-2)!],
    ...(both ? [[points[0], points[1]] as [Vec3, Vec3]] : []),
  ];
}
export function axesEnabled(space: SpaceDefinition, axis: "x" | "y" | "z") {
  return (
    space.axes !== false &&
    (!Array.isArray(space.axes) || space.axes.includes(axis))
  );
}
