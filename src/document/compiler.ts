import { expandLayouts } from "./layouts.ts";
import Ajv from "ajv";
import { evaluateCamera } from "./camera.ts";
import { compileComplex } from "./complex.ts";
import { evaluateDocument } from "./evaluator.ts";
import { sceneSchemaV1, pathObjects } from "./schema.ts";
import {
  compileMath,
  reservedNames,
  type MathExpression,
} from "./expression.ts";
import {
  SceneValidationError,
  type SceneDocument,
  type SceneObject,
  type SpaceDefinition,
  type SceneEvent,
  type ObjectEvent,
  type Diagnostic,
} from "./types.ts";
export interface CompiledObject {
  definition: SceneObject;
  space: SpaceDefinition;
  id: string;
  path: string;
  expressions: Map<string, MathExpression>;
  parent?: string;
  dependencies: string[];
  pointReferences: string[];
}
export type LeafEvent =
  | ObjectEvent
  | Extract<
      SceneEvent,
      {
        type:
          | "AnimateParameter"
          | "SwitchSpace"
          | "CameraMove"
          | "CameraOrbit"
          | "CameraZoom"
          | "CameraWindow"
          | "ApplySpaceMatrix"
          | "ApplyComplexFunction";
      }
    >;
export interface CompiledTrack {
  event: LeafEvent;
  start: number;
  duration: number;
  path: string;
  index: number;
  writes: string[];
  expressions?: MathExpression[];
}
export interface CompiledScene {
  readonly document: SceneDocument;
  readonly objects: ReadonlyMap<string, CompiledObject>;
  readonly tracks: readonly CompiledTrack[];
  readonly duration: number;
}
const ajv = new Ajv({ allErrors: true, strict: false, discriminator: true });
const validate = ajv.compile(sceneSchemaV1);
const fail = (path: string, message: string): never => {
  throw new SceneValidationError([{ path, message }]);
};
function assertJSON(
  value: unknown,
  path = "$",
  seen = new Set<object>(),
  depth = 0,
) {
  if (depth > 100) fail(path, "JSON is nested too deeply");
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || value === null || seen.has(value))
    return fail(path, "Expected finite, acyclic JSON data");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    fail(path, "Expected a plain JSON object");
  seen.add(value);
  for (const [k, v] of Object.entries(value))
    assertJSON(
      v,
      Array.isArray(value) ? `${path}[${k}]` : `${path}.${k}`,
      seen,
      depth + 1,
    );
  seen.delete(value);
}
function freeze(value: unknown) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
}
const entrance = ["AddTextLetterByLetter", "AddTextWordByWord", "ShowIncreasingSubsets", "ShowSubmobjectsOneByOne","Add", "Create", "FadeIn", "GrowFromCenter", "GrowArrow", "GrowFromPoint", "GrowFromEdge", "SpinInFromNothing", "DrawBorderThenFill", "ShowPassingFlash"];
export const entrances = entrance;
export function compileScene(input: unknown): CompiledScene {
  assertJSON(input);
  input = structuredClone(input);
  const normalize = (node: any, path: string) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    if ("animations" in node) {
      if ("events" in node)
        fail(path, "Use events only; cannot combine events and animations");
      node.events = node.animations;
      delete node.animations;
    }
    if (node.type === "AnimationGroup") node.type = "EventGroup";
    if (Array.isArray(node.events))
      node.events.forEach((e: unknown, i: number) =>
        normalize(e, `${path}.events[${i}]`),
      );
  };
  normalize(input, "$");
  if (!validate(input)) {
    // Select the matching tagged variant so diagnostics point to fields, not every union branch.
    const errors = validate.errors ?? [];
    const filtered = errors.filter(
      (e) => !["const", "oneOf", "required"].includes(e.keyword),
    );
    const diagnostics = (filtered.length ? filtered : errors)
      .slice(0, 16)
      .map((e) => ({
        path:
          "$" +
          e.instancePath
            .replace(/\/(\d+)(?=\/|$)/g, "[$1]")
            .replace(/\//g, ".") +
          (e.keyword === "additionalProperties"
            ? "." + e.params.additionalProperty
            : ""),
        message: e.message ?? "Invalid value",
      }));
    throw new SceneValidationError(diagnostics);
  }
  const document = expandLayouts(structuredClone(input) as unknown as SceneDocument),
    objects = new Map<string, CompiledObject>(),
    spaces = new Map<string, SpaceDefinition>();
  const parameters = Object.keys(document.parameters ?? {});
  const pointVariables = document.spaces.flatMap(space =>
    space.objects.filter(o => o.type === "Point" || o.type === "PointOnCurve")
      .flatMap(o => ["x", "y", "z"].map(axis => `${space.name}.${o.id}.${axis}`)),
  );
  parameters.forEach((p) => {
    if (reservedNames.includes(p))
      fail(`$.parameters.${p}`, "Reserved mathematical name");
  });
  document.spaces.forEach((space, si) => {
    const sp = `$.spaces[${si}]`;
    if (spaces.has(space.name)) fail(sp + ".name", "Duplicate space name");
    spaces.set(space.name, space);
    const dim = space.type === "axis1d" ? 1 : space.type === "space3d" ? 3 : 2;
    if (
      space.camera?.position &&
      space.camera.position.every(
        (v, i) => v === (space.camera?.center ?? [0, 0, 0])[i],
      )
    )
      fail(sp + ".camera.position", "Camera position must differ from center");
    space.objects.forEach((o, oi) => {
      const path = `${sp}.objects[${oi}]`,
        id = `${space.name}.${o.id}`;
      if (objects.has(id)) fail(path + ".id", "Duplicate object ID");
      if (objects.size >= 2000) fail(path, "Document exceeds 2000 objects");
      for (const [key, value] of Object.entries(o))
        if (
          [
            "radius",
            "innerRadius",
            "radiusX",
            "radiusY",
            "width",
            "height",
            "depth",
            "size",
            "tubeRadius",
            "length",
            "dashLength",
            "cornerRadius",
          ].includes(key) &&
          typeof value === "number" &&
          value <= 0
        )
          fail(path + "." + key, "Dimension must be positive");
      const expressions = new Map<string, MathExpression>(),
        deps: string[] = [];
      const local =
        ["ImplicitFunction", "ArrowVectorField", "StreamLines"].includes(o.type)
          ? ["x", "y", "z"]
          : o.type === "FunctionGraph"
          ? ["x"]
          : o.type === "PolarGraph"
            ? ["theta"]
            : o.type === "ParametricCurve"
              ? ["u"]
              : o.type === "Surface"
                ? ["u", "v"]
                : [];
      const expression = (
        key: string,
        value: unknown,
        locals: string[] = [],
      ) => {
        if (typeof value === "number" || typeof value === "string")
          expressions.set(
            key,
            compileMath(
              value,
              [...parameters, "t", ...locals, ...pointVariables],
              path + "." + key,
            ),
          );
      };
      const coordinate = (
        key: string,
        value: unknown,
        locals: string[] = [],
      ) => {
        if (!Array.isArray(value)) return;
        if (value.length !== dim)
          fail(
            path + "." + key,
            `Expected ${dim} native coordinates for ${space.type}`,
          );
        value.forEach((v, i) => expression(`${key}.${i}`, v, locals));
      };
      coordinate("position", o.position);
      for (const [key, value] of Object.entries(o)) {
        if (["at", "from", "to", "vertex"].includes(key)) coordinate(key, value);
        if (key === "points" || key === "seeds")
          (value as unknown[]).forEach((v, i) => coordinate(`${key}.${i}`, v));
        if (key === "expressions") coordinate(key, value, local);
        if (key === "expression") expression(key, value, local);
        if (
          [
            "radius",
            "innerRadius",
            "radiusX",
            "radiusY",
            "width",
            "height",
            "depth",
            "size",
            "tubeRadius",
            "startAngle",
            "angle",
            "length",
            "parameter",
            "value",
            "dashLength",
            "cornerRadius",
            "lengthScale",
            "padding",
          ].includes(key)
        )
          expression(key, value);
        if (["domain", "uRange", "vRange", "xRange", "yRange", "zRange"].includes(key)) {
          const r = value as number[];
          if (r[0] >= r[1]) fail(path + "." + key, "Range must be increasing");
        }
      }
      if (
        [
          "Polyhedron", "ConvexHull3D", "Icosahedron", "Dodecahedron",
          "Sphere",
          "Cube",
          "Cuboid",
          "Cone",
          "Cylinder",
          "Torus",
          "Surface",
        ].includes(o.type) &&
        dim !== 3
      )
        fail(path + ".type", "This object requires space3d");
      if (
        [
          "Elbow", "Annulus", "AnnularSector", "RegularPolygram", "ConvexHull",
          "FunctionGraph",
          "PolarGraph",
          "Circle",
          "Ellipse",
          "Arc",
          "Sector",
          "RegularPolygon",
          "Star",
          "Rectangle",
          "Square",
          "Triangle", "RoundedRectangle", "Angle", "RightAngle",
          "ArcBetweenPoints", "CurvedArrow", "CurvedDoubleArrow",
          "ImplicitFunction", "ArrowVectorField", "StreamLines",
        ].includes(o.type) &&
        dim === 1
      )
        fail(path + ".type", "This object requires at least two dimensions");
      if (o.type === "ConvexHull" && dim !== 2)
        fail(path + ".type", "ConvexHull requires a 2D space; use ConvexHull3D for a volume");
      if (o.type === "RegularPolygram" && o.step >= o.sides)
        fail(path + ".step", "Step must be smaller than sides");
      if (o.type === "Polyhedron" && o.faces.some(face => new Set(face).size !== face.length || face.some(i => i >= o.points.length)))
        fail(path + ".faces", "Face indices must be distinct and refer to existing vertices");
      if (o.type === "Bezier" && (o.points.length - 1) % 3 !== 0)
        fail(path + ".points", "Cubic Bezier requires 3n+1 control points");
      if (o.type === "ImplicitFunction" && dim !== 2)
        fail(path + ".type", "ImplicitFunction requires a 2D space");
      if (o.type === "ArrowVectorField") {
        if (o.zRange && dim !== 3) fail(path + ".zRange", "zRange requires space3d");
        const nx = Math.floor((o.xRange[1] - o.xRange[0]) / (o.spacing ?? 1)) + 1;
        const ny = Math.floor((o.yRange[1] - o.yRange[0]) / (o.spacing ?? 1)) + 1;
        const nz = o.zRange ? Math.floor((o.zRange[1] - o.zRange[0]) / (o.spacing ?? 1)) + 1 : 1;
        if (nx * ny * nz > 4096) fail(path + ".spacing", "Vector field exceeds 4096 arrows");
      }
      if (o.type === "StreamLines" && o.seeds.length * (o.steps ?? 256) > 100000)
        fail(path + ".steps", "Streamlines exceed 100000 integration steps");
      if ("target" in o) deps.push(o.target);
      if (o.type === "BackgroundRectangle") o.style={fillOpacity:1,...o.style};
      if (["SurroundingRectangle","BackgroundRectangle","Brace"].includes(o.type) && dim!==2) fail(path+".type","Bounds helpers require a 2D space");
      if (o.type === "PointOnCurve" || o.type === "Tangent") deps.push(o.curve);
      if ("drag" in o && o.drag) {
        if (!parameters.includes(o.drag.parameter))
          fail(path + ".drag.parameter", "Unknown parameter");
        if ((o.drag.coordinate ?? 0) >= dim)
          fail(path + ".drag.coordinate", "Coordinate outside space dimension");
        if ((o.drag.min ?? -Infinity) > (o.drag.max ?? Infinity))
          fail(path + ".drag", "Invalid clamp range");
        if (
          o.type === "Point" &&
          o.at[o.drag.coordinate ?? 0] !== o.drag.parameter
        )
          fail(
            path + ".drag",
            "Dragged coordinate must directly name the bound parameter",
          );
        if (o.type === "PointOnCurve" && o.parameter !== o.drag.parameter)
          fail(
            path + ".drag",
            "Curve parameter must directly name the bound parameter",
          );
      }
      objects.set(id, {
        definition: o,
        space,
        id,
        path,
        expressions,
        dependencies: deps,
        pointReferences: [...new Set([...expressions.values()].flatMap(e =>
          e.dependencies.filter(name => name.includes(".")),
        ))],
      });
    });
  });
  const resolve = (ref: string, space: string, path: string) => {
    if (!objects.has(ref)) fail(path, `Unknown object ${ref}`);
    if (!ref.startsWith(space + "."))
      fail(path, "Cross-space object references are unsupported");
    return objects.get(ref)!;
  };
  for (const o of objects.values()) {
    if (o.definition.type === "PictureInPicture") {
      if (!spaces.has(o.definition.space))
        fail(o.path + ".space", "Unknown space");
      if (o.definition.position)
        fail(
          o.path + ".position",
          "PictureInPicture uses pixel x/y, not world position",
        );
    }
    if ("target" in o.definition) {
      const target=resolve(o.definition.target,o.space.name,o.path+".target");
      if (!pathObjects.includes(target.definition.type) && target.definition.type!=="Point")
        fail(o.path+".target","Bounds helpers require a vector path or point target");
    }
    for (const dep of "curve" in o.definition ? [o.definition.curve] : [])
      if (
        ["ImplicitFunction", "ArrowVectorField", "StreamLines"].includes(objects.get(dep)?.definition.type ?? "") ||
        !pathObjects.includes(
          resolve(dep, o.space.name, o.path + ".curve").definition.type,
        )
      )
        fail(o.path + ".curve", "Expected a vector path");
    for (const ref of o.pointReferences) {
      const id = ref.slice(0, ref.lastIndexOf("."));
      if (!o.dependencies.includes(id)) o.dependencies.push(id);
    }
    if (o.definition.type === "TracedPath") {
      const source = objects.get(o.definition.point);
      if (!source || !["Point", "PointOnCurve"].includes(source.definition.type))
        fail(o.path + ".point", "Expected a point reference");
      o.dependencies.push(o.definition.point);
    }
    if (o.definition.type === "Group")
      for (const ref of o.definition.children) {
        const child = resolve(ref, o.space.name, o.path + ".children");
        if (child.definition.type === "PictureInPicture")
          fail(
            o.path + ".children",
            "PictureInPicture cannot belong to a world-geometry group",
          );
        if (child.parent)
          fail(o.path + ".children", "An object can belong to only one group");
        child.parent = o.id;
        child.dependencies.push(o.id);
      }
  }
  const visiting = new Set<string>(),
    visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) fail(objects.get(id)!.path, "Dependency cycle");
    if (visited.has(id)) return;
    visiting.add(id);
    objects.get(id)!.dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  objects.forEach((o) => visit(o.id));
  const tracks: CompiledTrack[] = [];
  const flatten = (
    events: SceneEvent[],
    base: number,
    path: string,
    mode = "EventGroup",
    lag = 0,
  ): number => {
    let cursor = 0,
      end = 0;
    events.forEach((a, i) => {
      const ap = `${path}[${i}]`,
        start = base + cursor + (a.start ?? 0);
      let duration: number;
      if ("events" in a) {
        const before = tracks.length;
        const natural = flatten(
          a.events,
          start,
          ap + ".events",
          a.type,
          a.lagRatio ?? 0.1,
        );
        duration = a.duration ?? natural;
        if (a.duration !== undefined && natural === 0 && a.duration > 0)
          fail(ap + ".duration", "Cannot stretch a zero-length composition");
        if (natural > 0 && a.duration !== undefined)
          for (const t of tracks.slice(before)) {
            t.start = start + ((t.start - start) * duration) / natural;
            t.duration *= duration / natural;
          }
      } else {
        duration =
          a.duration ?? (["Add", "SwitchSpace"].includes(a.type) ? 0 : 1);
        if (tracks.length >= 4000)
          fail(ap, "Document exceeds 4000 event tracks");
        tracks.push({
          event: a,
          start,
          duration,
          path: ap,
          index: 0,
          writes: [],
        });
      }
      end = Math.max(end, start - base + duration);
      if (mode === "Succession") cursor = start - base + duration;
      else if (mode === "LaggedStart") cursor += duration * lag;
    });
    return end;
  };
  flatten(document.events ?? [], 0, "$.events");
  tracks.sort((a, b) => a.start - b.start);
  const descendants = (id: string): string[] => [
    id,
    ...[...objects.values()]
      .filter((o) => o.parent === id)
      .flatMap((o) => descendants(o.id)),
  ];
  for (const [index, t] of tracks.entries()) {
    t.index = index;
    const a = t.event;
    if (a.type === "AnimateParameter") {
      if (!parameters.includes(a.parameter))
        fail(t.path + ".parameter", "Unknown parameter");
      t.writes = [`parameter:${a.parameter}`];
      continue;
    }
    if (a.type === "CameraZoom" || a.type === "CameraWindow" || a.type === "CameraMove" || a.type === "CameraOrbit") {
      const space =
        spaces.get(a.space) ?? fail(t.path + ".space", "Unknown space");
      if ((a.type === "CameraMove" || a.type === "CameraOrbit") && space.type !== "space3d")
        fail(t.path + ".type", "3D camera movement requires space3d");
      if (a.type === "CameraOrbit" && a.axis && Math.hypot(...a.axis) === 0)
        fail(t.path + ".axis", "Orbit axis cannot be zero");
      if (a.type === "CameraWindow") {
        if (space.type === "space3d")
          fail(
            t.path + ".space",
            "CameraWindow requires a 1D or 2D space; use CameraZoom for 3D",
          );
        if (space.type !== "axis1d" && !a.y)
          fail(t.path + ".y", "A 2D window requires y bounds");
        if (space.type === "axis1d" && a.y)
          fail(t.path + ".y", "A 1D window only accepts x bounds");
        for (const key of ["x", "y"] as const) {
          const range = a[key];
          if (
            range &&
            (!(range[1] > range[0]) || !Number.isFinite(range[1] - range[0]))
          )
            fail(
              t.path + "." + key,
              "Window bounds must be increasing and finite",
            );
        }
      }
      t.writes = [`camera:${a.space}`];
      continue;
    }
    if (a.type === "SwitchSpace") {
      if (!spaces.has(a.space)) fail(t.path + ".space", "Unknown space");
      t.writes = ["space"];
      continue;
    }
    if (a.type === "ApplySpaceMatrix" || a.type === "ApplyComplexFunction") {
      const space =
        spaces.get(a.space) ?? fail(t.path + ".space", "Unknown space");
      const dim =
        space.type === "axis1d" ? 1 : space.type === "space3d" ? 3 : 2;
      if (
        a.type === "ApplySpaceMatrix" &&
        (a.matrix.length !== dim || a.matrix.some((r) => r.length !== dim))
      )
        fail(t.path + ".matrix", `Expected ${dim}×${dim} matrix`);
      if (a.type === "ApplyComplexFunction") {
        if (dim !== 2)
          fail(t.path + ".space", "Complex mapping requires a 2D space");
        compileComplex(a.expression, t.path + ".expression", [
          ...parameters,
          "t",
        ]);
      }
      t.writes = [`spaceGeometry:${a.space}`];
      continue;
    }
    const o =
      objects.get(a.object) ?? fail(t.path + ".object", "Unknown object");
    if (
      o.definition.type === "PictureInPicture" &&
      !["Add", "FadeIn", "FadeOut"].includes(a.type)
    )
      fail(
        t.path + ".type",
        "PictureInPicture supports Add, FadeIn and FadeOut; geometry transforms are unsupported",
      );
    const dim =
      o.space.type === "axis1d" ? 1 : o.space.type === "space3d" ? 3 : 2;
    if (a.type === "Restore" && (a.at ?? 0) > t.start)
      fail(t.path + ".at", "Restore snapshot must not be later than the event start");
    if (["Homotopy", "ApplyPointwiseFunction", "PhaseFlow"].includes(a.type)) {
      if (!["Point", ...pathObjects].includes(o.definition.type) || ["ImplicitFunction", "ArrowVectorField", "StreamLines", "Annulus", "RegularPolygram"].includes(o.definition.type))
        fail(t.path + ".type", "Deformation requires a point or continuous vector path");
      const a2 = a as Extract<ObjectEvent,{expressions: unknown}>;
      if (a2.expressions.length !== dim) fail(t.path + ".expressions", `Expected ${dim} Cartesian expressions`);
      t.expressions = a2.expressions.map((expression,i)=>compileMath(expression,[...parameters,"x","y","z","t","alpha"],`${t.path}.expressions[${i}]`));
    }
    if (["AddTextLetterByLetter", "RemoveTextLetterByLetter", "AddTextWordByWord"].includes(a.type) && o.definition.type !== "Text")
      fail(t.path + ".type", "Text reveal requires a plain Text object");
    if (["ShowIncreasingSubsets", "ShowSubmobjectsOneByOne"].includes(a.type) && o.definition.type !== "Group")
      fail(t.path + ".type", "Subset animation requires a Group");
    if (a.type === "ApplyWave" && (!pathObjects.includes(o.definition.type) || ["ImplicitFunction", "ArrowVectorField", "StreamLines", "Annulus", "RegularPolygram"].includes(o.definition.type)))
      fail(t.path + ".type", "ApplyWave requires a continuous vector path");
    if (a.type === "ApplyWave" && a.direction && (Math.hypot(...a.direction) === 0 || a.direction.slice(dim).some(v=>v!==0)))
      fail(t.path + ".direction", "Wave direction must be nonzero and within the space dimension");
    if (a.type === "GrowArrow" && !["Arrow", "DoubleArrow", "CurvedArrow", "CurvedDoubleArrow"].includes(o.definition.type))
      fail(t.path + ".type", "GrowArrow requires an arrow object");
    if (["GrowFromPoint", "GrowFromEdge", "SpinInFromNothing"].includes(a.type) && o.definition.type === "Group")
      fail(t.path + ".type", "This entrance requires drawable geometry; target individual group children");
    if (a.type === "GrowFromEdge" && ((dim < 3 && ["front", "back"].includes(a.edge)) || (dim === 1 && ["top", "bottom"].includes(a.edge))))
      fail(t.path + ".edge", "Edge is outside the space dimension");
    if (a.type === "GrowFromEdge" && ["Text", "MathTex", "DecimalNumber"].includes(o.definition.type))
      fail(t.path + ".type", "GrowFromEdge requires vector or mesh bounds");
    if (a.type === "GrowFromPoint") {
      if (a.point.length !== dim || a.point.some(v => typeof v !== "number"))
        fail(t.path + ".point", `Expected ${dim} numeric native coordinates`);
    }
    if (a.type === "ShowPassingFlash" && (!pathObjects.includes(o.definition.type) || ["ImplicitFunction", "ArrowVectorField", "StreamLines", "Annulus", "RegularPolygram"].includes(o.definition.type)))
      fail(t.path + ".type", "ShowPassingFlash requires a continuous vector path");
    if ((a.type === "Transform" || a.type === "ReplacementTransform") &&
      ["ImplicitFunction", "ArrowVectorField", "StreamLines", "Annulus", "RegularPolygram"].includes(o.definition.type))
      fail(t.path + ".type", "Disconnected paths do not support morphing");
    if (
      (a.type === "Create" ||
        a.type === "DrawBorderThenFill" ||
        a.type === "Uncreate" ||
        a.type === "Transform" ||
        a.type === "ReplacementTransform") &&
      !pathObjects.includes(o.definition.type) &&
      !(
        (a.type === "Create" || a.type === "Uncreate" || a.type === "DrawBorderThenFill") &&
        o.definition.type === "Group" &&
        descendants(o.id)
          .slice(1)
          .every(
            (id) =>
              objects.get(id)!.definition.type === "Group" ||
              pathObjects.includes(objects.get(id)!.definition.type),
          )
      )
    )
      fail(
        t.path + ".type",
        `${a.type} requires a vector path (glyph writing and surface morphing are unsupported)`,
      );
    if (
      a.type === "Transform" ||
      a.type === "ReplacementTransform" ||
      a.type === "MoveAlongPath"
    ) {
      const target = resolve(
        a.type === "MoveAlongPath" ? a.path : a.to,
        o.space.name,
        t.path + "." + (a.type === "MoveAlongPath" ? "path" : "to"),
      );
      if (!pathObjects.includes(target.definition.type))
        fail(t.path, "Expected a vector-path target");
      if (["ImplicitFunction", "ArrowVectorField", "StreamLines", "Annulus", "RegularPolygram"].includes(target.definition.type))
        fail(t.path, "Expected a continuous vector-path target");
      if (target.id === o.id) fail(t.path, "Object cannot target itself");
    }
    if (a.type === "MoveTo" || a.type === "Shift") {
      for (const [key, value] of Object.entries(a)) {
        if (["to", "from", "by"].includes(key)) {
          if ((value as unknown[]).length !== dim)
            fail(t.path + "." + key, `Expected ${dim} coordinates`);
          (value as (number | string)[]).forEach((v, i) => {
            if (typeof v !== "number")
              fail(
                `${t.path}.${key}[${i}]`,
                "Event coordinate endpoints must be numeric",
              );
          });
        }
      }
    }
    if (
      o.definition.type === "MathTex" &&
      ![
        "Add",
        "FadeIn",
        "FadeOut",
        "Blink",
        "MoveTo",
        "Shift",
        "Scale",
        "FadeToColor",
        "MoveAlongPath",
      ].includes(a.type)
    )
      fail(
        t.path + ".type",
        "MathTex supports addition, fades, color, movement and scale only",
      );
    if (o.definition.type === "Text" || o.definition.type === "DecimalNumber") {
      if (["ApplyMatrix", "Rotate", "Wiggle", "SpinInFromNothing"].includes(a.type))
        fail(
          t.path + ".type",
          "Text rotation and matrix deformation are not supported in Stage 1",
        );
    }
    if (a.type === "Rotate" && a.axis && Math.hypot(...a.axis) === 0)
      fail(t.path + ".axis", "Rotation axis cannot be zero");
    if (
      a.type === "ApplyMatrix" &&
      (a.matrix.length !== dim || a.matrix.some((r) => r.length !== dim))
    )
      fail(t.path + ".matrix", `Expected ${dim}×${dim} matrix`);
    const props =
      a.type === "Restore" ? ["position","scale","rotation","matrix","opacity","reveal","visible","color","geometry"]
      :      a.type === "Blink" ? ["opacity"]
      : ["AddTextLetterByLetter", "RemoveTextLetterByLetter", "AddTextWordByWord"].includes(a.type) ? ["geometry", "visible", "reveal", "opacity"]
      : ["ShowIncreasingSubsets", "ShowSubmobjectsOneByOne"].includes(a.type) ? ["visible"]
      :      a.type === "SpinInFromNothing"
        ? ["visible", "position", "scale", "rotation", "opacity", "reveal"]
        : ["GrowArrow", "GrowFromPoint", "GrowFromEdge"].includes(a.type)
          ? ["visible", "position", "scale", "opacity", "reveal"]
          : a.type === "DrawBorderThenFill" || a.type === "ShowPassingFlash"
            ? ["visible", "reveal", "opacity"]
            : a.type === "Add"
        ? ["visible", "opacity", "reveal"]
        : a.type === "Create" || a.type === "Uncreate"
          ? ["visible", "reveal", "opacity"]
          : a.type === "FadeIn" || a.type === "FadeOut"
            ? ["visible", "opacity", "reveal"]
            : a.type === "GrowFromCenter"
              ? ["visible", "scale", "opacity", "reveal"]
              : a.type === "MoveTo" ||
                  a.type === "Shift" ||
                  a.type === "MoveAlongPath"
                ? ["position"]
                : a.type === "Rotate" || a.type === "Wiggle"
                  ? ["rotation"]
                  : a.type === "Scale"
                    ? ["scale"]
                    : a.type === "FadeToColor"
                      ? ["color"]
                      : a.type === "Indicate"
                        ? ["color", "scale"]
                        : a.type === "ApplyMatrix"
                          ? ["matrix"]
                          : ["geometry"];
    t.writes = descendants(a.object).flatMap((id) =>
      props.map((p) => `${id}:${p}`),
    );
    if (a.type === "ReplacementTransform")
      t.writes.push(
        `${a.object}:visible`,
        `${a.to}:visible`,
        `${a.to}:geometry`,
      );
  }
  const transforms = ["position", "rotation", "scale", "matrix", "geometry"];
  for (let i = 0; i < tracks.length; i++)
    for (let j = i + 1; j < tracks.length; j++) {
      const a = tracks[i],
        b = tracks[j];
      if (b.start > a.start + a.duration) break;
      const overlap = a.start === b.start || b.start < a.start + a.duration;
      if (!overlap) continue;
      let conflict = a.writes.some((w) => b.writes.includes(w));
      if (
        "object" in a.event &&
        "object" in b.event &&
        a.event.object !== b.event.object
      ) {
        const related =
          descendants(a.event.object).includes(b.event.object) ||
          descendants(b.event.object).includes(a.event.object);
        if (
          related &&
          a.writes.some((w) => transforms.includes(w.split(":")[1])) &&
          b.writes.some((w) => transforms.includes(w.split(":")[1]))
        )
          conflict = true;
      }
      if (conflict) fail(b.path, `Overlapping property writers with ${a.path}`);
    }
  const end = Math.max(0, ...tracks.map((t) => t.start + t.duration));
  if (document.duration !== undefined && document.duration < end)
    fail("$.duration", "Duration ends before the event timeline");
  freeze(document);
  const result = Object.freeze({
    document,
    objects,
    tracks,
    duration: document.duration ?? end,
  });
  const initial = evaluateDocument(result, 0);
  if (initial.diagnostics.length)
    throw new SceneValidationError(initial.diagnostics);
  for (const track of tracks)
    if (
      ["Transform", "ReplacementTransform", "MoveAlongPath"].includes(
        track.event.type,
      )
    ) {
      try {
        evaluateDocument(result, track.start);
      } catch (e) {
        fail(
          track.path,
          `Invalid event endpoint: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  // Validate accumulated zoom, including hidden spaces, before a player can load it.
  for (const space of document.spaces) {
    const steps: import("./types.ts").CameraStep[] = [];
    for (const track of tracks) {
      const e = track.event;
      if (
        (e.type === "CameraZoom" || e.type === "CameraWindow" || e.type === "CameraMove" || e.type === "CameraOrbit") &&
        e.space === space.name
      ) {
        steps.push({ event: e, progress: 1 });
        try {
          evaluateCamera(space, steps, 1000, 1000);
        } catch (error) {
          fail(
            track.path,
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    }
  }
  return result;
}
