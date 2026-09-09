export interface Vec {
  x: number;
  y: number;
}
export interface Camera {
  x: number;
  y: number;
  scale: number;
}
export interface Viewport {
  width: number;
  height: number;
}
export const MIN_SCALE = 0.0001,
  MAX_SCALE = 10_000_000;
export function worldToScreen(p: Vec, c: Camera, v: Viewport): Vec {
  return {
    x: v.width / 2 + (p.x - c.x) * c.scale,
    y: v.height / 2 - (p.y - c.y) * c.scale,
  };
}
export function screenToWorld(p: Vec, c: Camera, v: Viewport): Vec {
  return {
    x: c.x + (p.x - v.width / 2) / c.scale,
    y: c.y - (p.y - v.height / 2) / c.scale,
  };
}
export function zoomAt(c: Camera, v: Viewport, p: Vec, factor: number): Camera {
  const before = screenToWorld(p, c, v);
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, c.scale * factor));
  return {
    x: before.x - (p.x - v.width / 2) / scale,
    y: before.y + (p.y - v.height / 2) / scale,
    scale,
  };
}
export function panBy(c: Camera, delta: Vec): Camera {
  return { ...c, x: c.x - delta.x / c.scale, y: c.y + delta.y / c.scale };
}
export function tickSpacing(scale: number): number {
  const target = 95 / scale;
  const power = 10 ** Math.floor(Math.log10(target));
  const fraction = target / power;
  return (
    (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power
  );
}
export function defaultCamera(v: Viewport, kind = "quadratic"): Camera {
  return {
    x: kind === "sine" ? 0 : 1.1,
    y: kind === "sine" ? 0 : 2.2,
    scale: Math.max(15, Math.min(v.width / 8.5, v.height / 7.4)),
  };
}
