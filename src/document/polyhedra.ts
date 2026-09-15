import type { Geometry, Vec3 } from "./types.ts";
import { sub3, unit3 } from "./spatial.ts";
const dot = (a: Vec3, b: Vec3) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
/** Monotone-chain hull; duplicates and collinear interior vertices are discarded. */
export function hull2D(points: Vec3[]): Vec3[] {
  const sorted = [
    ...new Map(points.map((p) => [`${p[0]},${p[1]}`, p])).values(),
  ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (a: Vec3, b: Vec3, c: Vec3) =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (ps: Vec3[]) => {
    const out: Vec3[] = [];
    for (const p of ps) {
      while (out.length > 1 && turn(out.at(-2)!, out.at(-1)!, p) <= 0)
        out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return sorted.length < 3
    ? sorted
    : [...half(sorted), ...half([...sorted].reverse())];
}
const invalid = (): Geometry => ({
  kind: "mesh",
  points: [[NaN, NaN, NaN]],
  indices: [],
});
/** Triangulate planar convex faces and orient each face away from the vertex centroid. */
export function polyhedron(points: Vec3[], faces: number[][]): Geometry {
  if (!points.every((p) => p.every(Number.isFinite))) return invalid();
  const center = points.reduce(
    (s, p) => s.map((v, i) => v + p[i] / points.length) as Vec3,
    [0, 0, 0] as Vec3,
  );
  const extent = Math.max(...points.map((p) => Math.hypot(...sub3(p, center))));
  const epsilon = Math.max(extent * 1e-8, Number.EPSILON);
  const indices: number[] = [];
  for (const original of faces) {
    const face = [...original],
      a = points[face[0]];
    let normal = cross(sub3(points[face[1]], a), sub3(points[face[2]], a));
    if (Math.hypot(...normal) <= epsilon * epsilon) return invalid();
    normal = unit3(normal);
    if (face.some((i) => Math.abs(dot(sub3(points[i], a), normal)) > epsilon))
      return invalid();
    if (dot(normal, sub3(a, center)) < 0) {
      face.reverse();
      normal = normal.map((x) => -x) as Vec3;
    }
    for (let i = 0; i < face.length; i++) {
      const b = points[face[i]],
        c = points[face[(i + 1) % face.length]],
        d = points[face[(i + 2) % face.length]];
      if (dot(cross(sub3(c, b), sub3(d, c)), normal) < -epsilon * epsilon)
        return invalid();
    }
    for (let i = 1; i < face.length - 1; i++)
      indices.push(face[0], face[i], face[i + 1]);
  }
  // Closed shells require every edge to be shared by two faces.
  const edges = new Map<string, number>();
  for (const f of faces)
    for (let i = 0; i < f.length; i++) {
      const key = [f[i], f[(i + 1) % f.length]].sort((a, b) => a - b).join(",");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  if ([...edges.values()].some((n) => n !== 2)) return invalid();
  const volume = indices.reduce(
    (v, _, i) =>
      i % 3
        ? v
        : v +
          dot(
            points[indices[i]],
            cross(points[indices[i + 1]], points[indices[i + 2]]),
          ) /
            6,
    0,
  );
  return Math.abs(volume) <= epsilon ** 3
    ? invalid()
    : { kind: "mesh", points, indices };
}
/** Bounded supporting-plane hull for at most 64 input points, merging coplanar facets. */
export function hull3D(input: Vec3[]): Geometry {
  const points = [...new Map(input.map((p) => [p.join(","), p])).values()];
  if (points.length < 4 || !points.every((p) => p.every(Number.isFinite)))
    return invalid();
  const center = points.reduce(
    (s, p) => s.map((v, i) => v + p[i] / points.length) as Vec3,
    [0, 0, 0] as Vec3,
  );
  const extent = Math.max(...points.map((p) => Math.hypot(...sub3(p, center))));
  const eps = Math.max(extent * 1e-8, Number.EPSILON),
    faces = new Map<string, number[]>();
  for (let i = 0; i < points.length - 2; i++)
    for (let j = i + 1; j < points.length - 1; j++)
      for (let k = j + 1; k < points.length; k++) {
        let normal = cross(
          sub3(points[j], points[i]),
          sub3(points[k], points[i]),
        );
        if (Math.hypot(...normal) <= eps * eps) continue;
        normal = unit3(normal);
        const ds = points.map((p) => dot(sub3(p, points[i]), normal));
        if (ds.some((d) => d > eps) && ds.some((d) => d < -eps)) continue;
        const coplanar = ds.flatMap((d, l) => (Math.abs(d) <= eps ? [l] : [])),
          key = coplanar.join(",");
        if (faces.has(key) || coplanar.length === points.length) continue;
        const u = unit3(sub3(points[j], points[i])),
          v = cross(normal, u);
        const projected = coplanar.map(
          (l) => [dot(points[l], u), dot(points[l], v), l] as Vec3,
        );
        faces.set(
          key,
          hull2D(projected).map((p) => p[2]),
        );
      }
  return faces.size < 4 ? invalid() : polyhedron(points, [...faces.values()]);
}
export function platonic(
  type: "Icosahedron" | "Dodecahedron",
  radius: number,
): Geometry {
  const phi = (1 + Math.sqrt(5)) / 2,
    points: Vec3[] = [];
  for (const a of [-1, 1])
    for (const b of [-1, 1]) {
      if (type === "Icosahedron")
        points.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a]);
      else
        points.push(
          [0, a / phi, b * phi],
          [a / phi, b * phi, 0],
          [b * phi, 0, a / phi],
        );
    }
  if (type === "Dodecahedron")
    for (const a of [-1, 1])
      for (const b of [-1, 1]) for (const c of [-1, 1]) points.push([a, b, c]);
  return hull3D(
    points.map((p) => p.map((v) => (v * radius) / Math.hypot(...p)) as Vec3),
  );
}
