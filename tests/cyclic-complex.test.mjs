import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
const point = (id, x, y) => ({ id, type: "Point", at: [x, y] });
const scene = (objects, events, extra = {}) =>
  compileScene({
    version: 1,
    spaces: [{ name: "s", type: "plane2d", objects }],
    events,
    ...extra,
  });
const objects = (c, t, params) =>
  evaluateDocument(c, t, params).spaces[0].objects;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test("CyclicReplace rotates event-start centers, composes with earlier moves, and seeks deterministically", () => {
  const c = scene(
    [point("a", -2, 0), point("b", 0, 2), point("c", 2, 0)],
    [
      { type: "Shift", object: "s.a", by: [0, 1], duration: 1 },
      {
        type: "CyclicReplace",
        objects: ["s.a", "s.b", "s.c"],
        start: 1,
        duration: 2,
      },
      {
        type: "CyclicReplace",
        objects: ["s.a", "s.b", "s.c"],
        start: 3,
        duration: 2,
      },
    ],
  );
  assert.deepEqual(
    objects(c, 3).map((o) => o.geometry.points[0]),
    [
      [0, 2, 0],
      [2, 0, 0],
      [-2, 1, 0],
    ],
  );
  assert.deepEqual(
    objects(c, 5).map((o) => o.geometry.points[0]),
    [
      [2, 0, 0],
      [-2, 1, 0],
      [0, 2, 0],
    ],
  );
  const first = objects(c, 2);
  objects(c, 5);
  assert.deepEqual(objects(c, 2), first);
});
test("CyclicReplace respects a transformed parent and rejects conflicting or invalid targets", () => {
  const base = [point("a", -1, 0), point("b", 1, 0)],
    event = {
      type: "CyclicReplace",
      objects: ["s.a", "s.b"],
      start: 1,
      duration: 2,
    };
  const c = scene(
    [...base, { id: "g", type: "Group", children: ["s.a", "s.b"] }],
    [{ type: "Shift", object: "s.g", by: [5, 2], duration: 1 }, event],
  );
  assert.deepEqual(
    objects(c, 3)
      .slice(0, 2)
      .map((o) => o.geometry.points[0]),
    [
      [6, 2, 0],
      [4, 2, 0],
    ],
  );
  assert.throws(() => scene(base, [{ ...event, objects: ["s.a", "s.a"] }]));
  assert.throws(
    () =>
      scene(base, [
        event,
        { type: "MoveTo", object: "s.b", to: [2, 1], start: 1, duration: 1 },
      ]),
    /Overlapping/,
  );
  assert.throws(
    () =>
      scene([...base, { id: "g", type: "Group", children: ["s.a"] }], [event]),
    /siblings/,
  );
  assert.throws(
    () => scene(base, [{ ...event, objects: ["s.a", "s.missing"] }]),
    /Unknown/,
  );
});
test("ComplexHomotopy uses safe complex arithmetic and progress with parameter-sensitive caching", () => {
  const c = scene(
    [point("p", 1, 0)],
    [
      {
        type: "ComplexHomotopy",
        object: "s.p",
        expression: "exp(i*pi*alpha)*z + a*alpha",
        duration: 2,
      },
    ],
    { parameters: { a: 2 } },
  );
  const middle = objects(c, 1)[0].geometry.points[0];
  near(middle[0], 1);
  near(middle[1], 1);
  const end = objects(c, 2)[0].geometry.points[0];
  near(end[0], 1);
  near(end[1], 0);
  near(objects(c, 1, { a: 4 })[0].geometry.points[0][0], 2);
  near(objects(c, 1)[0].geometry.points[0][0], 1);
  assert.throws(() =>
    scene(
      [point("p", 0, 0)],
      [
        {
          type: "ComplexHomotopy",
          object: "s.p",
          expression: "globalThis.value",
          duration: 1,
        },
      ],
    ),
  );
  const singular = scene(
    [point("p", 1, 0)],
    [
      {
        type: "ComplexHomotopy",
        object: "s.p",
        expression: "z/(1-alpha)",
        duration: 1,
      },
    ],
  );
  assert.equal(evaluateDocument(singular, 1).diagnostics.length, 1);
  assert.throws(
    () =>
      compileScene({
        version: 1,
        spaces: [
          {
            name: "s",
            type: "space3d",
            objects: [{ id: "p", type: "Point", at: [1, 0, 0] }],
          },
        ],
        events: [
          {
            type: "ComplexHomotopy",
            object: "s.p",
            expression: "z",
            duration: 1,
          },
        ],
      }),
    /plane2d/,
  );
});
test("ComplexHomotopy deforms continuous curves and rejects disconnected paths", () => {
  const c = scene(
    [{ id: "line", type: "Line", from: [-1, 0], to: [1, 0] }],
    [
      {
        type: "ComplexHomotopy",
        object: "s.line",
        expression: "z+i*alpha*z^2",
        duration: 2,
      },
    ],
  );
  const pts = objects(c, 2)[0].geometry.points;
  near(pts[0][1], 1);
  near(pts.at(-1)[1], 1);
  assert.ok(Math.abs(pts[64][1]) < 0.001);
  const first = objects(c, 0.75);
  objects(c, 2);
  assert.deepEqual(objects(c, 0.75), first);
  assert.throws(
    () =>
      scene(
        [{ id: "ring", type: "Annulus" }],
        [
          {
            type: "ComplexHomotopy",
            object: "s.ring",
            expression: "z",
            duration: 1,
          },
        ],
      ),
    /continuous/,
  );
});
