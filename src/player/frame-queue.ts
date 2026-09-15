/** Coalesce pointer samples without adding an easing tail behind the cursor. */
export function createFrameQueue<T>(consume: (value: T) => void) {
  let request = 0;
  let pending: { value: T } | undefined;
  const flush = () => {
    if (request) cancelAnimationFrame(request);
    request = 0;
    const latest = pending;
    pending = undefined;
    if (latest) consume(latest.value);
  };
  return {
    push(value: T) {
      pending = { value };
      if (!request) request = requestAnimationFrame(flush);
    },
    flush,
    cancel() {
      if (request) cancelAnimationFrame(request);
      request = 0;
      pending = undefined;
    },
  };
}
