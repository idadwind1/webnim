import test from "node:test";
import assert from "node:assert/strict";
import {
  compileScene,
  evaluateDocument,
  evaluateCamera,
  supportedEvents,
} from "../dist/document/index.js";
const scene = (events, type = "plane2d") => ({
  version: 1,
  spaces: [{ name: "s", type, objects: [] }],
  events,
});
const zoom = {
  type: "CameraZoom",
  space: "s",
  factor: 100,
  start: 1,
  duration: 2,
};
const windowEvent = {
  type: "CameraWindow",
  space: "s",
  x: [2, 6],
  y: [-1, 1],
  start: 3,
  duration: 2,
};
function camera(c, t, w = 800, h = 400) {
  const f = evaluateDocument(c, t);
  return evaluateCamera(c.document.spaces[0], f.spaces[0].camera, w, h);
}
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("camera events resolve relative zoom, windows and arbitrary seeking", () => {
  const c = compileScene(scene([zoom, windowEvent]));
  close(camera(c, 0).scale, 60);
  close(camera(c, 2).scale, 600);
  close(camera(c, 3).scale, 6000);
  close(camera(c, 5).scale, 200);
  assert.deepEqual(camera(c, 5).center, [4, 0, 0]);
  close(camera(c, 5, 400, 400).scale, 100);
  const forward = Array.from({ length: 51 }, (_, i) => camera(c, i / 10));
  for (const i of [50, 0, 28, 10, 33, 49, 20])
    assert.deepEqual(camera(c, i / 10), forward[i]);
  const copy = compileScene(JSON.parse(JSON.stringify(c.document)));
  assert.deepEqual(evaluateDocument(c, 4), evaluateDocument(copy, 4));
  assert.ok(supportedEvents.includes("CameraZoom"));
});
test("event composition, legacy input migration and mixed-field rejection", () => {
  const c = compileScene(
    scene([
      {
        type: "Succession",
        events: [
          { ...zoom, start: 0 },
          { ...zoom, start: 0, factor: 0.01 },
        ],
      },
    ]),
  );
  close(camera(c, 4).scale, 60);
  const legacy = {
    version: 1,
    spaces: c.document.spaces,
    animations: [{ type: "AnimationGroup", animations: [zoom] }],
  };
  assert.equal(compileScene(legacy).document.events[0].type, "EventGroup");
  assert.ok(!("events" in legacy));
  assert.throws(
    () => compileScene({ ...legacy, events: [] }),
    /cannot combine/,
  );
});
test("camera validation and conflicts are path-specific", () => {
  assert.throws(
    () => compileScene(scene([{ ...zoom, factor: 1e308 }])),
    /finite zoom limits/,
  );
  for (const e of [
    { ...zoom, factor: 0 },
    { ...zoom, space: "missing" },
    { ...windowEvent, x: [1, 1] },
    { ...windowEvent, y: undefined },
  ]) {
    assert.throws(
      () =>
        compileScene(
          scene(
            e.y === undefined && e.type === "CameraWindow"
              ? [{ type: "CameraWindow", space: "s", x: [1, 2] }]
              : [e],
          ),
        ),
      /\$/,
    );
  }
  assert.throws(
    () => compileScene(scene([zoom, { ...windowEvent, start: 2 }])),
    /Overlapping property writers/,
  );
  assert.throws(
    () => compileScene(scene([windowEvent], "space3d")),
    /1D or 2D/,
  );
  assert.doesNotThrow(() => compileScene(scene([zoom], "space3d")));
  const c = compileScene(
    scene(
      [{ type: "CameraWindow", space: "s", x: [-2, 2], duration: 0 }],
      "axis1d",
    ),
  );
  close(camera(c, 0).scale, 200);
});
