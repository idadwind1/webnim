import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
import { evaluateDragTarget } from "../dist/document/evaluator.js";
import { parameterFromDrag } from "../dist/player/drag.js";
import { sampleFunctionPlot } from "../dist/player/function-plot.js";

const scene = () => ({
  version: 1, parameters: { a: 1 }, duration: 4,
  spaces: [
    { name: "main", type: "plane2d", objects: [
      { id: "link", type: "Line", from: [0, 0], to: ["detail.handle.x", "detail.handle.y"] },
      { id: "copy", type: "Point", at: ["detail.handle.x", "detail.handle.y"] },
      { id: "graph", type: "FunctionGraph", expression: "detail.handle.x * x" },
      { id: "inset", type: "PictureInPicture", space: "detail", x: 20, y: 20, width: 200, height: 150 },
    ] },
    { name: "detail", type: "plane2d", objects: [
      { id: "handle", type: "Point", at: ["a", "a^2"], drag: { parameter: "a", min: -4, max: 4 } },
    ] },
  ],
});
const object = (frame, id) => frame.spaces.flatMap(s => s.objects).find(o => o.id === id);

test("main geometry follows a PiP drag and updates viewport graph sampling", () => {
  const c = compileScene(scene());
  const project = p => [100 + p[0] * 20, 150 - p[1] * 20, 0];
  const drag = parameterFromDrag(c, 0, {}, "detail.handle", project([2, 4, 0]).slice(0, 2), project);
  assert.ok(Math.abs(drag.value - 2) < 1e-4);
  const frame = evaluateDocument(c, 0, { [drag.parameter]: drag.value });
  const source = object(frame, "detail.handle").geometry.points[0];
  assert.deepEqual(object(frame, "main.link").geometry.points[1], source);
  assert.deepEqual(object(frame, "main.copy").geometry.points[0], source);
  assert.equal(frame.pictureInPictures.length, 1);
  const samples = sampleFunctionPlot(object(frame, "main.graph"), [],
    { minX: -2, maxX: 2, minY: -5, maxY: 5 }, project, 400);
  for (const p of samples) assert.ok(Math.abs(p[1] - drag.value * p[0]) < 1e-8);
  assert.deepEqual(object(evaluateDocument(c, 0), "main.copy").geometry.points[0], [1, 1, 0]);
});

test("references follow source group, object and space transforms across seeks", () => {
  const doc = scene();
  doc.spaces[1].objects.push({ id: "group", type: "Group", children: ["detail.handle"], position: [1, 0] });
  doc.events = [
    { type: "Shift", object: "detail.handle", by: [0, 2], start: 0, duration: 2 },
    { type: "ApplySpaceMatrix", space: "detail", matrix: [[2, 0], [0, 3]], start: 0, duration: 2 },
  ];
  const c = compileScene(doc);
  for (const time of [2, 0, 1, 4]) {
    const frame = evaluateDocument(c, time);
    assert.deepEqual(object(frame, "main.copy").geometry.points,
      object(frame, "detail.handle").geometry.points);
    assert.deepEqual(evaluateDragTarget(c, time, {}, "main.copy").object,
      object(frame, "main.copy"));
  }
});

test("PointOnCurve and mixed-dimension references expose Cartesian x/y/z", () => {
  const doc = scene();
  doc.spaces[1] = { name: "detail", type: "polar2d", objects: [
    { id: "path", type: "ParametricCurve", expressions: [2, "u"], domain: [0, Math.PI] },
    { id: "handle", type: "PointOnCurve", curve: "detail.path", parameter: "a", drag: { parameter: "a", min: 0, max: 1 } },
  ] };
  const c = compileScene(doc), frame = evaluateDocument(c, 0, { a: 0.5 });
  assert.deepEqual(object(frame, "main.copy").geometry.points, object(frame, "detail.handle").geometry.points);
  assert.ok(Math.abs(object(frame, "main.copy").geometry.points[0][1] - 2) < 1e-8);
  doc.spaces[1] = { name: "detail", type: "axis1d", objects: [
    { id: "handle", type: "Point", at: ["a"], drag: { parameter: "a" } },
  ] };
  assert.deepEqual(object(evaluateDocument(compileScene(doc), 0), "main.copy").geometry.points[0], [1, 0, 0]);
});

test("invalid references and circular point dependencies fail at compilation", () => {
  for (const ref of ["detail.missing.x", "main.graph.x", "detail.handle.w", "detail.handle.constructor"]) {
    const doc = scene(); doc.spaces[0].objects[1].at[0] = ref;
    assert.throws(() => compileScene(doc), /Unknown variable/);
  }
  const doc = scene();
  doc.spaces[1].objects[0].at[1] = "main.copy.y";
  assert.throws(() => compileScene(doc), /Dependency cycle/);
});

test("connections work without PiP, across hidden spaces and chained references", () => {
  const doc = scene();
  doc.spaces[0].objects = doc.spaces[0].objects.filter(o => o.type !== "PictureInPicture");
  doc.spaces.unshift({ name: "third", type: "space3d", objects: [
    { id: "copy", type: "Point", at: ["main.copy.x", "main.copy.y", "detail.handle.z + 3"] },
  ] });
  const c = compileScene(doc);
  for (const a of [-2, 0, 3]) {
    const frame = evaluateDocument(c, 0, { a });
    assert.equal(frame.activeSpace, "third");
    assert.equal(frame.pictureInPictures.length, 0);
    assert.deepEqual(object(frame, "third.copy").geometry.points[0], [a, a * a, 3]);
  }
});
