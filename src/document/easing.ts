/** Bounded easing curves shared by every deterministic event. */
export const easingNames = [
  "linear",
  "smooth",
  "ease-in",
  "ease-out",
  "smoother",
  "sine-in",
  "sine-out",
  "sine-in-out",
  "cubic-in",
  "cubic-out",
  "cubic-in-out",
  "quart-in",
  "quart-out",
  "quart-in-out",
  "quint-in",
  "quint-out",
  "quint-in-out",
  "expo-in",
  "expo-out",
  "expo-in-out",
  "circ-in",
  "circ-out",
  "circ-in-out",
] as const;
export type Ease = (typeof easingNames)[number];
export function easeProgress(p: number, easing: string = "linear"): number {
  p = Math.max(0, Math.min(1, p));
  if (p === 0 || p === 1) return p;
  if (easing === "smooth") return p * p * (3 - 2 * p);
  if (easing === "smoother") return p * p * p * (p * (p * 6 - 15) + 10);
  if (easing === "ease-in") return p * p;
  if (easing === "ease-out") return 1 - (1 - p) ** 2;
  const base = (x: number): number => {
    if (easing.startsWith("sine")) return 1 - Math.cos((x * Math.PI) / 2);
    if (easing.startsWith("expo")) return x === 0 ? 0 : 2 ** (10 * x - 10);
    if (easing.startsWith("circ")) return 1 - Math.sqrt(Math.max(0, 1 - x * x));
    const power = easing.startsWith("cubic")
      ? 3
      : easing.startsWith("quart")
        ? 4
        : easing.startsWith("quint")
          ? 5
          : 1;
    return x ** power;
  };
  if (easing.endsWith("in-out"))
    return p < 0.5 ? base(2 * p) / 2 : 1 - base(2 - 2 * p) / 2;
  if (easing.endsWith("out")) return 1 - base(1 - p);
  return base(p);
}
