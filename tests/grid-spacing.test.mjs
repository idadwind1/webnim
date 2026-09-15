import test from "node:test";
import assert from "node:assert/strict";
import { createCanvasAdapter } from "../dist/player/canvas.js";
import { compileScene, evaluateDocument } from "../dist/document/index.js";

test("Canvas grids and axis ticks stay readable throughout zoom transitions", () => {
  const descriptors = ["document", "window"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]);
  const ticks = [];
  const context = new Proxy(
    {
      fillRect(x, y, width, height) {
        if (width === 1 && height === 6) ticks.push(x);
      },
    },
    { get: (target, key) => (key in target ? target[key] : () => {}) },
  );
  const canvas = {
    style: {},
    getContext: () => context,
    addEventListener() {},
    removeEventListener() {},
    remove() {},
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => canvas },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { devicePixelRatio: 2 },
  });
  try {
    for (const type of ["axis1d", "plane2d", "polar2d"]) {
      const space = { name: "s", type, objects: [] };
      const frame = evaluateDocument(
        compileScene({ version: 1, spaces: [space] }),
        0,
      ).spaces[0];
      const adapter = createCanvasAdapter(space, () => {});
      adapter.resize(800, 600);
      const scales = [
        8,
        12,
        35,
        72,
        0.8,
        0.5,
        10000,
        ...Array.from({ length: 50 }, (_, i) => 0.5 * 20000 ** (i / 49)),
      ];
      for (const scale of scales) {
        adapter.camera.scale = scale;
        ticks.length = 0;
        adapter.draw(frame, null);
        assert.ok(
          ticks.length >= 2,
          `${type}: ticks remain available at zoom ${scale}`,
        );
        for (let i = 1; i < ticks.length; i++) {
          const gap = ticks[i] - ticks[i - 1];
          assert.ok(
            gap >= 40 - 1e-6 && gap <= 100 + 1e-6,
            `${type}: ${gap.toFixed(2)}px spacing at zoom ${scale}; expected 40–100px`,
          );
        }
      }
      adapter.dispose();
    }
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
