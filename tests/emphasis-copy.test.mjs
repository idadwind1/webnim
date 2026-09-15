import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
import { createCanvasAdapter } from "../dist/player/canvas.js";
const doc = (objects, events, extra = {}) => ({
  version: 1,
  spaces: [{ name: "s", type: "plane2d", objects }],
  events,
  ...extra,
});
const square = {
  id: "a",
  type: "Square",
  size: 2,
  style: { fillOpacity: 0.4 },
};
const frames = (c, t) => evaluateDocument(c, t).spaces[0].objects;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("emphasis overlays preserve their source, use live geometry, and disappear on completion or seeking backward", () => {
  for (const type of ["Flash", "FocusOn", "Circumscribe"]) {
    const c = compileScene(
      doc(
        [square],
        [
          { type, object: "s.a", start: 1, duration: 2 },
          { type: "Shift", object: "s.a", by: [2, 0], start: 1, duration: 2 },
        ],
      ),
    );
    assert.equal(frames(c, 0).length, 1);
    const f = frames(c, 2),
      source = f[0],
      overlay = f[1];
    assert.equal(f.length, 2);
    assert.equal(source.visible, true);
    assert.equal(source.reveal, 1);
    assert.equal(overlay.interactive, false);
    near(
      (Math.min(...overlay.geometry.points.map((p) => p[0])) +
        Math.max(...overlay.geometry.points.map((p) => p[0]))) /
        2,
      1,
    );
    if (type === "Flash") assert.equal(overlay.geometry.breaks.length, 12);
    if (type === "FocusOn")
      near(Math.max(...overlay.geometry.points.map((p) => p[0])) - 1, 1.5);
    if (type === "Circumscribe") {
      near(Math.min(...overlay.geometry.points.map((p) => p[0])), -0.15);
      assert.equal(overlay.style.fillOpacity, 0);
    }
    assert.equal(frames(c, 3).length, 1);
    assert.deepEqual(frames(c, 2), f);
    assert.equal(frames(c, 0).length, 1);
  }
});
test("TransformFromCopy leaves source geometry intact and transfers target visibility at completion", () => {
  const c = compileScene(
    doc(
      [
        { ...square, position: [-2, 0] },
        { id: "b", type: "Circle", radius: 1, position: [2, 0] },
      ],
      [
        { type: "Shift", object: "s.a", by: [0, 1], duration: 1 },
        {
          type: "TransformFromCopy",
          object: "s.a",
          to: "s.b",
          start: 1,
          duration: 2,
        },
      ],
    ),
  );
  assert.equal(frames(c, 0)[1].visible, false);
  const start = frames(c, 1)[0];
  const middle = frames(c, 2);
  assert.deepEqual(middle[0], start);
  assert.equal(middle[1].visible, false);
  assert.equal(middle.length, 3);
  assert.equal(middle[2].interactive, false);
  const end = frames(c, 3);
  assert.equal(end.length, 2);
  assert.equal(end[0].visible, true);
  assert.equal(end[1].visible, true);
  assert.deepEqual(end[0], start);
  assert.deepEqual(frames(c, 2), middle);
});
test("copy morph uses world snapshots across different transformed parents and allows source movement during copy", () => {
  const c = compileScene(
    doc(
      [
        { ...square },
        { id: "b", type: "Square", size: 2 },
        { id: "ga", type: "Group", children: ["s.a"], position: [-3, 0] },
        { id: "gb", type: "Group", children: ["s.b"], position: [3, 0] },
      ],
      [
        {
          type: "TransformFromCopy",
          object: "s.a",
          to: "s.b",
          start: 1,
          duration: 2,
        },
        { type: "Shift", object: "s.a", by: [0, 2], start: 1, duration: 2 },
      ],
    ),
  );
  const f = frames(c, 2),
    overlay = f.at(-1);
  near(Math.min(...overlay.geometry.points.map((p) => p[0])), -1);
  near(Math.max(...overlay.geometry.points.map((p) => p[0])), 1);
  near(Math.min(...overlay.geometry.points.map((p) => p[1])), -1);
  near(Math.min(...f[0].geometry.points.map((p) => p[1])), 0);
});
test("emphasis/copy validation rejects unsupported bounds, targets and simultaneous destination writers", () => {
  assert.throws(
    () =>
      compileScene(
        doc(
          [{ id: "t", type: "Text", text: "hello" }],
          [{ type: "Circumscribe", object: "s.t", duration: 1 }],
        ),
      ),
    /bounds/,
  );
  const objects = [square, { id: "b", type: "Circle" }];
  const copy = {
    type: "TransformFromCopy",
    object: "s.a",
    to: "s.b",
    duration: 2,
  };
  assert.throws(
    () =>
      compileScene(
        doc(objects, [
          copy,
          { type: "Shift", object: "s.b", by: [1, 0], duration: 1 },
        ]),
      ),
    /Overlapping/,
  );
  assert.throws(
    () => compileScene(doc(objects, [{ ...copy, to: "s.a" }])),
    /itself/,
  );
  assert.throws(
    () =>
      compileScene(
        doc(
          [
            { id: "a", type: "Annulus" },
            { id: "b", type: "Circle" },
          ],
          [copy],
        ),
      ),
    /Disconnected/,
  );
});
test("temporary Canvas overlays do not intercept pointer picking", () => {
  const c = compileScene(
    doc([square], [{ type: "FocusOn", object: "s.a", duration: 2 }]),
  );
  const saved = ["document", "window"].map((k) => [
    k,
    Object.getOwnPropertyDescriptor(globalThis, k),
  ]);
  const ctx = new Proxy({}, { get: () => () => {} }),
    canvas = {
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
  let adapter;
  try {
    adapter = createCanvasAdapter(
      { ...c.document.spaces[0], grid: false, axes: false },
      () => {},
    );
    adapter.resize(800, 600);
    adapter.draw(evaluateDocument(c, 0.5).spaces[0], null);
    const pick = (p) => {
      const q = adapter.project(p);
      return adapter.pick(q[0], q[1]);
    };
    assert.equal(pick([2.25, 0, 0]), null);
    assert.equal(pick([0, 0, 0]), "s.a");
    adapter.draw(evaluateDocument(c, 2).spaces[0], null);
    assert.equal(pick([2.25, 0, 0]), null);
  } finally {
    adapter?.dispose();
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  }
});
