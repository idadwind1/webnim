import type { ViewCamera } from "./adapter.ts";

/** Require subpixel coordinate resolution everywhere in the visible window. */
export function validViewport(center: readonly number[], scale: number, width: number, height: number): boolean {
  if (!Number.isFinite(scale) || scale <= 0) return false;
  const pixel = 1 / scale;
  return [width, height].every((size, i) => {
    const lo = center[i] - size / scale / 2;
    const hi = center[i] + size / scale / 2;
    return Number.isFinite(lo) && Number.isFinite(hi) && Number.isFinite(hi - lo) && lo < hi &&
      pixel > 4 * Number.EPSILON * Math.max(Math.abs(lo), Math.abs(hi), Number.MIN_VALUE);
  });
}

/** Apply the largest safe part of a pointer-anchored logarithmic zoom. */
export function zoomCamera(camera: ViewCamera, delta: number, x: number, y: number, width: number, height: number): boolean {
  const candidate = (fraction: number) => {
    const scale = Math.exp(Math.log(camera.scale) + delta * fraction);
    const center = [...camera.center] as ViewCamera["center"];
    center[0] += x / camera.scale - x / scale;
    center[1] -= y / camera.scale - y / scale;
    return { scale, center };
  };
  let result = candidate(1);
  const accepted = validViewport(result.center, result.scale, width, height);
  if (!accepted) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 48; i++) {
      const mid = (lo + hi) / 2, next = candidate(mid);
      if (validViewport(next.center, next.scale, width, height)) lo = mid; else hi = mid;
    }
    result = candidate(lo);
  }
  if (validViewport(result.center, result.scale, width, height)) Object.assign(camera, result);
  return accepted;
}

/** Indexed, bounded iteration cannot stall when adding a step rounds away. */
export function gridValues(min: number, max: number, step: number): number[] {
  if (![min, max, step].every(Number.isFinite) || step <= 0) return [];
  const first = Math.ceil(min / step) * step;
  const count = Math.max(0, Math.min(150, Math.floor((max - first) / step) + 1));
  return Array.from({ length: count }, (_, i) => first + i * step);
}
