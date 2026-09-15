import type { SpaceTransform, Vec3 } from "../document/types.ts";
import { transformSpacePoint } from "../document/space-transform.ts";

export interface GridBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}
/** Overscan in source coordinates, then clip only after mapping to the viewport.
 * A winding boundary outside the viewport's circumscribed circle covers its corners
 * too, including maps such as z² that wind around the destination more than once.
 * Work is capped: a singular or bounded map cannot cover an arbitrary viewport.
 */
export function transformedGridBounds(
  view: GridBounds,
  transforms: readonly SpaceTransform[],
): GridBounds {
  if (!transforms.some((t) => t.progress !== 0)) return view;
  const cx = (view.minX + view.maxX) / 2,
    cy = (view.minY + view.maxY) / 2;
  const halfX = (view.maxX - view.minX) / 2,
    halfY = (view.maxY - view.minY) / 2;
  const radius = Math.hypot(halfX, halfY) * 1.05;
  let result = view;
  for (let attempt = 0; attempt < 8; attempt++) {
    const factor = 1.5 * 2 ** attempt;
    result = {
      minX: cx - halfX * factor,
      maxX: cx + halfX * factor,
      minY: cy - halfY * factor,
      maxY: cy + halfY * factor,
    };
    const corners: Vec3[] = [
      [result.minX, result.minY, 0],
      [result.maxX, result.minY, 0],
      [result.maxX, result.maxY, 0],
      [result.minX, result.maxY, 0],
    ];
    const boundary: Vec3[] = [];
    for (let edge = 0; edge < 4; edge++)
      for (let i = 0; i < 64; i++) {
        const a = corners[edge],
          b = corners[(edge + 1) % 4],
          t = i / 64;
        boundary.push(
          transformSpacePoint(
            [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0],
            transforms,
          ),
        );
      }
    let angle = 0,
      clear = true;
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i],
        b = boundary[(i + 1) % boundary.length];
      if (!a.every(Number.isFinite) || !b.every(Number.isFinite)) {
        clear = false;
        break;
      }
      const ax = a[0] - cx,
        ay = a[1] - cy,
        bx = b[0] - cx,
        by = b[1] - cy;
      const dx = bx - ax,
        dy = by - ay;
      const t = Math.max(
        0,
        Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
      );
      if (Math.hypot(ax + t * dx, ay + t * dy) < radius) {
        clear = false;
        break;
      }
      angle += Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    }
    if (clear && Math.abs(angle) > Math.PI) return result;
  }
  // Non-surjective/singular maps may have no enclosing preimage. Preserve local
  // detail instead of drawing an enormous, artificially sparse source patch.
  return view;
}
