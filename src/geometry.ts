import { transform as applyMatrix, inverse as invertMatrix } from "./vector.ts";
import {
  screenToWorld,
  worldToScreen,
  type Camera,
  type Vec,
  type Viewport,
} from "./camera.ts";
export type Segment = [Vec, Vec];
// Adaptive subdivision in screen space: detail follows zoom, not a fixed world grid.
export function sampleCurve(
  fn: (x: number) => number,
  camera: Camera,
  view: Viewport,
  domain?: [number, number],
): Segment[] {
  const left = screenToWorld({ x: -8, y: 0 }, camera, view).x,
    right = screenToWorld({ x: view.width + 8, y: 0 }, camera, view).x;
  const min = Math.max(left, domain?.[0] ?? -Infinity),
    max = Math.min(right, domain?.[1] ?? Infinity);
  if (min >= max) return [];
  const segments: Segment[] = [];
  let budget = 18000;
  const point = (x: number) => worldToScreen({ x, y: fn(x) }, camera, view);
  const finite = (p: Vec) =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.y) < 1e14;
  const visit = (x0: number, x1: number, p: Vec, q: Vec, depth: number) => {
    if (--budget <= 0) return;
    const xm = (x0 + x1) / 2,
      m = point(xm);
    if (!finite(p) || !finite(q) || !finite(m)) {
      if (depth < 10) {
        visit(x0, xm, p, m, depth + 1);
        visit(xm, x1, m, q, depth + 1);
      }
      return;
    }
    const error = Math.abs(m.y - (p.y + q.y) / 2);
    if (error > 0.45) {
      if (depth < 10) {
        visit(x0, xm, p, m, depth + 1);
        visit(xm, x1, m, q, depth + 1);
      }
      return;
    }
    // Reject entirely offscreen segments before rendering/hit testing.
    if (
      (p.y < -15 && q.y < -15) ||
      (p.y > view.height + 15 && q.y > view.height + 15)
    )
      return;
    segments.push([p, q]);
  };
  const n = Math.max(1, Math.ceil(((max - min) * camera.scale) / 8));
  for (let i = 0; i < n && budget > 0; i++) {
    const x0 = min + ((max - min) * i) / n,
      x1 = min + ((max - min) * (i + 1)) / n;
    visit(x0, x1, point(x0), point(x1), 0);
  }
  return segments;
}
export function distanceToSegment(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const denom = dx * dx + dy * dy;
  const t = denom
    ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / denom))
    : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// Affine-transformed function plots retain adaptive sampling in the current viewport.
export function sampleTransformedCurve(
  fn: (x: number) => number,
  m: import("./vector.ts").Matrix,
  c: Camera,
  v: Viewport,
  domain?: [number, number],
): Segment[] {
  let inv: import("./vector.ts").Matrix;
  try {
    inv = invertMatrix(m);
  } catch {
    return [];
  }
  const corners = [
    { x: 0, y: 0 },
    { x: v.width, y: 0 },
    { x: 0, y: v.height },
    { x: v.width, y: v.height },
  ].map((p) => applyMatrix(screenToWorld(p, c, v), inv));
  const lo = Math.max(
      domain?.[0] ?? -Infinity,
      Math.min(...corners.map((p) => p.x)),
    ),
    hi = Math.min(
      domain?.[1] ?? Infinity,
      Math.max(...corners.map((p) => p.x)),
    );
  if (!(lo < hi)) return [];
  const output: Segment[] = [];
  let budget = 18000;
  const project = (x: number) =>
    worldToScreen(applyMatrix({ x, y: fn(x) }, m), c, v);
  const subdivide = (a: number, b: number, p: Vec, q: Vec, depth: number) => {
    if (--budget < 0) return;
    const mid = (a + b) / 2,
      r = project(mid);
    const finite = [p.x, p.y, q.x, q.y, r.x, r.y].every(Number.isFinite);
    const error = Math.hypot(r.x - (p.x + q.x) / 2, r.y - (p.y + q.y) / 2);
    if (!finite || error > 0.45) {
      if (depth < 10) {
        subdivide(a, mid, p, r, depth + 1);
        subdivide(mid, b, r, q, depth + 1);
      }
      return;
    }
    if (
      (p.x < 0 && q.x < 0) ||
      (p.x > v.width && q.x > v.width) ||
      (p.y < 0 && q.y < 0) ||
      (p.y > v.height && q.y > v.height)
    )
      return;
    output.push([p, q]);
  };
  const count = Math.max(1, Math.ceil(Math.max(v.width, v.height) / 8));
  for (let i = 0; i < count && budget > 0; i++) {
    const a = lo + ((hi - lo) * i) / count,
      b = lo + ((hi - lo) * (i + 1)) / count;
    subdivide(a, b, project(a), project(b), 0);
  }
  return output;
}
