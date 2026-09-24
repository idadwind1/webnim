import test from "node:test";
import assert from "node:assert/strict";
import { createCanvasAdapter } from "../dist/player/canvas.js";

test("wheel zoom batches input, preserves its anchor, settles and cancels cleanly", () => {
  const keys = [
    "document",
    "window",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];
  const saved = keys.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  const handlers = new Map(),
    frames = new Map();
  let id = 0,
    draws = 0,
    stamp = performance.now();
  const canvas = {
    style: {},
    getContext: () => ({ setTransform() {} }),
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener() {},
    remove() {},
  };
  const globals = {
    document: { createElement: () => canvas },
    window: { devicePixelRatio: 1 },
    requestAnimationFrame: (fn) => {
      frames.set(++id, fn);
      return id;
    },
    cancelAnimationFrame: (key) => frames.delete(key),
  };
  for (const key of keys)
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value: globals[key],
    });
  try {
    const adapter = createCanvasAdapter(
      { name: "s", type: "plane2d", objects: [] },
      () => draws++,
    );
    adapter.resize(800, 600);
    const initial = structuredClone(adapter.camera);
    assert.equal(adapter.zoomBy(Math.log(1.25)), true);
    assert.ok(Math.abs(adapter.camera.scale - 75) < 1e-10);
    assert.deepEqual(adapter.camera.center, initial.center);
    adapter.setCamera(initial);
    const wheel = (deltaY = -1) =>
      handlers.get("wheel")({
        deltaY,
        deltaMode: 0,
        clientX: 600,
        clientY: 200,
        preventDefault() {},
      });
    const tick = () => {
      stamp += 16;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn(stamp));
    };
    for (let i = 0; i < 100; i++) wheel();
    assert.equal(frames.size, 1, "one scheduled frame for an input burst");
    assert.equal(draws, 0, "no synchronous redraws per wheel event");
    tick();
    assert.ok(
      adapter.camera.scale > 60 && adapter.camera.scale < 60 * Math.exp(0.1),
    );
    let count = 1;
    while (frames.size && count++ < 100) {
      tick();
      assert.ok(
        Math.abs(
          adapter.camera.center[0] + 200 / adapter.camera.scale - 200 / 60,
        ) < 1e-10,
      );
      assert.ok(
        Math.abs(
          adapter.camera.center[1] + 100 / adapter.camera.scale - 100 / 60,
        ) < 1e-10,
      );
    }
    assert.ok(count < 30, "short easing tail");
    assert.equal(frames.size, 0, "no idle animation loop");
    assert.ok(Math.abs(adapter.camera.scale - 60 * Math.exp(0.1)) < 1e-9);
    const settledDraws = draws;
    tick();
    assert.equal(draws, settledDraws);
    wheel();
    adapter.navigate(false);
    assert.equal(frames.size, 0);
    adapter.navigate(true);
    wheel();
    adapter.reset();
    assert.equal(frames.size, 0);
    wheel();
    adapter.dispose();
    assert.equal(frames.size, 0);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
