import clipping, { type MultiPolygon } from "polygon-clipping";
import { ShapeUtils, Vector2 } from "three";
import type { CompiledObject } from "./compiler.ts";
import type { Geometry, Vec3 } from "./types.ts";
const cache = new WeakMap<
  CompiledObject,
  { key: string; geometry: Geometry }
>();
export function booleanGeometry(
  object: CompiledObject,
  inputs: Geometry[],
): Geometry {
  const invalid = (): Geometry => ({ kind: "path", points: [[NaN, NaN, NaN]] });
  if (
    inputs.reduce((sum, g) => sum + g.points.length, 0) > 8192 ||
    inputs.some((g) => !g.points.every((p) => p.every(Number.isFinite)))
  )
    return invalid();
  const key = JSON.stringify(
    inputs.map((g) => [g.points, g.breaks, g.polygons, g.closed]),
  );
  const cached = cache.get(object);
  if (cached?.key === key) return cached.geometry;
  const polygons = inputs.map((g) => {
    if (!g.points.length) return [];
    if (!g.closed) return undefined;
    const starts = g.breaks ?? [0];
    return (g.polygons ?? [starts]).map((p) =>
      p.map((start) =>
        g.points
          .slice(start, starts[starts.indexOf(start) + 1] ?? g.points.length)
          .map((v) => [v[0], v[1]] as [number, number]),
      ),
    );
  });
  if (polygons.some((p) => !p)) return invalid();
  try {
    const [first, ...rest] = polygons as MultiPolygon[];
    const result =
      object.definition.type === "Union"
        ? clipping.union(first, ...rest)
        : object.definition.type === "Difference"
          ? clipping.difference(first, ...rest)
          : object.definition.type === "Intersection"
            ? clipping.intersection(first, ...rest)
            : clipping.xor(first, ...rest);
    const points: Vec3[] = [],
      breaks: number[] = [],
      groups: number[][] = [],
      indices: number[] = [];
    for (const polygon of result) {
      const start = points.length,
        group: number[] = [],
        rings = polygon.map((ring) => ring.slice(0, -1));
      const triangles = ShapeUtils.triangulateShape(
        rings[0].map((p) => new Vector2(...p)),
        rings.slice(1).map((r) => r.map((p) => new Vector2(...p))),
      );
      for (const ring of rings) {
        group.push(points.length);
        breaks.push(points.length);
        points.push(...ring.map((p) => [p[0], p[1], 0] as Vec3));
      }
      indices.push(...triangles.flat().map((i) => i + start));
      groups.push(group);
    }
    if (points.length > 16384) return invalid();
    const geometry: Geometry = {
      kind: "path",
      closed: true,
      points,
      breaks,
      polygons: groups,
      indices,
    };
    cache.set(object, { key, geometry });
    return geometry;
  } catch {
    return invalid();
  }
}
