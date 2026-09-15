import test from "node:test";
import assert from "node:assert/strict";
import {
  compileScene,
  evaluateDocument,
  evaluateCamera,
  easingNames,
  easeProgress,
} from "../dist/document/index.js";
const scene = (objects, events = [], extra = {}) =>
  compileScene({
    version: 1,
    spaces: [{ name: "s", type: "plane2d", objects }],
    events,
    ...extra,
  });
const frames = (c, t = 0) => evaluateDocument(c, t).spaces[0].objects;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
test("all easing curves are finite, bounded, monotonic and have exact endpoints", () => {
  assert.equal(easingNames.length, 23);
  for (const name of easingNames) {
    near(easeProgress(0, name), 0);
    near(easeProgress(1, name), 1);
    let last = 0;
    for (let i = 0; i <= 1000; i++) {
      const v = easeProgress(i / 1000, name);
      assert.ok(Number.isFinite(v) && v >= last - 1e-12 && v <= 1, name);
      last = v;
    }
  }
  near(easeProgress(0.5, "cubic-in"), 0.125);
  near(easeProgress(0.5, "sine-in-out"), 0.5);
});
test("text reveals preserve emoji and combining graphemes, finish exactly, and seek deterministically", () => {
  const text = "A👩‍🔬éZ";
  const c = scene(
    [{ id: "t", type: "Text", text }],
    [
      { type: "AddTextLetterByLetter", object: "s.t", start: 1, duration: 4 },
      {
        type: "RemoveTextLetterByLetter",
        object: "s.t",
        start: 6,
        duration: 4,
      },
    ],
  );
  assert.equal(frames(c, 0)[0].visible, false);
  assert.equal(frames(c, 3)[0].geometry.text, "A👩‍🔬");
  assert.equal(frames(c, 5)[0].geometry.text, text);
  assert.equal(frames(c, 8)[0].geometry.text, "A👩‍🔬");
  assert.equal(frames(c, 10)[0].visible, false);
  const first = frames(c, 3);
  frames(c, 10);
  assert.deepEqual(frames(c, 3), first);
  const words = scene(
    [{ id: "t", type: "Text", text: "one two three" }],
    [{ type: "AddTextWordByWord", object: "s.t", duration: 3 }],
  );
  assert.equal(frames(words, 1)[0].geometry.text, "one ");
});
test("wave and blink restore geometry and opacity; subset order includes nested groups", () => {
  const c = scene(
    [
      {
        id: "l",
        type: "Line",
        from: [-2, 0],
        to: [2, 0],
        style: { opacity: 0.6 },
      },
    ],
    [
      { type: "ApplyWave", object: "s.l", duration: 2 },
      { type: "Blink", object: "s.l", duration: 2 },
    ],
  );
  assert.ok(frames(c, 1)[0].geometry.points.some((p) => Math.abs(p[1]) > 0.2));
  near(frames(c, 1)[0].opacity, 0);
  assert.deepEqual(frames(c, 2)[0].geometry.points, [
    [-2, 0, 0],
    [2, 0, 0],
  ]);
  near(frames(c, 2)[0].opacity, 0.6);
  for (const type of ["ShowIncreasingSubsets", "ShowSubmobjectsOneByOne"]) {
    const s = scene(
      [
        { id: "a", type: "Circle" },
        { id: "b", type: "Circle" },
        { id: "nested", type: "Group", children: ["s.b"] },
        { id: "g", type: "Group", children: ["s.a", "s.nested"] },
      ],
      [{ type, object: "s.g", start: 1, duration: 2 }],
    );
    assert.equal(frames(s, 0)[0].visible, false);
    assert.equal(frames(s, 2)[0].visible, true);
    assert.equal(frames(s, 2)[1].visible, false);
    assert.equal(frames(s, 3)[1].visible, true);
    assert.equal(frames(s, 3)[0].visible, type === "ShowIncreasingSubsets");
  }
});
test("matrices expand with stable child IDs and dynamic numeric entries", () => {
  const input = {
    version: 1,
    parameters: { a: 1 },
    spaces: [
      {
        name: "s",
        type: "plane2d",
        objects: [
          {
            id: "m",
            type: "DecimalMatrix",
            entries: [
              ["a", 2],
              [3, 4],
            ],
            position: [2, 1],
            cellWidth: 2,
            cellHeight: 1,
          },
        ],
      },
    ],
    events: [{ type: "AnimateParameter", parameter: "a", to: 5, duration: 2 }],
  };
  const snapshot = structuredClone(input),
    c = compileScene(input);
  assert.deepEqual(input, snapshot);
  const cell = frames(c, 2).find((o) => o.id === "s.m_cell_0_0");
  assert.equal(cell.geometry.text, "5.00");
  assert.deepEqual(cell.geometry.points, [[1, 1.5, 0]]);
  assert.equal(frames(c, 0).filter((o) => o.type === "Polyline").length, 2);
  assert.throws(
    () => scene([{ id: "m", type: "Matrix", entries: [["a"], ["b", "c"]] }]),
    /equal lengths/,
  );
  assert.throws(
    () =>
      scene([
        { id: "m", type: "Matrix", entries: [[1]] },
        { id: "m_cell_0_0", type: "Point", at: [0, 0] },
      ]),
    /already exists/,
  );
});
test("charts preserve negative values, probabilities, graph endpoints and qualified point references", () => {
  const c = scene([
    { id: "b", type: "BarChart", values: [2, -3, 0] },
    { id: "p", type: "SampleSpace", probabilities: [0.25, 0.75], width: 4 },
    {
      id: "g",
      type: "DiGraph",
      vertices: ["a", "b"],
      edges: [["a", "b"]],
      positions: { a: [0, 0], b: [2, 1] },
    },
    { id: "linked", type: "Point", at: ["s.g_vertex_b.x", "s.g_vertex_b.y"] },
  ]);
  const f = frames(c);
  const negative = f.find((o) => o.id === "s.b_bar_1");
  near(Math.min(...negative.geometry.points.map((p) => p[1])), -3);
  near(Math.max(...negative.geometry.points.map((p) => p[1])), 0);
  assert.deepEqual(f.find((o) => o.id === "s.g_edge_0").geometry.points, [
    [0, 0, 0],
    [2, 1, 0],
  ]);
  assert.deepEqual(f.find((o) => o.id === "s.linked").geometry.points, [
    [2, 1, 0],
  ]);
  assert.throws(
    () => scene([{ id: "p", type: "SampleSpace", probabilities: [0.2, 0.4] }]),
    /sum to one/,
  );
  assert.throws(
    () =>
      scene([{ id: "g", type: "Graph", vertices: ["a"], edges: [["a", "z"]] }]),
    /known vertices/,
  );
});
test("3D camera choreography composes moves, orbits and zoom with repeatable seeks", () => {
  const c = compileScene({
    version: 1,
    spaces: [
      {
        name: "s",
        type: "space3d",
        camera: { position: [4, 0, 2] },
        objects: [],
      },
    ],
    events: [
      { type: "CameraOrbit", space: "s", angle: Math.PI / 2, duration: 2 },
      {
        type: "CameraMove",
        space: "s",
        position: [0, 6, 4],
        center: [0, 0, 1],
        start: 2,
        duration: 2,
      },
    ],
  });
  const camera = (t) =>
    evaluateCamera(
      c.document.spaces[0],
      evaluateDocument(c, t).spaces[0].camera,
      800,
      600,
    );
  near(camera(2).position[0], 0);
  near(camera(2).position[1], 4);
  assert.deepEqual(camera(4).position, [0, 6, 4]);
  near(camera(3).center[2], 0.5);
  const first = camera(1);
  camera(4);
  assert.deepEqual(camera(1), first);
  assert.throws(
    () => scene([], [{ type: "CameraOrbit", space: "s", angle: 1 }]),
    /space3d/,
  );
});

test("declarative mappings and RK4 flow give known solutions without executable callbacks", () => {
  for (const [type, args, expected] of [
    ["Homotopy", { expressions: ["x+2*alpha", "y-alpha"] }, [2, -0.5, 0]],
    ["ApplyPointwiseFunction", { expressions: ["3*x", "y+2"] }, [2, 1, 0]],
    [
      "PhaseFlow",
      { expressions: ["-y", "x"], virtualTime: Math.PI, steps: 64 },
      [0, 1, 0],
    ],
  ]) {
    const c = scene(
      [{ id: "p", type: "Point", at: [1, 0] }],
      [{ type, object: "s.p", duration: 2, ...args }],
    );
    const g = frames(c, 1)[0].geometry.points[0];
    for (let i = 0; i < 3; i++) near(g[i], expected[i]);
    const first = frames(c, 1);
    frames(c, 2);
    assert.deepEqual(frames(c, 1), first);
  }
  assert.throws(() =>
    scene(
      [{ id: "p", type: "Point", at: [1, 0] }],
      [
        {
          type: "Homotopy",
          object: "s.p",
          expressions: ["globalThis.x", "y"],
          duration: 1,
        },
      ],
    ),
  );
  const bad = scene(
    [{ id: "p", type: "Point", at: [1, 0] }],
    [
      {
        type: "Homotopy",
        object: "s.p",
        expressions: ["sqrt(1-2*alpha)", "y"],
        duration: 1,
      },
    ],
  );
  assert.equal(evaluateDocument(bad, 1).diagnostics.length, 1);
});
test("Restore uses an explicit deterministic snapshot and bounds helpers follow animated targets", () => {
  const c = scene(
    [
      { id: "p", type: "Square", size: 2 },
      { id: "box", type: "SurroundingRectangle", target: "s.p", padding: 0.5 },
      { id: "brace", type: "Brace", target: "s.p" },
    ],
    [
      { type: "Shift", object: "s.p", by: [4, 2], duration: 1 },
      { type: "Restore", object: "s.p", at: 0, start: 2, duration: 2 },
    ],
  );
  const find = (t, id) => frames(c, t).find((o) => o.id === `s.${id}`);
  near(Math.min(...find(1, "box").geometry.points.map((p) => p[0])), 2.5);
  near(Math.min(...find(3, "box").geometry.points.map((p) => p[0])), 0.5);
  assert.deepEqual(find(4, "p").geometry.points, find(0, "p").geometry.points);
  assert.throws(
    () =>
      scene(
        [{ id: "p", type: "Point", at: [0, 0] }],
        [{ type: "Restore", object: "s.p", at: 2, start: 1, duration: 1 }],
      ),
    /snapshot/,
  );
  assert.throws(
    () =>
      scene([
        { id: "a", type: "Brace", target: "s.b" },
        { id: "b", type: "Brace", target: "s.a" },
      ]),
    /cycle/,
  );
});

test("Swap exchanges centers, FadeTransform transfers visibility, and target-list expansion staggers events", () => {
  const objects = [
    { id: "a", type: "Point", at: [-2, 0] },
    { id: "b", type: "Point", at: [2, 1] },
  ];
  const swapped = scene(objects, [
    { type: "Swap", object: "s.a", to: "s.b", duration: 2 },
  ]);
  assert.deepEqual(
    frames(swapped, 2).map((o) => o.geometry.points[0]),
    [
      [2, 1, 0],
      [-2, 0, 0],
    ],
  );
  const faded = scene(objects, [
    { type: "FadeTransform", object: "s.a", to: "s.b", start: 1, duration: 2 },
  ]);
  assert.equal(frames(faded, 0)[1].visible, false);
  near(frames(faded, 2)[0].opacity, 0.5);
  near(frames(faded, 2)[1].opacity, 0.5);
  assert.equal(frames(faded, 3)[0].visible, false);
  assert.equal(frames(faded, 3)[1].visible, true);
  const mapped = scene(objects, [
    {
      type: "LaggedStartMap",
      objects: ["s.a", "s.b"],
      animation: { type: "Shift", by: [0, 2], duration: 2 },
      lagRatio: 0.5,
    },
  ]);
  assert.deepEqual(
    mapped.tracks.map((t) => t.start),
    [0, 1],
  );
  near(frames(mapped, 1)[0].geometry.points[0][1], 1);
  near(frames(mapped, 1)[1].geometry.points[0][1], 1);
  assert.throws(
    () =>
      scene(objects, [
        { type: "Swap", object: "s.a", to: "s.b", duration: 2 },
        { type: "Shift", object: "s.b", by: [1, 0], duration: 1 },
      ]),
    /Overlapping/,
  );
});

test("camera movement rejects a trajectory crossing its look-at center", () => {
  assert.throws(
    () =>
      compileScene({
        version: 1,
        spaces: [
          {
            name: "s",
            type: "space3d",
            camera: { position: [4, 0, 0] },
            objects: [],
          },
        ],
        events: [
          { type: "CameraMove", space: "s", position: [-4, 0, 0], duration: 2 },
        ],
      }),
    /crosses/,
  );
});

test("expanded layout documents remain valid serializable scene documents", () => {
  const c = scene(
    [
      { id: "t", type: "Matrix", entries: [["a", "b"]] },
      { id: "g", type: "Graph", vertices: ["x", "y"], edges: [["x", "y"]] },
    ],
    [
      {
        type: "LaggedStartMap",
        objects: ["s.g_vertex_x", "s.g_vertex_y"],
        animation: { type: "Shift", by: [0, 1] },
      },
    ],
  );
  const copy = compileScene(c.document);
  assert.deepEqual(evaluateDocument(c, 1), evaluateDocument(copy, 1));
});
