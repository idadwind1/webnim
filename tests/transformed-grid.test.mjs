import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
import { createCanvasAdapter } from "../dist/player/canvas.js";

test("transformed grids extend past the viewport after shear and nonlinear mapping", () => {
  const saved = ["document", "window"].map((k) => [
    k,
    Object.getOwnPropertyDescriptor(globalThis, k),
  ]);
  let paths = [],
    path = [];
  const ctx = new Proxy(
    {
      beginPath() {
        path = [];
      },
      moveTo(x, y) {
        path.push([x, y]);
      },
      lineTo(x, y) {
        path.push([x, y]);
      },
      stroke() {
        paths.push(path);
      },
    },
    { get: (o, k) => (k in o ? o[k] : () => {}) },
  );
  const canvas = {
    style: {},
    getContext: () => ctx,
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
    value: { devicePixelRatio: 1 },
  });
  try {
    const doc = {
      version: 1,
      spaces: [{ name: "s", type: "plane2d", objects: [] }],
      events: [
        {
          type: "ApplySpaceMatrix",
          space: "s",
          matrix: [
            [1, 0.5],
            [0, 1],
          ],
          duration: 1,
        },
        {
          type: "ApplyComplexFunction",
          space: "s",
          expression: "z^2 / 3",
          start: 1,
          duration: 1,
        },
      ],
    };
    const compiled = compileScene(doc),
      adapter = createCanvasAdapter(doc.spaces[0], () => {});
    adapter.resize(1600, 800);
    for (const center of [
      [0, 0, 0],
      [8, 3, 0],
      [-6, -2, 0],
    ])
      for (const scale of [20, 85, 180])
        for (const time of [1, 1.5, 2]) {
          adapter.setCamera({ ...adapter.camera, center, scale });
          paths = [];
          adapter.draw(evaluateDocument(compiled, time).spaces[0], null);
          const inside = ([x, y]) => x > 1 && x < 1599 && y > 1 && y < 799;
          const clipped = paths.filter(
            (p) => p.length && (inside(p[0]) || inside(p.at(-1))),
          );
          assert.equal(
            clipped.length,
            0,
            `grid endpoints inside viewport at t=${time}, scale=${scale}, center=${center}`,
          );
          assert.ok(paths.length < 310, "grid work stays bounded");
        }
    adapter.dispose();
  } finally {
    for (const [k, v] of saved) {
      if (v) Object.defineProperty(globalThis, k, v);
      else delete globalThis[k];
    }
  }
});
