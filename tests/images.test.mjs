import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
import { preloadImages } from "../dist/player/images.js";
const document = {
  version: 1,
  duration: 4,
  spaces: [
    {
      name: "s",
      type: "plane2d",
      objects: [
        {
          id: "image",
          type: "ImageSequence",
          sources: ["./a.png", "./b.png", "./c.png"],
          fps: 2,
          width: 4,
          height: 2,
          loop: true,
        },
      ],
    },
  ],
};
test("image frames select deterministically and transformed corners retain aspect ratio", () => {
  const c = compileScene(document),
    frame = (t) => evaluateDocument(c, t).spaces[0].objects[0];
  assert.equal(frame(0.6).geometry.source, "./b.png");
  assert.equal(frame(1.6).geometry.source, "./a.png");
  assert.equal(frame(0.6).geometry.source, "./b.png");
  assert.deepEqual(frame(0).geometry.points, [
    [-2, 1, 0],
    [2, 1, 0],
    [2, -1, 0],
    [-2, -1, 0],
  ]);
  for (const source of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,test",
  ])
    assert.throws(() =>
      compileScene({
        version: 1,
        spaces: [
          {
            name: "s",
            type: "plane2d",
            objects: [{ id: "i", type: "ImageMobject", source }],
          },
        ],
      }),
    );
});
test("image preload deduplicates sources and propagates failures before scene replacement", async () => {
  let count = 0;
  const create = () => ({
    naturalWidth: 20,
    naturalHeight: 10,
    set src(value) {
      if (value) {
        count++;
        queueMicrotask(() => this.onload?.());
      }
    },
  });
  await preloadImages(
    {
      ...document,
      spaces: [
        {
          ...document.spaces[0],
          objects: [
            ...document.spaces[0].objects,
            { id: "copy", type: "ImageMobject", source: "./a.png" },
          ],
        },
      ],
    },
    create,
  );
  assert.equal(count, 3);
  await assert.rejects(
    preloadImages(document, () => ({
      set src(value) {
        if (value) queueMicrotask(() => this.onerror?.());
      },
    })),
    /Unable to load/,
  );
});
