import type { CompiledObject } from "./compiler.ts";
import type { Geometry, Vec3 } from "./types.ts";
import { add3, mul3 } from "./spatial.ts";

export function multiPath(paths: Vec3[][]): Geometry {
  const points: Vec3[] = [], breaks: number[] = [];
  for (const path of paths) if (path.length > 1) {
    breaks.push(points.length); points.push(...path);
  }
  return { kind: "path", points, breaks };
}

/** Bounded Cartesian field and contour sampling; no browser or callback dependencies. */
export function fieldGeometry(o: CompiledObject, values: Record<string, number>): Geometry {
  const d = o.definition;
  const n = (key: string, local: Record<string, number> = {}, fallback = 0) =>
    o.expressions.get(key)?.evaluate({ ...values, ...local }) ?? fallback;
  const vector = (p: Vec3): Vec3 => [0, 1, 2].map(i =>
    n(`expressions.${i}`, { x: p[0], y: p[1], z: p[2] })) as Vec3;
  if (d.type === "ArrowVectorField") {
    const paths: Vec3[][] = [], spacing = d.spacing ?? 1;
    const nx = Math.floor((d.xRange[1] - d.xRange[0]) / spacing);
    const ny = Math.floor((d.yRange[1] - d.yRange[0]) / spacing);
    const nz = d.zRange ? Math.floor((d.zRange[1] - d.zRange[0]) / spacing) : 0;
    const scale = n("lengthScale", {}, 0.6), maxLength = d.maxLength ?? spacing * 0.8;
    if (!Number.isFinite(scale) || scale <= 0) return multiPath([[[NaN, NaN, NaN], [NaN, NaN, NaN]]]);
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) for (let k = 0; k <= nz; k++) {
      const p: Vec3 = [d.xRange[0] + i * spacing, d.yRange[0] + j * spacing, (d.zRange?.[0] ?? 0) + k * spacing];
      const v = vector(p), length = Math.hypot(...v);
      if (!Number.isFinite(length) || length === 0) continue;
      paths.push([p, add3(p, mul3(v, Math.min(scale, maxLength / length)))]);
    }
    return { ...multiPath(paths), arrows: true };
  }
  if (d.type === "StreamLines") {
    const dt = d.step ?? 0.04, steps = d.steps ?? 256;
    const paths = d.seeds.map((_, index) => {
      let p = [0, 1, 2].map(i => n(`seeds.${index}.${i}`)) as Vec3;
      const path: Vec3[] = [p];
      for (let i = 0; i < steps; i++) {
        const k1 = vector(p), k2 = vector(add3(p, mul3(k1, dt / 2)));
        const k3 = vector(add3(p, mul3(k2, dt / 2))), k4 = vector(add3(p, mul3(k3, dt)));
        const next = add3(p, mul3(add3(add3(k1, mul3(k2, 2)), add3(mul3(k3, 2), k4)), dt / 6));
        if (!next.every(Number.isFinite) || Math.hypot(...next.map((x, k) => x - p[k])) < 1e-12) break;
        path.push(next); p = next;
      }
      return path;
    });
    return multiPath(paths);
  }
  if (d.type === "ImplicitFunction") {
    const resolution = d.resolution ?? 64, paths: Vec3[][] = [];
    const point = (i: number, j: number): Vec3 => [
      d.xRange[0] + (d.xRange[1] - d.xRange[0]) * i / resolution,
      d.yRange[0] + (d.yRange[1] - d.yRange[0]) * j / resolution, 0];
    const value = (p: Vec3) => n("expression", { x: p[0], y: p[1] });
    const grid = Array.from({ length: resolution + 1 }, (_, i) =>
      Array.from({ length: resolution + 1 }, (_, j) => value(point(i, j))));
    for (let i = 0; i < resolution; i++) for (let j = 0; j < resolution; j++) {
      const p = [point(i, j), point(i + 1, j), point(i + 1, j + 1), point(i, j + 1)];
      const v = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
      if (!v.every(Number.isFinite)) continue;
      const crossings: Vec3[] = [];
      for (let k = 0; k < 4; k++) {
        const next = (k + 1) % 4;
        if ((v[k] > 0) === (v[next] > 0)) continue;
        const t = v[k] / (v[k] - v[next]);
        crossings.push(p[k].map((x, axis) => x + (p[next][axis] - x) * t) as Vec3);
      }
      if (crossings.length === 2) paths.push(crossings);
      if (crossings.length === 4) {
        const centerPositive = value(mul3(add3(p[0], p[2]), 0.5)) > 0;
        const [a, b, c, e] = crossings;
        paths.push(...(centerPositive === (v[0] > 0) ? [[a, b], [c, e]] : [[a, e], [b, c]]));
      }
    }
    return multiPath(paths);
  }
  return { kind: "path", points: [] };
}
