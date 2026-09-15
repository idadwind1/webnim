import { writeFile } from "node:fs/promises";
const spaces = [],
  events = [],
  chapters = [];
const theme = {
  background: "#10141d",
  foreground: "#dbe3ee",
  axes: "#79899f",
  grid: "#283344",
  objectColors: ["#58a6ff", "#75dda5", "#f4b66b"],
};
const stage = {
  name: "stage",
  type: "plane2d",
  camera: { scale: 70 },
  objects: [],
};
spaces.push(stage);
const square = () => ({
  type: "Square",
  size: 2,
  style: { color: "#58a6ff", fillOpacity: 0.3 },
});
const circle = () => ({
  type: "Circle",
  radius: 1.2,
  style: { color: "#75dda5", fillOpacity: 0.2 },
});
function chapter(name, description, objects, make, space = stage) {
  const start = chapters.length * 5,
    prefix = `demo${chapters.length}_`;
  const ids = Object.fromEntries(
    Object.keys(objects).map((k) => [k, `${space.name}.${prefix}${k}`]),
  );
  const own = Object.entries(objects).map(([key, value]) => ({
    ...value,
    id: prefix + key,
    caption: `${name}: ${description}`,
  }));
  space.objects.push(...own);
  const actions = make(ids, start + 1);
  for (const [key, obj] of Object.entries(objects)) {
    const id = ids[key];
    if (own.some((o) => o.type === "Group" && o.children.includes(id)))
      continue;
    const entrance = actions.some(
      (e) =>
        e.object === id &&
        [
          "AddTextLetterByLetter",
          "AddTextWordByWord",
          "ShowIncreasingSubsets",
          "ShowSubmobjectsOneByOne",
          "Add",
          "Create",
          "FadeIn",
          "GrowFromCenter",
          "GrowArrow",
          "GrowFromPoint",
          "GrowFromEdge",
          "SpinInFromNothing",
          "DrawBorderThenFill",
          "ShowPassingFlash",
        ].includes(e.type),
    );
    const replacement = actions.some(
      (e) =>
        ["ReplacementTransform", "FadeTransform", "TransformFromCopy"].includes(
          e.type,
        ) && e.to === id,
    );
    const template = key === "target" && !replacement;
    if (template) {
      const target = own.find((o) => o.id === prefix + key);
      target.style = { ...target.style, opacity: 0 };
    } else {
      if (!entrance && !replacement)
        events.push({ type: "Add", object: id, start, duration: 0 });
      events.push({
        type: "FadeOut",
        object: id,
        start: start + 4.8,
        duration: 0.2,
      });
    }
  }
  events.push(
    {
      type: "SwitchSpace",
      space: space.name,
      start,
      duration: 0,
      transition: "cut",
    },
    ...actions,
  );
  chapters.push({
    name,
    description,
    start,
    end: start + 5,
    space: space.name,
  });
}
const simple = [
  ["Add", "The square appears instantly.", {}],
  ["Create", "Draw the square outline progressively.", {}],
  ["Uncreate", "Erase the outline in reverse.", {}],
  ["FadeIn", "Increase opacity from transparent to visible.", {}],
  ["FadeOut", "Fade the square away.", {}],
  ["MoveTo", "Move the center to the target position.", { to: [2, 1] }],
  ["Shift", "Move by a relative displacement.", { by: [2, 1] }],
  [
    "Rotate",
    "Rotate half a turn around the object center.",
    { angle: Math.PI },
  ],
  ["Scale", "Enlarge the object around its center.", { factor: 1.8 }],
  ["FadeToColor", "Blend blue into pink.", { color: "#f778ba" }],
  [
    "ApplyMatrix",
    "Shear the object while the coordinate grid stays fixed.",
    {
      matrix: [
        [1, 0.8],
        [0, 1],
      ],
    },
  ],
  ["Flash", "Radiating strokes briefly emphasize the object center.", {}],
  ["FocusOn", "A shrinking circle directs attention to the object.", {}],
  [
    "Circumscribe",
    "Draw a temporary surrounding outline while preserving the object.",
    {},
  ],
  [
    "Indicate",
    "Briefly enlarge and recolor, then restore the object.",
    { color: "#f4b66b", factor: 1.35 },
  ],
  [
    "ComplexHomotopy",
    "Deform the outline with a complex map z and progress alpha.",
    { expression: "z + 0.25*alpha*z^2" },
  ],
  [
    "Homotopy",
    "Bend the outline with expressions in x, y and alpha.",
    { expressions: ["x", "y+alpha*sin(x)"] },
  ],
  [
    "ApplyPointwiseFunction",
    "Interpolate toward a safe expression-defined mapping.",
    { expressions: ["x", "y+.5*x*x"] },
  ],
  [
    "PhaseFlow",
    "Integrate the rotational field with deterministic RK4.",
    { expressions: ["-y", "x"], virtualTime: 1.5 },
  ],
  ["Restore", "Restore the object to its initial state.", { at: 0 }],
  ["Blink", "Briefly blink, then restore the original opacity.", { count: 2 }],
  [
    "ApplyWave",
    "Send a wave through the vector outline, then restore it.",
    { amplitude: 0.5, waves: 2 },
  ],
  ["Wiggle", "Rock the object back and forth, then settle.", { angle: 0.35 }],
  ["GrowFromCenter", "Grow the object outward from its center.", {}],
  [
    "GrowFromPoint",
    "Expand the square from the fixed point (−3, −1).",
    { point: [-3, -1] },
  ],
  [
    "GrowFromEdge",
    "Grow outward while the left edge stays anchored.",
    { edge: "left" },
  ],
  [
    "SpinInFromNothing",
    "Spin and grow the square around its center.",
    { angle: 2 * Math.PI },
  ],
  [
    "DrawBorderThenFill",
    "Finish the outline before revealing the interior fill.",
    {},
  ],
  [
    "ShowPassingFlash",
    "A short stroke travels around the outline, then disappears.",
    { timeWidth: 0.2 },
  ],
];
for (const [name, description, args] of simple)
  chapter(
    name,
    description,
    {
      shape:
        name === "Rotate"
          ? {
              type: "Rectangle",
              width: 3,
              height: 1.2,
              style: { color: "#58a6ff", fillOpacity: 0.3 },
            }
          : square(),
    },
    (id, start) =>
      name === "Restore"
        ? [
            {
              type: "Shift",
              object: id.shape,
              by: [2, 1],
              start,
              duration: 0.6,
            },
            {
              type: "Restore",
              object: id.shape,
              at: start - 1,
              start: start + 0.8,
              duration: 1.7,
            },
          ]
        : [
            {
              type: name,
              object: id.shape,
              start,
              duration: name === "Add" ? 0 : 2.5,
              easing: "smooth",
              ...args,
            },
          ],
  );
chapter(
  "GrowArrow",
  "Grow an arrow from its stationary tail.",
  {
    shape: {
      type: "Arrow",
      from: [-2, -1],
      to: [2, 1],
      style: { color: "#75dda5" },
    },
  },
  (id, start) => [
    {
      type: "GrowArrow",
      object: id.shape,
      start,
      duration: 2.5,
      easing: "smooth",
    },
  ],
);
for (const name of [
  "AddTextLetterByLetter",
  "RemoveTextLetterByLetter",
  "AddTextWordByWord",
])
  chapter(
    name,
    "Reveal or remove whole Unicode graphemes and words.",
    {
      shape: {
        type: "Text",
        text: "Hello, mathematical world! ✨",
        style: { fontSize: 26 },
      },
    },
    (id, start) => [{ type: name, object: id.shape, start, duration: 2.5 }],
  );
for (const name of ["ShowIncreasingSubsets", "ShowSubmobjectsOneByOne"])
  chapter(
    name,
    "Reveal group children in their declared order.",
    {
      a: { ...circle(), radius: 0.5, position: [-2, 0] },
      b: { ...circle(), radius: 0.5 },
      c: { ...circle(), radius: 0.5, position: [2, 0] },
      shape: { type: "Group", children: [] },
    },
    (id, start) => {
      stage.objects.find((o) => `stage.${o.id}` === id.shape).children = [
        id.a,
        id.b,
        id.c,
      ];
      return [{ type: name, object: id.shape, start, duration: 2.5 }];
    },
  );
chapter(
  "MoveAlongPath",
  "The point follows the curved guide.",
  {
    shape: {
      type: "Point",
      at: [-2, 0],
      style: { color: "#f4b66b", pointSize: 8 },
    },
    path: {
      type: "Bezier",
      points: [
        [-2, 0],
        [-1, 3],
        [1, -3],
        [2, 0],
      ],
      style: { color: "#79899f" },
    },
  },
  (id, start) => [
    {
      type: "MoveAlongPath",
      object: id.shape,
      path: id.path,
      start,
      duration: 2.5,
      easing: "smooth",
    },
  ],
);
for (const name of ["Transform", "ReplacementTransform"])
  chapter(
    name,
    name === "Transform"
      ? "Morph the square into a star while keeping the source object ID."
      : "Morph into a star and transfer visibility to the destination object.",
    {
      shape: square(),
      target: {
        type: "Star",
        tips: 5,
        radius: 1.6,
        innerRadius: 0.7,
        position: [1, 0],
        style: { color: "#75dda5", fillOpacity: 0.3 },
      },
    },
    (id, start) => [
      {
        type: name,
        object: id.shape,
        to: id.target,
        start,
        duration: 2.5,
        easing: "smooth",
      },
    ],
  );
for (const name of ["Swap", "FadeTransform"])
  chapter(
    name,
    "Exchange positions or crossfade two drawable objects.",
    {
      shape: { ...square(), position: [-2, 0] },
      other: { ...circle(), position: [2, 0] },
    },
    (id, start) => [
      { type: name, object: id.shape, to: id.other, start, duration: 2.5 },
    ],
  );
chapter(
  "TransformFromCopy",
  "Morph a temporary copy into the target while leaving the source unchanged.",
  {
    shape: { ...square(), position: [-2, 0] },
    target: { ...circle(), position: [2, 0] },
  },
  (id, start) => [
    {
      type: "TransformFromCopy",
      object: id.shape,
      to: id.target,
      start,
      duration: 2.5,
      easing: "smooth",
    },
  ],
);
chapter(
  "CyclicReplace",
  "Each object moves to the next object’s starting center; the last moves to the first.",
  {
    a: { ...circle(), radius: 0.5, position: [-2, -1] },
    b: { ...square(), size: 1, position: [0, 1.5] },
    c: {
      type: "Triangle",
      radius: 0.7,
      position: [2, -1],
      style: { color: "#f4b66b", fillOpacity: 0.4 },
    },
  },
  (id, start) => [
    {
      type: "CyclicReplace",
      objects: [id.a, id.b, id.c],
      start,
      duration: 2.5,
      easing: "smooth",
    },
  ],
);
chapter(
  "LaggedStartMap",
  "Apply one animation template to a list of targets.",
  {
    a: { ...circle(), position: [-2, 0], radius: 0.5 },
    b: { ...circle(), radius: 0.5 },
    c: { ...circle(), position: [2, 0], radius: 0.5 },
  },
  (id, start) => [
    {
      type: "LaggedStartMap",
      objects: [id.a, id.b, id.c],
      animation: { type: "Shift", by: [0, 2], duration: 1 },
      start,
      duration: 2.5,
      lagRatio: 0.5,
    },
  ],
);
chapter(
  "AnimateParameter",
  "Animate a from 0.5 to 2: the graph and number update together.",
  {
    curve: { type: "FunctionGraph", expression: "a*sin(x)", domain: [-5, 5] },
    value: { type: "DecimalNumber", value: "a", position: [0, 2.8] },
  },
  (_, start) => [
    {
      type: "AnimateParameter",
      parameter: "a",
      to: 2,
      start,
      duration: 2.5,
      easing: "smooth",
    },
  ],
);
for (const name of ["EventGroup", "Succession", "LaggedStart"])
  chapter(
    name,
    {
      EventGroup: "Three circles move at the same time.",
      Succession: "Each circle starts after the previous one finishes.",
      LaggedStart: "The circles start at staggered times with overlap.",
    }[name],
    Object.fromEntries(
      [0, 1, 2].map((i) => [
        "p" + i,
        {
          ...circle(),
          radius: 0.4,
          position: [-2, 1.5 - i * 1.5],
          style: { color: theme.objectColors[i], fillOpacity: 0.4 },
        },
      ]),
    ),
    (id, start) => [
      {
        type: name,
        start,
        duration: 2.5,
        ...(name === "LaggedStart" ? { lagRatio: 0.45 } : {}),
        events: [0, 1, 2].map((i) => ({
          type: "Shift",
          object: id["p" + i],
          by: [4, 0],
          duration: 1,
          easing: "smooth",
        })),
      },
    ],
  );
function separate(name) {
  const s = { name, type: "plane2d", camera: { scale: 65 }, objects: [] };
  spaces.push(s);
  return s;
}
chapter(
  "CameraZoom",
  "Zoom the camera toward the origin; the object coordinates stay unchanged.",
  { shape: circle() },
  (_, start) => [
    {
      type: "CameraZoom",
      space: "zoom",
      factor: 2.2,
      start,
      duration: 2.5,
      easing: "smooth",
    },
  ],
  separate("zoom"),
);
chapter(
  "CameraWindow",
  "Pan and zoom to fit x ∈ [1,5], y ∈ [−2,2].",
  {
    shape: { ...circle(), position: [3, 0] },
    reference: { type: "Point", at: [0, 0] },
  },
  (_, start) => [
    {
      type: "CameraWindow",
      space: "window",
      x: [1, 5],
      y: [-2, 2],
      start,
      duration: 2.5,
      easing: "smooth",
    },
  ],
  separate("window"),
);
for (const name of ["CameraMove", "CameraOrbit"]) {
  const space = {
    name: name.toLowerCase(),
    type: "space3d",
    camera: { position: [7, -9, 7] },
    objects: [],
  };
  spaces.push(space);
  chapter(
    name,
    "Move the 3D viewpoint while preserving interactive orbit controls.",
    { shape: { type: "Icosahedron", radius: 2 } },
    (_, start) => [
      {
        type: name,
        space: space.name,
        start,
        duration: 2.5,
        easing: "smooth",
        ...(name === "CameraMove"
          ? { position: [-7, -5, 3], center: [0, 0, 0.5] }
          : { angle: Math.PI, axis: [0, 0, 1] }),
      },
    ],
    space,
  );
}
chapter(
  "ApplySpaceMatrix",
  "Shear the whole coordinate plane, including its grid and objects.",
  { shape: circle(), vector: { type: "Arrow", from: [0, 0], to: [1, 1] } },
  (_, start) => [
    {
      type: "ApplySpaceMatrix",
      space: "matrix",
      matrix: [
        [1, 0.8],
        [0, 1],
      ],
      start,
      duration: 2.5,
      easing: "smooth",
    },
  ],
  separate("matrix"),
);
chapter(
  "ApplyComplexFunction",
  "Warp the plane with the complex map z → z + 0.12z².",
  { shape: circle(), vector: { type: "Arrow", from: [0, 0], to: [1, 1] } },
  (_, start) => [
    {
      type: "ApplyComplexFunction",
      space: "complex",
      expression: "z + 0.12*z^2",
      start,
      duration: 2.5,
      easing: "smooth",
    },
  ],
  separate("complex"),
);
const destination = separate("destination");
destination.objects.push({
  id: "star",
  type: "Star",
  tips: 5,
  radius: 1.5,
  style: { color: "#75dda5", fillOpacity: 0.3 },
});
chapter(
  "SwitchSpace",
  "Crossfade from a circle scene to a star scene. Both are ordinary 2D spaces.",
  { shape: circle() },
  (_, start) => [
    {
      type: "SwitchSpace",
      space: "destination",
      start,
      duration: 2.5,
      transition: "fade",
    },
  ],
);
const eases = ["linear", "smooth", "ease-in", "ease-out"];
chapter(
  "Easing",
  "Compare the four easing curves over the same distance and duration.",
  Object.fromEntries(
    eases.flatMap((ease, i) => [
      [
        `p${i}`,
        {
          type: "Point",
          at: [-2, 2.1 - i * 1.4],
          style: {
            color: ["#58a6ff", "#75dda5", "#f4b66b", "#f778ba"][i],
            pointSize: 8,
          },
        },
      ],
      [
        `label${i}`,
        {
          type: "Text",
          text: ease,
          position: [-4, 2.1 - i * 1.4],
          style: { fontSize: 14 },
        },
      ],
    ]),
  ),
  (id, start) =>
    eases.map((easing, i) => ({
      type: "Shift",
      object: id["p" + i],
      by: [4, 0],
      start,
      duration: 2.5,
      easing,
    })),
);
const duration = chapters.length * 5;
await writeFile(
  new URL("../fixtures/all-animations.json", import.meta.url),
  JSON.stringify(
    { version: 1, parameters: { a: 0.5 }, theme, spaces, events, duration },
    null,
    2,
  ) + "\n",
);
await writeFile(
  new URL("../fixtures/all-animations.chapters.json", import.meta.url),
  JSON.stringify(chapters, null, 2) + "\n",
);
