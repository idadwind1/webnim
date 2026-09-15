import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  compileScene,
  evaluateDocument,
  nativeToCartesian,
  projectPoint,
  SceneValidationError,
  supportedObjects,
} from "../dist/document/index.js";
import { parameterFromDrag } from "../dist/player/drag.js";
const close = (a, b, epsilon = 1e-7) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);
const scene = (objects, events = [], extra = {}) => ({
  version: 1,
  spaces: [{ name: "s", type: "plane2d", objects }],
  events,
  ...extra,
});
const point = { id: "p", type: "Point", at: [0, 0] };
const line = { id: "l", type: "Line", from: [0, 0], to: [1, 0] };
const object = (c, t, id = "s.p", overrides) =>
  evaluateDocument(c, t, overrides)
    .spaces.flatMap((s) => s.objects)
    .find((o) => o.id === id);
const reject = (doc, pattern) =>
  assert.throws(() => compileScene(doc), pattern ?? SceneValidationError);
test("all four spaces round trip, hidden progress and global fades", async () => {
  const doc = JSON.parse(
    await readFile(
      new URL("../fixtures/four-spaces.json", import.meta.url),
      "utf8",
    ),
  );
  const c = compileScene(doc),
    copy = compileScene(JSON.parse(JSON.stringify(doc)));
  assert.equal(evaluateDocument(c, 0).activeSpace, "line");
  for (const t of [0, 1, 2.25, 4, 5.25, 7.5, 10, 11.5, 2.25])
    assert.deepEqual(evaluateDocument(c, t), evaluateDocument(copy, t));
  close(object(c, 2.25, "plane.curve").reveal, 0.625);
  const fade = evaluateDocument(c, 7.5);
  assert.equal(fade.activeSpace, "solid");
  assert.deepEqual(fade.layers, [
    { space: "polar", opacity: 0.5 },
    { space: "solid", opacity: 0.5 },
  ]);
  assert.equal(
    fade.spaces.flatMap((s) => s.objects).some((o) => o.selected),
    false,
  );
});
test("native coordinates and projection", () => {
  assert.deepEqual(nativeToCartesian([3], "axis1d"), [3, 0, 0]);
  assert.deepEqual(nativeToCartesian([1, 2, 3], "space3d"), [1, 2, 3]);
  const p = nativeToCartesian([2, Math.PI / 2 + 8 * Math.PI], "polar2d");
  close(p[0], 0);
  close(p[1], 2);
  const q = projectPoint(
    [0, 0, 0],
    { position: [0, -10, 0], center: [0, 0, 0] },
    800,
    600,
  );
  close(q[0], 400);
  close(q[1], 300);
  assert.ok(
    projectPoint(
      [1, 0, 0],
      { position: [0, -10, 0], center: [0, 0, 0] },
      800,
      600,
    )[0] > 400,
  );
});
test("entrance, exit, reentrance and omitted transform starts", () => {
  const c = compileScene(
    scene(
      [point],
      [
        { type: "FadeIn", object: "s.p", start: 1, duration: 1 },
        { type: "Shift", object: "s.p", by: [2, 0], start: 1, duration: 1 },
        { type: "Shift", object: "s.p", by: [3, 0], start: 2, duration: 1 },
        { type: "FadeOut", object: "s.p", start: 3, duration: 1 },
        { type: "FadeIn", object: "s.p", start: 5, duration: 1 },
      ],
    ),
  );
  assert.equal(object(c, 0).visible, false);
  close(object(c, 1.5).opacity, 0.5);
  close(object(c, 2.5).geometry.points[0][0], 3.5);
  assert.equal(object(c, 4.5).visible, false);
  assert.equal(object(c, 5.5).visible, true);
  close(object(c, 5.5).opacity, 0.5);
  const forward = new Map(
    Array.from({ length: 61 }, (_, i) => [i / 10, object(c, i / 10)]),
  );
  for (const t of [4.5, 0.5, 2.5, 5.5, 1.5, 3])
    assert.deepEqual(object(c, t), forward.get(t));
});
test("repeated path morph retains earlier states; replacement transfers visibility", () => {
  const c = compileScene(
    scene(
      [
        line,
        { id: "b", type: "Line", from: [0, 0], to: [0, 2] },
        { id: "c", type: "Line", from: [0, 0], to: [-3, 0] },
      ],
      [
        { type: "Transform", object: "s.l", to: "s.b", start: 0, duration: 1 },
        { type: "Transform", object: "s.l", to: "s.c", start: 1, duration: 1 },
        {
          type: "ReplacementTransform",
          object: "s.l",
          to: "s.b",
          start: 3,
          duration: 1,
        },
      ],
    ),
  );
  close(object(c, 0.5, "s.l").geometry.points.at(-1)[0], 0.5);
  close(object(c, 0.5, "s.l").geometry.points.at(-1)[1], 1);
  close(object(c, 1.5, "s.l").geometry.points.at(-1)[0], -1.5);
  close(object(c, 1.5, "s.l").geometry.points.at(-1)[1], 1);
  assert.equal(object(c, 2, "s.b").visible, false);
  assert.equal(object(c, 4, "s.b").visible, true);
  assert.equal(object(c, 4, "s.l").visible, false);
  close(object(c, 0.5, "s.l").geometry.points.at(-1)[0], 0.5);
});
test("live parameter propagation, tangent, constrained dragging and override persistence", () => {
  const c = compileScene(
    scene(
      [
        { id: "f", type: "FunctionGraph", expression: "a*x", domain: [-2, 2] },
        {
          id: "p",
          type: "PointOnCurve",
          curve: "s.f",
          parameter: "q",
          drag: { parameter: "q", min: 0, max: 1 },
        },
        { id: "tan", type: "Tangent", curve: "s.f", parameter: "q", length: 2 },
      ],
      [
        {
          type: "AnimateParameter",
          parameter: "a",
          to: 3,
          start: 0,
          duration: 2,
        },
      ],
      { parameters: { a: 1, q: 0.75 } },
    ),
  );
  const p = object(c, 1).geometry.points[0];
  close(p[0], 1);
  close(p[1], 2);
  const tan = object(c, 1, "s.tan").geometry.points;
  close((tan[1][1] - tan[0][1]) / (tan[1][0] - tan[0][0]), 2);
  close(object(c, 1, "s.p", { a: 4 }).geometry.points[0][1], 4);
  assert.equal(evaluateDocument(c, 2, { a: 4 }).parameters.a, 4);
  assert.equal(evaluateDocument(c, 2).parameters.a, 3);
  const drag = parameterFromDrag(c, 1, {}, "s.p", [0, 0], (p) => p);
  close(drag.value, 0.5, 1e-5);
});
test("nested composition compiles absolute tracks", () => {
  const c = compileScene(
    scene(
      [point],
      [
        {
          type: "Succession",
          start: 2,
          events: [
            { type: "Shift", object: "s.p", by: [2, 0], duration: 2 },
            {
              type: "EventGroup",
              duration: 4,
              events: [
                { type: "Shift", object: "s.p", by: [4, 0], duration: 2 },
                {
                  type: "FadeToColor",
                  object: "s.p",
                  color: "#ff0000",
                  duration: 1,
                },
              ],
            },
          ],
        },
      ],
    ),
  );
  assert.equal(c.duration, 8);
  assert.deepEqual(
    c.tracks.map((t) => [t.start, t.duration]),
    [
      [2, 2],
      [4, 4],
      [4, 2],
    ],
  );
  close(object(c, 6).geometry.points[0][0], 4);
});
test("strict diagnostics: dimensions, fields, unsafe expressions, cycles, combinations and conflicts", () => {
  reject(scene([{ ...point, at: [1, 2, 3] }]), /coordinates/);
  reject(scene([{ ...point, unknown: true }]), /unknown/);
  reject(scene([{ id: "x", type: "SVG" }]));
  reject(
    scene([
      {
        id: "f",
        type: "FunctionGraph",
        expression: "globalThis.alert(1)",
        domain: [-1, 1],
      },
    ]),
    /mathematical/,
  );
  reject(
    scene([
      { id: "a", type: "Tangent", curve: "s.b", parameter: 0.5 },
      { id: "b", type: "Tangent", curve: "s.a", parameter: 0.5 },
    ]),
    /cycle/,
  );
  reject(
    scene(
      [{ id: "m", type: "MathTex", text: "x" }],
      [{ type: "Create", object: "s.m" }],
    ),
    /glyph/,
  );
  reject(
    scene(
      [point],
      [
        { type: "Shift", object: "s.p", by: [1, 0], duration: 2 },
        { type: "MoveTo", object: "s.p", to: [1, 1], start: 1, duration: 2 },
      ],
    ),
    /Overlapping/,
  );
  reject(
    scene(
      [point, { id: "g", type: "Group", children: ["s.p"] }],
      [
        { type: "Rotate", object: "s.g", angle: 1, duration: 2 },
        { type: "Shift", object: "s.p", by: [1, 0], duration: 2 },
      ],
    ),
    /Overlapping/,
  );
  reject(
    scene([
      { id: "f", type: "FunctionGraph", expression: "1 / x", domain: [-1, 1] },
    ]),
    /Non-finite/,
  );
  reject(
    scene(
      [point],
      [
        { type: "SwitchSpace", space: "s", duration: 2 },
        { type: "SwitchSpace", space: "s", start: 1, duration: 2 },
      ],
    ),
    /Overlapping/,
  );
});
test("plane matrix and complex effects transform geometry deterministically", async () => {
  const c = compileScene(
    scene(
      [{ ...point, at: [1, 1] }],
      [
        {
          type: "ApplySpaceMatrix",
          space: "s",
          matrix: [
            [2, 0],
            [0, 1],
          ],
          start: 0,
          duration: 1,
        },
        {
          type: "ApplyComplexFunction",
          space: "s",
          expression: "z^2",
          start: 1,
          duration: 1,
        },
      ],
    ),
  );
  assert.deepEqual(object(c, 0).geometry.points[0], [1, 1, 0]);
  assert.deepEqual(object(c, 1).geometry.points[0], [2, 1, 0]);
  const p = object(c, 2).geometry.points[0];
  close(p[0], 3);
  close(p[1], 4);
  assert.deepEqual(object(c, 0).geometry.points[0], [1, 1, 0]);
  compileScene(
    JSON.parse(
      await readFile(
        new URL("../fixtures/plane-transformations.json", import.meta.url),
        "utf8",
      ),
    ),
  );
  reject(
    scene(
      [point],
      [
        {
          type: "ApplyComplexFunction",
          space: "s",
          expression: "z.constructor",
        },
      ],
    ),
  );
});
test("non-finite samples after event are reported without contaminating frame", () => {
  const c = compileScene(
    scene(
      [
        {
          id: "f",
          type: "FunctionGraph",
          expression: "sqrt(a)",
          domain: [0, 1],
        },
      ],
      [{ type: "AnimateParameter", parameter: "a", to: -1, duration: 1 }],
      { parameters: { a: 1 } },
    ),
  );
  const frame = evaluateDocument(c, 1);
  assert.equal(frame.diagnostics.length, 1);
  assert.equal(frame.spaces[0].objects[0].visible, false);
  assert.deepEqual(frame.spaces[0].objects[0].geometry.points, []);
});
test("MoveTo means center, Add restores exited objects, and growth stays centered", () => {
  const c = compileScene(
    scene(
      [{ ...point, at: [2, 0] }],
      [
        { type: "MoveTo", object: "s.p", to: [4, 0], duration: 1 },
        { type: "FadeOut", object: "s.p", start: 1, duration: 1 },
        { type: "Add", object: "s.p", start: 2 },
      ],
    ),
  );
  close(object(c, 1).geometry.points[0][0], 4);
  assert.equal(object(c, 2).opacity, 1);
  const grow = compileScene(
    scene(
      [{ id: "l", type: "Line", from: [2, 0], to: [4, 0] }],
      [{ type: "GrowFromCenter", object: "s.l", duration: 1 }],
    ),
  );
  const p = object(grow, 0.5, "s.l").geometry.points;
  close(p[0][0], 2.5);
  close(p[1][0], 3.5);
});
test("dependencies inside a transformed group inherit parent exactly once", () => {
  const c = compileScene(
    scene(
      [
        { id: "f", type: "Line", from: [0, 0], to: [2, 0] },
        { id: "p", type: "PointOnCurve", curve: "s.f", parameter: 0.5 },
        { id: "g", type: "Group", children: ["s.f", "s.p"] },
      ],
      [{ type: "Shift", object: "s.g", by: [2, 1], duration: 1 }],
    ),
  );
  assert.deepEqual(object(c, 1).geometry.points[0], [3, 1, 0]);
});
test("every advertised object compiles and evaluates finite geometry", () => {
  const definitions = {
    Table:{entries:[['a','b'],['c','d']]}, MathTable:{entries:[['x','y']]}, DecimalTable:{entries:[[1,2]]},
    Matrix:{entries:[['x','y']]},DecimalMatrix:{entries:[[1,2]]},IntegerMatrix:{entries:[[1,2]]},
    BarChart:{values:[1,2]},SampleSpace:{probabilities:[.5,.5]},Graph:{vertices:['a','b'],edges:[['a','b']]},DiGraph:{vertices:['a','b'],edges:[['a','b']]},
    Point: { at: [0, 0] },
    Line: { from: [0, 0], to: [1, 1] },
    Arrow: { from: [0, 0], to: [1, 1] },
    DoubleArrow: { from: [0, 0], to: [1, 1] },
    DashedLine: { from: [0, 0], to: [1, 1] },
    ArcBetweenPoints: { from: [0, 0], to: [1, 1] },
    CurvedArrow: { from: [0, 0], to: [1, 1] },
    CurvedDoubleArrow: { from: [0, 0], to: [1, 1] },
    Angle: { from: [1, 0], vertex: [0, 0], to: [0, 1] },
    RightAngle: { from: [1, 0], vertex: [0, 0], to: [0, 1] },
    SurroundingRectangle:{target:"s.l"},BackgroundRectangle:{target:"s.l"},Brace:{target:"s.l"},
    Elbow: {}, Annulus: {}, AnnularSector: {}, RegularPolygram: {sides:5,step:2},
    ConvexHull: {points:[[0,0],[2,0],[0,2],[.2,.2]]},
    ConvexHull3D: {points:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]]},
    Polyhedron: {points:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],faces:[[0,1,2],[0,1,3],[0,2,3],[1,2,3]]},
    Icosahedron: {}, Dodecahedron: {},
    Triangle: {},
    RoundedRectangle: {},
    ImplicitFunction: { expression: "x^2+y^2-1", xRange: [-2, 2], yRange: [-2, 2] },
    ArrowVectorField: { expressions: ["-y", "x"], xRange: [-1, 1], yRange: [-1, 1] },
    StreamLines: { expressions: ["-y", "x"], seeds: [[1, 0]] },
    TracedPath: { point: "s.source" },
    Polyline: {
      points: [
        [0, 0],
        [1, 1],
      ],
    },
    Polygon: {
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    },
    RegularPolygon: { sides: 5 },
    Star: { tips: 5 },
    Rectangle: {},
    Square: {},
    Circle: {},
    Ellipse: {},
    Arc: {},
    Sector: {},
    Bezier: {
      points: [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ],
    },
    FunctionGraph: { expression: "sin(x)", domain: [-1, 1] },
    PolarGraph: { expression: "cos(theta)", domain: [0, 6] },
    ParametricCurve: { expressions: ["u", "u^2"], domain: [0, 1] },
    PointOnCurve: { curve: "s.l", parameter: 0.5 },
    Tangent: { curve: "s.l", parameter: 0.5 },
    Group: { children: ["s.l"] },
    Text: { text: "hello" },
    MathTex: { text: "x^2" },
    DecimalNumber: { value: 1 },
    PictureInPicture: {space:"s", x:0, y:0, width:200, height:100},
    Sphere: {},
    Cube: {},
    Cuboid: {},
    Cone: {},
    Cylinder: {},
    Torus: {},
    Surface: {
      expressions: ["u", "v", "u*v"],
      uRange: [-1, 1],
      vRange: [-1, 1],
    },
  };
  const solids = [
    "Polyhedron", "ConvexHull3D", "Icosahedron", "Dodecahedron",
    "Sphere",
    "Cube",
    "Cuboid",
    "Cone",
    "Cylinder",
    "Torus",
    "Surface",
  ];
  for (const type of supportedObjects) {
    const dim = solids.includes(type) ? "space3d" : "plane2d";
    const c = compileScene({
      version: 1,
      spaces: [
        {
          name: "s",
          type: dim,
          objects: [
            ...(solids.includes(type) ? [] : [line]),
            ...(type === "TracedPath" ? [{ id: "source", type: "Point", at: ["t", "sin(t)"] }] : []),
            { id: "object", type, ...definitions[type] },
          ],
        },
      ],
    });
    const g = object(c, 0, "s.object");
    assert.ok(g, type);
    assert.ok(
      g.geometry.points.every((p) => p.every(Number.isFinite)),
      type,
    );
    if (g.geometry.kind !== "group") assert.ok(g.geometry.points.length, type);
  }
});
test("all motion and emphasis effects have endpoint and seeking behavior", () => {
  const c = compileScene(
    scene(
      [line, { id: "path", type: "Line", from: [0, 0], to: [0, 4] }],
      [
        { type: "Rotate", object: "s.l", angle: Math.PI / 2, duration: 1 },
        { type: "Scale", object: "s.l", factor: 2, start: 1, duration: 1 },
        {
          type: "ApplyMatrix",
          object: "s.l",
          matrix: [
            [2, 0],
            [0, 1],
          ],
          start: 2,
          duration: 1,
        },
        {
          type: "MoveAlongPath",
          object: "s.l",
          path: "s.path",
          start: 3,
          duration: 1,
        },
        { type: "Indicate", object: "s.l", start: 4, duration: 1 },
        { type: "Wiggle", object: "s.l", start: 5, duration: 1 },
        { type: "Uncreate", object: "s.l", start: 6, duration: 1 },
        { type: "Create", object: "s.l", start: 7, duration: 1 },
      ],
    ),
  );
  close(object(c, 1, "s.l").geometry.points[1][1], 1);
  assert.equal(object(c, 7, "s.l").reveal, 0);
  assert.equal(object(c, 8, "s.l").reveal, 1);
  const end = object(c, 4, "s.l");
  assert.deepEqual(object(c, 5, "s.l").color, end.color);
  const samples = [0.3, 1.3, 2.3, 3.3, 4.3, 5.3, 6.3, 7.3].map((t) => [
    t,
    object(c, t, "s.l"),
  ]);
  for (const [t, state] of samples.reverse())
    assert.deepEqual(object(c, t, "s.l"), state);
});
test("singular dimensional space flattening retains three-coordinate geometry", () => {
  const c = compileScene({
    version: 1,
    spaces: [
      {
        name: "s",
        type: "space3d",
        axes: ["x", "y"],
        objects: [{ id: "p", type: "Point", at: [1, 2, 3] }],
      },
    ],
    events: [
      {
        type: "ApplySpaceMatrix",
        space: "s",
        matrix: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 0],
        ],
        duration: 1,
      },
    ],
  });
  assert.deepEqual(object(c, 1).geometry.points[0], [1, 2, 0]);
  assert.deepEqual(object(c, 0).geometry.points[0], [1, 2, 3]);
});
test("nonlinear whole-space maps subdivide straight paths and keep parameters live", () => {
  const c = compileScene(
    scene(
      [{ id: "l", type: "Line", from: [-1, 1], to: [1, 1] }],
      [
        {
          type: "ApplyComplexFunction",
          space: "s",
          expression: "a*z^2",
          duration: 1,
        },
      ],
      { parameters: { a: 1 } },
    ),
  );
  const g = object(c, 1, "s.l").geometry;
  assert.ok(g.points.length >= 128);
  assert.ok(g.points[Math.floor(g.points.length / 2)][0] < -0.99);
  close(object(c, 1, "s.l", { a: 2 }).geometry.points[0][1], -4);
});
test("invalid scalar outputs are diagnosed for numeric labels, constraints and surfaces", () => {
  reject(
    scene([{ id: "v", type: "DecimalNumber", value: "sqrt(-1)" }]),
    /Non-finite/,
  );
  reject(
    scene([
      line,
      { id: "p", type: "PointOnCurve", curve: "s.l", parameter: "sqrt(-1)" },
    ]),
    /Non-finite/,
  );
  reject(scene([{ id: "c", type: "Circle", radius: "-2" }]), /Non-finite/);
  reject(
    {
      version: 1,
      spaces: [
        {
          name: "s",
          type: "space3d",
          objects: [
            {
              id: "surface",
              type: "Surface",
              expressions: ["u", "v", "1/(u-v)"],
              uRange: [0, 1],
              vRange: [0, 1],
            },
          ],
        },
      ],
    },
    /Non-finite/,
  );
});
test("checked-in schema matches the public generated schema", async () => {
  const checked = JSON.parse(
    await readFile(
      new URL("../src/document/scene-v1.schema.json", import.meta.url),
      "utf8",
    ),
  );
  const built = JSON.parse(
    await readFile(
      new URL("../dist/document/scene-v1.schema.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(checked, built);
});
test("group entrances work with live dependencies at the zero-scale endpoint", () => {
  const c = compileScene(
    scene(
      [
        line,
        { id: "p", type: "PointOnCurve", curve: "s.l", parameter: 0.5 },
        { id: "g", type: "Group", children: ["s.l", "s.p"] },
      ],
      [{ type: "GrowFromCenter", object: "s.g", duration: 1 }],
    ),
  );
  assert.ok(object(c, 0).geometry.points[0].every(Number.isFinite));
  close(object(c, 1).geometry.points[0][0], 0.5);
});
test("morph endpoints remain exact after centered scaling", () => {
  const c = compileScene(
    scene(
      [
        { id: "a", type: "Line", from: [0, 0], to: [2, 0] },
        { id: "b", type: "Line", from: [0, 0], to: [0, 2] },
      ],
      [
        { type: "Scale", object: "s.a", factor: 2, duration: 1 },
        { type: "Transform", object: "s.a", to: "s.b", start: 1, duration: 1 },
      ],
    ),
  );
  const before = object(c, 1, "s.a").geometry.points;
  close(before[0][0], -1);
  close(before.at(-1)[0], 3);
  const after = object(c, 2, "s.a").geometry.points;
  close(after[0][0], 0);
  close(after[0][1], 0);
  close(after.at(-1)[0], 0);
  close(after.at(-1)[1], 2);
  assert.deepEqual(object(c, 1, "s.a").geometry.points, before);
});
test("group color emphasis restores child colors; later child styling can override group styling", () => {
  const c = compileScene(
    scene(
      [
        { ...line, style: { color: "#ff0000" } },
        { id: "g", type: "Group", children: ["s.l"] },
      ],
      [
        { type: "Indicate", object: "s.g", duration: 1 },
        {
          type: "FadeToColor",
          object: "s.g",
          color: "#00ff00",
          start: 1,
          duration: 1,
        },
        {
          type: "FadeToColor",
          object: "s.l",
          color: "#0000ff",
          start: 2,
          duration: 1,
        },
      ],
    ),
  );
  assert.equal(object(c, 1, "s.l").color, "#ff0000");
  assert.equal(object(c, 2, "s.l").color, "#00ff00");
  assert.equal(object(c, 3, "s.l").color, "#0000ff");
});
