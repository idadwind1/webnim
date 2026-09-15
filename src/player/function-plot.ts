import { compileMath } from "../document/expression.ts";
import { inverse4, transform3 } from "../document/spatial.ts";
import { transformSpacePoint } from "../document/space-transform.ts";
import type { ObjectFrame, SpaceTransform, Vec3 } from "../document/types.ts";
import type { GridBounds } from "./grid-bounds.ts";

/** Screen-space refinement, bounded independently of the mathematical zoom. */
export function sampleFunctionPlot(object: ObjectFrame, transforms: SpaceTransform[], bounds: GridBounds,
  project: (p: Vec3) => Vec3, width: number): Vec3[] {
  const plot = object.geometry.functionPlot!;
  let inverse;
  try { inverse = inverse4(object.matrix); } catch { return object.geometry.points; }
  const xs = [bounds.minX, bounds.maxX].flatMap(x => [bounds.minY, bounds.maxY].map(y => transform3([x, y, 0], inverse)[0]));
  let min = Math.min(...xs), max = Math.max(...xs);
  if (plot.domain) { min = Math.max(min, plot.domain[0]); max = Math.min(max, plot.domain[1]); }
  if (!Number.isFinite(max - min) || !(max > min)) return [];
  const fn = compileMath(plot.expression, [...Object.keys(plot.values), "x"], "$.functionPlot");
  const budget = Math.min(8192, Math.max(256, Math.ceil(width * 4)));
  let evaluations = 0;
  const at = (x: number): Vec3 => {
    evaluations++;
    return transformSpacePoint(transform3([x, fn.evaluate({ ...plot.values, x }), 0], object.matrix), transforms);
  };
  const points: Vec3[] = [], gap: Vec3 = [NaN, NaN, NaN];
  const refine = (a: number, b: number, p: Vec3, q: Vec3, depth: number) => {
    const mid = a + (b - a) / 2;
    if (evaluations >= budget || mid === a || mid === b) { points.push(gap, q); return; }
    const m = at(mid), sp = project(p), sq = project(q), sm = project(m);
    const finite = [...sp, ...sq, ...sm].every(Number.isFinite);
    const error = finite ? Math.hypot(sm[0] - (sp[0] + sq[0]) / 2, sm[1] - (sp[1] + sq[1]) / 2) : Infinity;
    if (error > 0.75 && depth < 10 && evaluations < budget - 2) {
      refine(a, mid, p, m, depth + 1); refine(mid, b, m, q, depth + 1);
    } else {
      // Unresolved singularities break the path instead of drawing a false bridge.
      if (!finite || error > 4) points.push(gap);
      points.push(q);
    }
  };
  const segments = Math.min(512, Math.max(32, Math.ceil(width / 8)));
  let a = min, p = at(a);
  points.push(p);
  for (let i = 1; i <= segments; i++) {
    const b = min + (max - min) * (i / segments), q = at(b);
    refine(a, b, p, q, 0); a = b; p = q;
  }
  return points;
}
