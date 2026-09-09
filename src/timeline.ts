export type Easing =
  | "linear"
  | "smooth"
  | "ease-in"
  | "ease-out"
  | "sine"
  | "there-and-back"
  | "bounce";
export interface Track {
  target: string;
  property: string;
  start: number;
  duration: number;
  from: number;
  to: number;
  easing?: Easing;
}
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export function ease(t: number, kind: Easing = "smooth"): number {
  t = clamp01(t);
  switch (kind) {
    case "linear":
      return t;
    case "ease-in":
      return t * t * t;
    case "ease-out":
      return 1 - (1 - t) ** 3;
    case "sine":
      return (1 - Math.cos(Math.PI * t)) / 2;
    case "there-and-back":
      return Math.sin(Math.PI * t) ** 2;
    case "bounce": {
      const n = 7.5625,
        d = 2.75;
      if (t < 1 / d) return n * t * t;
      if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
      if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
      return n * (t -= 2.625 / d) * t + 0.984375;
    }
    default:
      return t * t * (3 - 2 * t);
  }
}
export function trackValue(track: Track, time: number): number {
  return (
    track.from +
    (track.to - track.from) *
      ease((time - track.start) / Math.max(track.duration, 1e-9), track.easing)
  );
}
export function evaluateTracks(
  tracks: Track[],
  time: number,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = Object.create(null);
  for (const track of tracks) {
    const values = (result[track.target] ??= Object.create(null));
    if (time >= track.start || values[track.property] === undefined)
      values[track.property] = trackValue(track, time);
  }
  return result;
}
