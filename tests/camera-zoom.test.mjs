import test from "node:test";
import assert from "node:assert/strict";
import { createCameraZoom } from "../dist/player/camera-zoom.js";

test("programmatic zoom eases in log scale, accumulates targets, and cancels without a tail", () => {
  const originals = Object.fromEntries(
    ["requestAnimationFrame", "cancelAnimationFrame", "performance"].map(
      (k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)],
    ),
  );
  const frames = new Map();
  let now = 0,
    id = 0,
    scale = 60;
  Object.defineProperty(globalThis, "performance", {
    configurable: true,
    value: { now: () => now },
  });
  globalThis.requestAnimationFrame = (fn) => {
    frames.set(++id, fn);
    return id;
  };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const step = (ms) => {
    now += ms;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((fn) => fn(now));
  };
  try {
    const zoom = createCameraZoom((delta) => {
      scale *= Math.exp(delta);
      return true;
    });
    zoom.zoom(4, 200);
    assert.equal(scale, 60);
    step(100);
    assert.ok(
      Math.abs(scale - 120) < 1e-9,
      "logarithmic midpoint is geometric mean",
    );
    zoom.zoom(0.5, 200);
    assert.ok(Math.abs(scale - 120) < 1e-9, "retargeting does not jump");
    step(200);
    assert.ok(
      Math.abs(scale - 120) < 1e-9,
      "new factor multiplies pending target",
    );
    zoom.zoom(1.25);
    zoom.zoom(1.25);
    zoom.zoom(0.8);
    assert.equal(frames.size, 1);
    step(200);
    assert.ok(Math.abs(scale - 150) < 1e-9);
    zoom.zoom(2);
    step(50);
    const displayed = scale;
    zoom.cancel();
    step(1000);
    assert.equal(scale, displayed);
    assert.equal(frames.size, 0);
    zoom.zoom(2);
    zoom.zoom(0.5, 0);
    assert.ok(
      Math.abs(scale - displayed) < 1e-9,
      "immediate call settles accumulated target",
    );
    assert.equal(frames.size, 0);
    zoom.zoom(2);
    scale *= 3;
    step(200);
    assert.ok(
      Math.abs(scale - displayed * 6) < 1e-8,
      "authored zoom composes with relative increments",
    );
    zoom.zoom(10);
    const beforeSet = scale;
    zoom.zoom(90, 200, scale);
    assert.equal(scale, beforeSet, "absolute target does not jump");
    step(100);
    assert.ok(Math.abs(scale - Math.sqrt(beforeSet * 90)) < 1e-8);
    zoom.zoom(60, 200, scale);
    zoom.zoom(2);
    step(200);
    assert.ok(
      Math.abs(scale - 120) < 1e-8,
      "absolute replaces pending target, then relative multiplies it",
    );
    zoom.zoom(60, 0, scale);
    assert.ok(Math.abs(scale - 60) < 1e-8);
    for (const factor of [0, -1, NaN, Infinity])
      assert.throws(() => zoom.zoom(factor));
    for (const ms of [-1, NaN, Infinity]) assert.throws(() => zoom.zoom(2, ms));
    const bounded = createCameraZoom(() => false);
    bounded.zoom(1e300);
    step(50);
    assert.equal(frames.size, 0, "adapter limit stops animation");
  } finally {
    for (const [key, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
