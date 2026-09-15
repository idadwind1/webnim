import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
import { shownPoints } from "../dist/player/adapter.js";
const document = (objects, events = []) => ({
  version: 1,
  spaces: [{ name: "s", type: "plane2d", objects }],
  events,
});
const frame = (c, t = 0) =>
  evaluateDocument(c, t).spaces[0].objects.find((o) => o.id === "s.result");
const area = (g) =>
  g.indices.reduce((sum, _, i) => {
    if (i % 3) return sum;
    const [a, b, c] = g.indices.slice(i, i + 3).map((j) => g.points[j]);
    return (
      sum +
      Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) /
        2
    );
  }, 0);
test("polygon boolean operations produce correct areas and hole-aware triangulation", () => {
  for (const [type, expected] of [
    ["Union", 6],
    ["Difference", 2],
    ["Intersection", 2],
    ["Exclusion", 4],
  ]) {
    const c = compileScene(
      document([
        { id: "a", type: "Square", size: 2 },
        { id: "b", type: "Square", size: 2, position: [1, 0] },
        { id: "result", type, operands: ["s.a", "s.b"] },
      ]),
    );
    assert.equal(area(frame(c).geometry), expected, type);
  }
  const c = compileScene(
    document([
      { id: "outer", type: "Square", size: 4 },
      { id: "inner", type: "Square", size: 2 },
      { id: "hole", type: "Difference", operands: ["s.outer", "s.inner"] },
      { id: "result", type: "Intersection", operands: ["s.hole", "s.outer"] },
    ]),
  );
  assert.equal(area(frame(c).geometry), 12);
  assert.equal(frame(c).geometry.polygons[0].length, 2);
});
test("boolean geometry follows animated operands and safely renders empty intersections", () => {
  const c = compileScene(
    document(
      [
        { id: "a", type: "Square", size: 2 },
        { id: "b", type: "Square", size: 2, position: [1, 0] },
        { id: "result", type: "Intersection", operands: ["s.a", "s.b"] },
      ],
      [{ type: "Shift", object: "s.b", by: [3, 0], duration: 3 }],
    ),
  );
  assert.equal(area(frame(c, 0).geometry), 2);
  assert.equal(frame(c, 3).geometry.points.length, 0);
  assert.deepEqual(shownPoints(frame(c, 3)), []);
  assert.deepEqual(evaluateDocument(c, 3).diagnostics, []);
  assert.equal(area(frame(c, 0).geometry), 2);
  assert.throws(
    () =>
      compileScene(
        document([
          { id: "a", type: "Line", from: [0, 0], to: [1, 1] },
          { id: "result", type: "Union", operands: ["s.a", "s.a"] },
        ]),
      ),
    /closed/,
  );
  assert.throws(
    () =>
      compileScene(
        document([
          { id: "a", type: "Square" },
          { id: "result", type: "Union", operands: ["s.a", "s.result"] },
        ]),
      ),
    /cycle/,
  );
});
