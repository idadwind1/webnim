import type { Vec } from "./camera.ts";
export type Matrix = [number, number, number, number, number, number];
export const identity: Matrix = [1, 0, 0, 1, 0, 0];
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
export function transform(p: Vec, m: Matrix): Vec {
  return {
    x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5],
  };
}
export function inverse(m: Matrix): Matrix {
  const d = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(d) < 1e-14) throw new Error("Transform is singular.");
  return [
    m[3] / d,
    -m[1] / d,
    -m[2] / d,
    m[0] / d,
    (m[2] * m[5] - m[3] * m[4]) / d,
    (m[1] * m[4] - m[0] * m[5]) / d,
  ];
}
export function matrixOf(v: Record<string, number>): Matrix {
  const angle = v.rotation ?? 0,
    c = Math.cos(angle),
    s = Math.sin(angle),
    sx = v.scaleX ?? 1,
    sy = v.scaleY ?? 1;
  return multiply(
    [c * sx, s * sx, -s * sy, c * sy, v.tx ?? 0, v.ty ?? 0],
    [v.m00 ?? 1, v.m10 ?? 0, v.m01 ?? 0, v.m11 ?? 1, 0, 0],
  );
}
export type PathCommand =
  | { op: "M" | "L"; x: number; y: number }
  | {
      op: "C";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { op: "Z" };
export interface VectorPath {
  commands: PathCommand[];
  closed: boolean;
}
export function polygon(points: Vec[], closed = true): VectorPath {
  return {
    closed,
    commands: [
      ...points.map((p, i) => ({ op: i ? "L" : "M", ...p }) as PathCommand),
      ...(closed ? [{ op: "Z" } as PathCommand] : []),
    ],
  };
}
export function ellipse(rx: number, ry: number): VectorPath {
  const k = 0.5522847498307936;
  return {
    closed: true,
    commands: [
      { op: "M", x: rx, y: 0 },
      { op: "C", x1: rx, y1: k * ry, x2: k * rx, y2: ry, x: 0, y: ry },
      { op: "C", x1: -k * rx, y1: ry, x2: -rx, y2: k * ry, x: -rx, y: 0 },
      { op: "C", x1: -rx, y1: -k * ry, x2: -k * rx, y2: -ry, x: 0, y: -ry },
      { op: "C", x1: k * rx, y1: -ry, x2: rx, y2: -k * ry, x: rx, y: 0 },
      { op: "Z" },
    ],
  };
}
export function arc(
  radius: number,
  start: number,
  end: number,
  sector = false,
): VectorPath {
  const pieces = Math.max(1, Math.ceil(Math.abs(end - start) / (Math.PI / 2)));
  const commands: PathCommand[] = [
    { op: "M", x: radius * Math.cos(start), y: radius * Math.sin(start) },
  ];
  for (let i = 0; i < pieces; i++) {
    const a = start + ((end - start) * i) / pieces,
      b = start + ((end - start) * (i + 1)) / pieces,
      k = (4 / 3) * Math.tan((b - a) / 4);
    commands.push({
      op: "C",
      x1: radius * (Math.cos(a) - k * Math.sin(a)),
      y1: radius * (Math.sin(a) + k * Math.cos(a)),
      x2: radius * (Math.cos(b) + k * Math.sin(b)),
      y2: radius * (Math.sin(b) - k * Math.cos(b)),
      x: radius * Math.cos(b),
      y: radius * Math.sin(b),
    });
  }
  if (sector) commands.push({ op: "L", x: 0, y: 0 }, { op: "Z" });
  return { commands, closed: sector };
}
export function flattenPath(path: VectorPath, tolerance = 0.005): Vec[] {
  const output: Vec[] = [];
  let cursor = { x: 0, y: 0 },
    start = cursor;
  let budget = 10000;
  const cubic = (a: Vec, b: Vec, c: Vec, d: Vec, depth: number) => {
    if (--budget < 0) return;
    const error = Math.max(
      Math.hypot(b.x - (2 * a.x + d.x) / 3, b.y - (2 * a.y + d.y) / 3),
      Math.hypot(c.x - (a.x + 2 * d.x) / 3, c.y - (a.y + 2 * d.y) / 3),
    );
    if (error <= tolerance || depth >= 12) {
      output.push(d);
      return;
    }
    const mid = (p: Vec, q: Vec) => ({
        x: (p.x + q.x) / 2,
        y: (p.y + q.y) / 2,
      }),
      ab = mid(a, b),
      bc = mid(b, c),
      cd = mid(c, d),
      abc = mid(ab, bc),
      bcd = mid(bc, cd),
      m = mid(abc, bcd);
    cubic(a, ab, abc, m, depth + 1);
    cubic(m, bcd, cd, d, depth + 1);
  };
  for (const cmd of path.commands) {
    if (cmd.op === "M") {
      cursor = { x: cmd.x, y: cmd.y };
      start = cursor;
      output.push(cursor);
    } else if (cmd.op === "L") {
      cursor = { x: cmd.x, y: cmd.y };
      output.push(cursor);
    } else if (cmd.op === "C") {
      const end = { x: cmd.x, y: cmd.y };
      cubic(cursor, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x2, y: cmd.y2 }, end, 0);
      cursor = end;
    } else {
      output.push(start);
      cursor = start;
    }
  }
  return output;
}
export function partialPolyline(points: Vec[], progress: number): Vec[] {
  if (!points.length) return [];
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let remaining =
    lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, progress));
  const result = [points[0]];
  for (let i = 0; i < lengths.length; i++) {
    if (remaining >= lengths[i]) {
      result.push(points[i + 1]);
      remaining -= lengths[i];
    } else {
      const t = lengths[i] ? remaining / lengths[i] : 0;
      result.push({
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      });
      break;
    }
  }
  return result;
}
export function resamplePath(path: VectorPath, count = 128): Vec[] {
  const points = flattenPath(path, 0.001);
  const lengths = points
    .slice(1)
    .map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!points.length) return [];
  return Array.from({ length: count }, (_, index) => {
    let distance = (total * index) / (count - 1),
      j = 0;
    while (j < lengths.length - 1 && distance > lengths[j])
      distance -= lengths[j++];
    const t = lengths[j] ? distance / lengths[j] : 0,
      p = points[j],
      q = points[j + 1] ?? p;
    return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
  });
}
export function morphPath(
  from: Vec[],
  to: Vec[],
  alpha: number,
  closed: boolean,
): VectorPath {
  return polygon(
    from.map((p, i) => ({
      x: p.x + (to[i].x - p.x) * alpha,
      y: p.y + (to[i].y - p.y) * alpha,
    })),
    closed,
  );
}
export const palette: Record<string, string> = {
  green: "#bed6af",
  purple: "#b6a5e4",
  blue: "#82b8dc",
  red: "#df8f8d",
  orange: "#d7b082",
  yellow: "#e0d390",
  white: "#e8eae4",
  pink: "#dea8ce",
};
export function color(value: string): string {
  const result = palette[value] ?? value;
  if (!/^#[\da-f]{6}$/i.test(result))
    throw new Error("Use a named palette color or #rrggbb.");
  return result;
}
export function transformPath(path: VectorPath, m: Matrix): VectorPath {
  return {
    ...path,
    commands: path.commands.map((c) => {
      if (c.op === "Z") return c;
      const p = transform({ x: c.x, y: c.y }, m);
      if (c.op === "C") {
        const a = transform({ x: c.x1, y: c.y1 }, m),
          b = transform({ x: c.x2, y: c.y2 }, m);
        return { ...c, ...p, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      }
      return { ...c, ...p };
    }),
  };
}
export function pointAlong(points: Vec[], alpha: number): Vec {
  return partialPolyline(points, alpha).at(-1) ?? { x: 0, y: 0 };
}
