import { evaluateDragTarget } from "../document/evaluator.ts";
import type { CompiledScene } from "../document/compiler.ts";
import type { Vec3 } from "../document/types.ts";
/** Screen-space constrained inverse: only the declared parameter may change. */
export function parameterFromDrag(
  compiled: CompiledScene,
  time: number,
  overrides: Record<string, number>,
  id: string,
  pointer: [number, number],
  project: (point: Vec3) => Vec3,
): { parameter: string; value: number } | null {
  const d = compiled.objects.get(id)?.definition;
  if (!d || !("drag" in d) || !d.drag) return null;
  const binding = d.drag,
    current =
      overrides[binding.parameter] ??
      evaluateDragTarget(compiled, time, overrides, id).parameters[binding.parameter];
  let lo = binding.min ?? (d.type === "PointOnCurve" ? 0 : current - 100),
    hi = binding.max ?? (d.type === "PointOnCurve" ? 1 : current + 100),
    best = current,
    bestDistance = Infinity;
  const distance = (value: number) => {
    const point = evaluateDragTarget(compiled, time, {
      ...overrides, [binding.parameter]: value,
    }, id).object?.geometry.points[0];
    if (!point) return Infinity;
    const p = project(point);
    return (p[0] - pointer[0]) ** 2 + (p[1] - pointer[1]) ** 2;
  };
  // Locate the closest branch globally, then refine that bracket rather than
  // rebuilding another 33-point grid at every refinement level.
  const step = (hi - lo) / 32;
  for (let i = 0; i <= 32; i++) {
    const value = lo + i * step, squared = distance(value);
    if (squared < bestDistance) { best = value; bestDistance = squared; }
  }
  if (!Number.isFinite(bestDistance)) return null;
  lo = Math.max(lo, best - step);
  hi = Math.min(hi, best + step);
  const ratio = (Math.sqrt(5) - 1) / 2;
  let a = hi - ratio * (hi - lo), b = lo + ratio * (hi - lo);
  let da = distance(a), db = distance(b);
  for (let i = 0; i < 24; i++) {
    if (da < bestDistance) { best = a; bestDistance = da; }
    if (db < bestDistance) { best = b; bestDistance = db; }
    if (da < db) {
      hi = b; b = a; db = da; a = hi - ratio * (hi - lo); da = distance(a);
    } else {
      lo = a; a = b; da = db; b = lo + ratio * (hi - lo); db = distance(b);
    }
  }
  return Number.isFinite(bestDistance)
    ? { parameter: binding.parameter, value: best }
    : null;
}
