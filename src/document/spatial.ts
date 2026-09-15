import type { Matrix4, SpaceType, Vec3 } from "./types.ts";
export const identity4 = (): Matrix4 => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
];
export const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  a.map((v, i) => mix(v, b[i], t)) as Vec3;
export const add3 = (a: Vec3, b: Vec3): Vec3 =>
  a.map((v, i) => v + b[i]) as Vec3;
export const sub3 = (a: Vec3, b: Vec3): Vec3 =>
  a.map((v, i) => v - b[i]) as Vec3;
export const mul3 = (a: Vec3, n: number): Vec3 => a.map((v) => v * n) as Vec3;
export const length3 = (a: Vec3) => Math.hypot(...a);
export const unit3 = (a: Vec3): Vec3 => mul3(a, 1 / (length3(a) || 1));
export const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const dot3 = (a: Vec3, b: Vec3) =>
  a.reduce((s, v, i) => s + v * b[i], 0);
export function nativeToCartesian(p: number[], type: SpaceType): Vec3 {
  return type === "polar2d"
    ? [p[0] * Math.cos(p[1]), p[0] * Math.sin(p[1]), 0]
    : [p[0], p[1] ?? 0, p[2] ?? 0];
}
export function cartesianToNative(p: Vec3, type: SpaceType): number[] {
  return type === "axis1d"
    ? [p[0]]
    : type === "polar2d"
      ? [Math.hypot(p[0], p[1]), Math.atan2(p[1], p[0])]
      : type === "plane2d"
        ? p.slice(0, 2)
        : [...p];
}
export function multiply4(a: Matrix4, b: Matrix4): Matrix4 {
  return Array.from({ length: 16 }, (_, i) =>
    [0, 1, 2, 3].reduce(
      (s, k) => s + a[Math.floor(i / 4) * 4 + k] * b[k * 4 + (i % 4)],
      0,
    ),
  );
}
export function transform3(p: Vec3, m: Matrix4): Vec3 {
  return [0, 1, 2].map(
    (i) =>
      m[i * 4] * p[0] +
      m[i * 4 + 1] * p[1] +
      m[i * 4 + 2] * p[2] +
      m[i * 4 + 3],
  ) as Vec3;
}
export function translation(p: Vec3): Matrix4 {
  const m = identity4();
  m[3] = p[0];
  m[7] = p[1];
  m[11] = p[2];
  return m;
}
export function scaling(s: number): Matrix4 {
  const m = identity4();
  m[0] = m[5] = m[10] = s;
  return m;
}
export function rotation(angle: number, axis: Vec3 = [0, 0, 1]): Matrix4 {
  const [x, y, z] = unit3(axis),
    c = Math.cos(angle),
    s = Math.sin(angle),
    q = 1 - c;
  return [
    c + x * x * q,
    x * y * q - z * s,
    x * z * q + y * s,
    0,
    y * x * q + z * s,
    c + y * y * q,
    y * z * q - x * s,
    0,
    z * x * q - y * s,
    z * y * q + x * s,
    c + z * z * q,
    0,
    0,
    0,
    0,
    1,
  ];
}
export function centerOf(points: Vec3[]): Vec3 {
  if (!points.length) return [0, 0, 0];
  return [0, 1, 2].map(
    (i) =>
      (Math.min(...points.map((p) => p[i])) +
        Math.max(...points.map((p) => p[i]))) /
      2,
  ) as Vec3;
}
export function along(points: Vec3[], alpha: number): Vec3 {
  if (!points.length) return [0, 0, 0];
  const lengths = points.slice(1).map((p, i) => length3(sub3(p, points[i])));
  let d = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, alpha));
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i])
      return lerp3(points[i], points[i + 1], lengths[i] ? d / lengths[i] : 0);
    d -= lengths[i];
  }
  return points.at(-1)!;
}
export function projectPoint(
  point: Vec3,
  camera: {
    position: Vec3;
    center: Vec3;
    projection?: "perspective" | "orthographic";
    scale?: number;
  },
  width: number,
  height: number,
): Vec3 {
  const forward = unit3(sub3(camera.center, camera.position)),
    right = unit3(
      cross3(forward, Math.abs(forward[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1]),
    ),
    up = cross3(right, forward),
    v = sub3(point, camera.position),
    z = dot3(v, forward);
  const scale =
    camera.projection === "orthographic"
      ? (camera.scale ?? 60)
      : height / (2 * Math.tan(Math.PI / 8) * z);
  return [
    width / 2 + dot3(v, right) * scale,
    height / 2 - dot3(v, up) * scale,
    z,
  ];
}
export function inverse4(m: Matrix4): Matrix4 {
  const a = Array.from({ length: 4 }, (_, i) => [
    ...m.slice(i * 4, i * 4 + 4),
    ...identity4().slice(i * 4, i * 4 + 4),
  ]);
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++)
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12)
      throw new Error("Cannot invert a singular object transform");
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const divisor = a[col][col];
    a[col] = a[col].map((v) => v / divisor);
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      a[row] = a[row].map((v, i) => v - factor * a[col][i]);
    }
  }
  return a.flatMap((row) => row.slice(4));
}
