import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
const documentWith = (caption) => ({
  version: 1,
  spaces: [
    {
      name: "plane",
      type: "plane2d",
      objects: [{ id: "point", type: "Point", at: [0, 0], caption }],
    },
  ],
});
test("object captions round-trip as literal text and appear in headless frames", () => {
  const text = "<b>Origin</b>\nThe point (0, 0).";
  const document = JSON.parse(JSON.stringify(documentWith(text)));
  const frame = evaluateDocument(compileScene(document), 0);
  assert.equal(frame.spaces[0].objects[0].caption, text);
  assert.equal(frame.spaces[0].objects[0].selected, false);
  assert.throws(() => compileScene(documentWith(42)), /caption/);
});
test("group captions provide a fallback and individual captions can override or suppress it", () => {
  const c = compileScene({
    version: 1,
    spaces: [
      {
        name: "s",
        type: "plane2d",
        objects: [
          { id: "a", type: "Point", at: [0, 0] },
          { id: "b", type: "Point", at: [1, 0], caption: "Individual" },
          { id: "c", type: "Point", at: [2, 0], caption: "" },
          {
            id: "g",
            type: "Group",
            children: ["s.a", "s.b", "s.c"],
            caption: "Group",
          },
        ],
      },
    ],
  });
  assert.deepEqual(
    evaluateDocument(c, 0).spaces[0].objects.map((o) => o.caption),
    ["Group", "Individual", "", "Group"],
  );
});
