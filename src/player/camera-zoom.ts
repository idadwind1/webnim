/** Relative log-scale increments preserve concurrent authored camera motion. */
export function createCameraZoom(apply: (delta: number) => boolean) {
  let request = 0,
    target = 0,
    applied = 0;
  const cancel = () => {
    if (request) cancelAnimationFrame(request);
    request = 0;
    target = applied = 0;
  };
  return {
    cancel,
    zoom(factor: number, durationMs = 200, fromScale?: number) {
      if (!Number.isFinite(factor) || factor <= 0)
        throw new Error("Zoom factor must be finite and positive");
      if (!Number.isFinite(durationMs) || durationMs < 0)
        throw new Error("Zoom durationMs must be finite and nonnegative");
      if (
        fromScale !== undefined &&
        (!Number.isFinite(fromScale) || fromScale <= 0)
      )
        throw new Error("Current zoom scale must be finite and positive");
      // Absolute targets replace the pending destination; relative clicks accumulate.
      const remaining =
        fromScale === undefined
          ? target - applied + Math.log(factor)
          : Math.log(factor) - Math.log(fromScale);
      cancel();
      target = Math.max(-700, Math.min(700, remaining));
      if (durationMs === 0) {
        const delta = target;
        cancel();
        apply(delta);
        return;
      }
      if (target === 0) return;
      const start = performance.now();
      const tick = (stamp: number) => {
        request = 0;
        const progress = Math.max(0, Math.min(1, (stamp - start) / durationMs));
        const next = target * progress * progress * (3 - 2 * progress);
        const delta = next - applied;
        applied = next;
        if (!apply(delta) || progress === 1) cancel();
        else request = requestAnimationFrame(tick);
      };
      request = requestAnimationFrame(tick);
    },
  };
}
