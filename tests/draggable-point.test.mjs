import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
import { createCanvasAdapter } from "../dist/player/canvas.js";

test("draggable points render and pick above later overlapping geometry", () => {
  const compiled = compileScene({
    version: 1,
    parameters: { a: 0 },
    spaces: [
      {
        name: "s",
        type: "plane2d",
        objects: [
          {
            id: "handle",
            type: "Point",
            at: ["a", 0],
            drag: { parameter: "a" },
          },
          { id: "line", type: "Line", from: [-2, 0], to: [2, 0] },
          { id: "ordinary", type: "Point", at: [0, 0] },
        ],
      },
    ],
  });
  const frame = evaluateDocument(compiled, 0).spaces[0];
  assert.equal(frame.objects[0].draggable, true);
  assert.equal(frame.objects[2].draggable, undefined);
  assert.ok(frame.objects.every((o) => !o.selected));
  const saved = ["document", "window"].map((k) => [
    k,
    Object.getOwnPropertyDescriptor(globalThis, k),
  ]);
  const arcs = [];
  const ctx = new Proxy(
    {
      arc(x, y, r) {
        arcs.push(r);
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
    const adapter = createCanvasAdapter(compiled.document.spaces[0], () => {});
    adapter.resize(800, 600);
    adapter.draw(frame, null);
    assert.deepEqual(
      arcs.slice(-2),
      [13, 6],
      "halo and solid center render last",
    );
    assert.equal(adapter.pick(400, 300), "s.handle");
    assert.equal(
      adapter.pick(415, 300),
      "s.handle",
      "halo has a generous grab target",
    );
    adapter.dispose();
  } finally {
    for (const [k, v] of saved) {
      if (v) Object.defineProperty(globalThis, k, v);
      else delete globalThis[k];
    }
  }
});
