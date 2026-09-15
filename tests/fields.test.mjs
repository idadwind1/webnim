import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
import { strokePaths, arrowTips } from "../dist/player/adapter.js";
import { readFile } from "node:fs/promises";
const scene = (objects, extra = {}) => ({ version: 1, duration: 4, spaces: [{ name: "s", type: "plane2d", objects }], ...extra });
const frame = (c, t = 0, overrides = {}) => evaluateDocument(c, t, overrides).spaces[0].objects;

test("implicit circles approximate the zero set without false connecting strokes", () => {
  const c = compileScene(scene([{ id: "circle", type: "ImplicitFunction", expression: "x*x+y*y-a*a", xRange: [-2, 2], yRange: [-2, 2], resolution: 80 }], { parameters: { a: 1 } }));
  for (const a of [1, 1.5]) {
    const o = frame(c, 0, { a })[0], paths = strokePaths(o);
    assert.ok(paths.length > 100);
    for (const path of paths) {
      assert.equal(path.length, 2);
      for (const p of path) assert.ok(Math.abs(Math.hypot(p[0], p[1]) - a) < 0.002);
      assert.ok(Math.hypot(...path[1].map((x, i) => x - path[0][i])) < 0.08);
    }
  }
});

test("vector fields expose bounded independent arrows with live parameter evaluation", () => {
  const c = compileScene(scene([{ id: "field", type: "ArrowVectorField", expressions: ["-a*y", "a*x"], xRange: [-1, 1], yRange: [-1, 1], maxLength: 0.7 }], { parameters: { a: 1 } }));
  const o = frame(c)[0], paths = strokePaths(o);
  assert.equal(paths.length, 8); assert.equal(arrowTips(o).length, 8);
  for (const [p, q] of paths) {
    const dx = q[0] - p[0], dy = q[1] - p[1];
    assert.ok(Math.abs(p[0] * dx + p[1] * dy) < 1e-8);
    assert.ok(Math.hypot(dx, dy) <= 0.70000001);
  }
  assert.equal(strokePaths(frame(c, 0, { a: 0 })[0]).length, 0);
});

test("RK4 streamlines preserve circular trajectories and keep seeds disconnected", () => {
  const c = compileScene(scene([{ id: "flow", type: "StreamLines", expressions: ["-y", "x"], seeds: [[1, 0], [2, 0]], step: 0.025, steps: 252 }]));
  const paths = strokePaths(frame(c)[0]);
  assert.equal(paths.length, 2);
  for (const [i, path] of paths.entries()) {
    assert.equal(path.length, 253);
    for (const p of path) assert.ok(Math.abs(Math.hypot(...p) - (i + 1)) < 1e-7);
  }
});

test("traces sample historical transformed points and are independent of seek order", () => {
  const c = compileScene(scene([
    { id: "trace", type: "TracedPath", point: "s.p", start: 0.5, duration: 1, samples: 32 },
    { id: "p", type: "Point", at: ["t", "a*t*t"] },
  ], { parameters: { a: 1 }, events: [{ type: "Shift", object: "s.p", by: [2, 0], duration: 4 }] }));
  assert.deepEqual(frame(c, 0)[0].geometry.points, []);
  for (const time of [3, 1, 2, 4, 1]) {
    const points = frame(c, time)[0].geometry.points;
    assert.equal(points.length, 33);
    const start = Math.max(0.5, time - 1);
    assert.deepEqual(points[0], [1.5 * start, start * start, 0]);
    assert.deepEqual(points.at(-1), frame(c, time)[1].geometry.points[0]);
    const copy = frame(c, time); frame(c, 4); assert.deepEqual(frame(c, time), copy);
  }
  const points = frame(c, 2, { a: 2 })[0].geometry.points;
  assert.deepEqual(points.at(-1), [3, 8, 0]);
});

test("sampling budgets, disconnected path dependencies and trace cycles are validated", () => {
  assert.throws(() => compileScene(scene([{ id: "f", type: "ArrowVectorField", expressions: ["x", "y"], xRange: [-10, 10], yRange: [-10, 10], spacing: 0.001 }])), /4096/);
  assert.throws(() => compileScene(scene([
    { id: "trace", type: "TracedPath", point: "s.p" },
    { id: "p", type: "PointOnCurve", curve: "s.trace", parameter: 0.5 },
  ])), /Dependency cycle/);
  assert.throws(() => compileScene(scene([
    { id: "f", type: "ImplicitFunction", expression: "x*y", xRange: [-1, 1], yRange: [-1, 1] },
    { id: "p", type: "PointOnCurve", curve: "s.f", parameter: 0.5 },
  ])), /vector path/);
});

test("Manim additions showcase compiles and remains finite across chapters and dragging", async () => {
  const doc = JSON.parse(await readFile(new URL("../fixtures/manim-additions.json", import.meta.url), "utf8"));
  const c = compileScene(doc);
  for (const time of [0, 6.25, 7, 12.25, 16, 20, 20.25, 21, 28, 0]) {
    for (const height of [-2, 0, 2]) assert.deepEqual(evaluateDocument(c, time, { height }).diagnostics, []);
  }
  const spatial = evaluateDocument(c, 21);
  assert.equal(spatial.activeSpace, "field3d");
  const field = spatial.spaces.find(s => s.name === "field3d").objects[0];
  const arrows = strokePaths(field);
  assert.equal(arrows.length, 125);
  assert.deepEqual([...new Set(arrows.map(path => path[0][2]))].sort((a,b) => a-b), [-2, -1, 0, 1, 2]);
  for (const [p, q] of arrows) {
    const expected = [-p[1], p[0], 0.6 + 0.2 * p[2]];
    const scale = Math.min(0.5, 0.7 / Math.hypot(...expected));
    expected.forEach((v, i) => assert.ok(Math.abs(q[i] - p[i] - scale * v) < 1e-8));
  }
});

test("3D field sampling validates the z range and full volume budget", () => {
  const field = {id:"f",type:"ArrowVectorField",expressions:[1,0,0],xRange:[-2,2],yRange:[-2,2],zRange:[-2,2]};
  const doc = {version:1,spaces:[{name:"s",type:"space3d",objects:[field]}]};
  const invalid = structuredClone(doc); invalid.spaces[0].objects[0].zRange = [2,-2];
  assert.throws(() => compileScene(invalid), /Range must be increasing/);
  const dense = structuredClone(doc); dense.spaces[0].objects[0].spacing = 0.2;
  assert.throws(() => compileScene(dense), /4096/);
  assert.throws(() => compileScene(scene([{...field,expressions:[1,0]}])), /zRange requires space3d/);
});
