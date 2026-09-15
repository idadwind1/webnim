import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  compileScene,
  evaluateDocument,
  supportedObjects,
  supportedEvents,
} from "../dist/document/index.js";
const pip = (id = "mini") => ({
  type: "PictureInPicture",
  id,
  space: "detail",
  x: 20,
  y: 30,
  width: 220,
  height: 140,
});
const scene = (events = [], objects = [pip()]) => ({
  version: 1,
  spaces: [
    { name: "main", type: "plane2d", objects },
    {
      name: "detail",
      type: "axis1d",
      objects: [{ type: "Point", id: "p", at: ["t"] }],
    },
  ],
  events,
  duration: 6,
});
test("PiP objects use normal entrance, exit and reentrance events with deterministic seeking", () => {
  const c = compileScene(
    scene([
      { type: "FadeIn", object: "main.mini", start: 1, duration: 1 },
      { type: "FadeOut", object: "main.mini", start: 3, duration: 1 },
      { type: "Add", object: "main.mini", start: 5, duration: 0 },
    ]),
  );
  assert.ok(supportedObjects.includes("PictureInPicture"));
  assert.ok(!supportedEvents.includes("PictureInPicture"));
  for (const t of [0, 1, 4, 4.5])
    assert.equal(evaluateDocument(c, t).pictureInPictures.length, 0);
  for (const t of [1.5, 3.5])
    assert.equal(evaluateDocument(c, t).pictureInPictures[0].opacity, 0.5);
  assert.equal(evaluateDocument(c, 5).pictureInPictures[0].opacity, 1);
  const copy = compileScene(JSON.parse(JSON.stringify(c.document)));
  for (const t of [5, 1.5, 0, 3.5, 2, 4])
    assert.deepEqual(evaluateDocument(c, t), evaluateDocument(copy, t));
  assert.equal(
    evaluateDocument(c, 3).spaces[1].objects[0].geometry.points[0][0],
    3,
  );
});
test("PiP defaults visible and follows its owner space without recursive embedding", () => {
  const c = compileScene(
    scene(
      [
        {
          type: "SwitchSpace",
          space: "detail",
          start: 2,
          duration: 1,
          transition: "fade",
        },
      ],
      [pip(), pip("second")],
    ),
  );
  assert.equal(evaluateDocument(c, 0).pictureInPictures.length, 2);
  assert.equal(evaluateDocument(c, 2.5).pictureInPictures[0].opacity, 0.5);
  assert.equal(evaluateDocument(c, 3).pictureInPictures.length, 0);
  assert.equal(evaluateDocument(c, 0).pictureInPictures[0].id, "main.mini");
});
test("PiP validates dimensions, target spaces, unsupported transforms and old event syntax", () => {
  for (const patch of [
    { space: "missing" },
    { width: 0 },
    { height: -1 },
    { duration: 2 },
    { position: [0, 0] },
  ])
    assert.throws(
      () => compileScene(scene([], [{ ...pip(), ...patch }])),
      /\$/,
    );
  for (const type of ["Create", "Uncreate", "GrowFromCenter"])
    assert.throws(
      () => compileScene(scene([{ type, object: "main.mini", duration: 1 }])),
      /PictureInPicture supports/,
    );
  assert.throws(
    () => compileScene(scene([{ ...pip(), start: 0, duration: 1 }])),
    /\$/,
  );
});
test("four spaces includes simultaneous PiP objects with authored intro and outro", async () => {
  const c = compileScene(
    JSON.parse(
      await readFile(
        new URL("../fixtures/four-spaces.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  assert.equal(evaluateDocument(c, 3.5).pictureInPictures.length, 2);
  assert.equal(evaluateDocument(c, 4.75).pictureInPictures[0].opacity, 0.5);
  assert.equal(evaluateDocument(c, 5).pictureInPictures.length, 0);
  assert.equal(evaluateDocument(c, 12.5).pictureInPictures.length, 2);
  assert.equal(evaluateDocument(c, 14).pictureInPictures.length, 0);
});
