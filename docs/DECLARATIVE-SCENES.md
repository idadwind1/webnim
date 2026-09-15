# Declarative scenes, version 1

The document API is independent of the legacy command shell, lessons and React. It compiles JSON directly into parsed expressions, a reference graph and absolute-time event tracks. `evaluateDocument` is a headless function. `createPlayer` is a separate browser adapter.

```ts
import { compileScene, evaluateDocument } from "@axiom-math/engine/document";
import type { SceneDocument } from "@axiom-math/engine/document";

const document: SceneDocument = {
  version: 1,
  parameters: { amplitude: 1, along: 0.5 },
  spaces: [
    {
      name: "plane",
      type: "plane2d",
      theme: { background: "#ffffff", axes: "#555555", grid: "#dddddd" },
      objects: [
        {
          id: "curve",
          type: "FunctionGraph",
          expression: "amplitude * sin(x)",
          domain: [-5, 5],
        },
        {
          id: "point",
          type: "PointOnCurve",
          curve: "plane.curve",
          parameter: "along",
          drag: { parameter: "along", min: 0, max: 1 },
        },
        {
          id: "tangent",
          type: "Tangent",
          curve: "plane.curve",
          parameter: "along",
          length: 2,
        },
      ],
    },
  ],
  events: [
    { type: "Create", object: "plane.curve", start: 0, duration: 2 },
    {
      type: "AnimateParameter",
      parameter: "amplitude",
      to: 2,
      start: 2,
      duration: 3,
    },
  ],
};
const compiled = compileScene(document);
const frame = evaluateDocument(compiled, 3, { along: 0.7 });
```

All top-level and nested fields are validated. `SceneValidationError.diagnostics` contains `{path, message}` records with JSON paths. The schema is exported as `sceneSchemaV1`, available as `@axiom-math/engine/scene-v1.schema.json`, and checked in at `src/document/scene-v1.schema.json`. Its structural rules are supplemented by semantic validation: dimensions, references, dependency cycles, expressions, event capabilities and conflicting tracks.

## Browser player

```ts
import { createPlayer } from "@axiom-math/engine/browser";
import "@axiom-math/engine/browser/style.css"; // packaged KaTeX fonts and styles

// Give the container an explicit height.
const player = await createPlayer(container, {
  document,
  onEvent(event) {
    console.log(event);
  },
});
player.play();
player.pause();
player.seek(2.5);
player.setParameter("amplitude", 3);
player.clearParameterOverrides("amplitude"); // omit argument to clear all
player.resetCamera(); // optionally pass a space name
console.log(player.getCamera("plane"), player.getFrame());
const unsubscribe = player.on((event) => console.log(event));
await player.load(nextDocument);
unsubscribe();
player.dispose();
```

`load` validates and prepares the next document's renderers and math resources before swapping the current scene. A rejected load retains the current scene, camera, time and overrides. Concurrent loads use the most recent request. Disposal cancels pending loads, playback and observers and releases owned Canvas/WebGL resources. WebGL2 failures are explicit errors, including failures preparing a hidden 3D space.

`hover` and `click` events contain `object: 'space.id'` or `null`. `parameter` events report the parameter and its new value; dragging additionally reports the object. `time` events report playback/seek time. `error` reports runtime rendering failures. There is no automatic selection. Hover adds a transient highlight.

Canvas: drag empty space to pan, wheel to zoom about the pointer. Three.js: left drag orbits; right drag pans; wheel zooms. Each space retains its own explored camera. Navigation never advances or rewrites the clock. Bound-point dragging pauses playback and changes only the named runtime parameter; overrides survive seeking and remain until cleared or a new document loads.

## Spaces, coordinates and shared geometry

| Space type | Native tuple | Rendering                |
| ---------- | ------------ | ------------------------ |
| `axis1d`   | `[x]`        | Canvas                   |
| `plane2d`  | `[x,y]`      | Canvas                   |
| `polar2d`  | `[r,theta]`  | Canvas, polar grid       |
| `space3d`  | `[x,y,z]`    | Three.js, orbit controls |

Angles are radians. Coordinates are converted to Cartesian triples before object/group/space transforms. Function graphs explicitly describe Cartesian `y=f(x)`; polar graphs explicitly describe `r=f(theta)`, regardless of the containing 2D grid. Parametric expressions and authored coordinate tuples use their containing space's native convention. Primitive radii and lengths are Cartesian distances.

All four renderers consume the same frame representation: Cartesian triples, 4×4 matrices, vector paths, indexed triangle meshes and label anchors. `projectPoint` is also available headlessly for camera calculations. Rendering dependencies are absent from the compiler/evaluator imports.

Space options:

- `axes`: `true`, `false`, or an array such as `["x", "y"]` to hide the z axis. `ticks` and `grid` are booleans, defaulting to true.
- `camera.center`: Cartesian `[x,y,z]`; Canvas uses x/y. `camera.scale`: initial pixels per unit for orthographic views, default 60.
- 3D `camera.position`: default `[7,-9,7]`. `camera.projection`: `perspective` (3D default) or `orthographic`.
- `theme`: `background`, `foreground`, `axes`, `grid`, `objectColors`. Space theme overrides document theme. Explicit object colors win over the palette. Colors are `#rrggbb`.

Hiding an axis changes its display without deleting geometry. A singular matrix can flatten z or y coordinates while keeping the shared 3D representation. Animated camera alignment, arbitrary slicing planes, and animated axis visibility remain future extensions; the representation supports adding these without moving geometry between unrelated renderer formats.

## Objects

Every object has `id`, `type`, optional native `position` (translation) and `style`. Object IDs are unique within their space; every reference is qualified, including group children. Curve, group and animation-target references stay in the same space. Object scalar expressions can read point coordinates from any space.

### Connecting points across spaces

Use `spaceName.pointId.x`, `.y`, or `.z` in an object's scalar expressions to read a `Point` or `PointOnCurve` from any space. For example, this main-space line follows `controls.handle`:

```json
{
  "id": "connection",
  "type": "Line",
  "from": [0, 0],
  "to": ["controls.handle.x", "controls.handle.y"]
}
```

References work in point coordinates, line endpoints, graph expressions (such as `controls.handle.x * sin(x)`), dimensions, positions, and numeric labels. They update with dragging, parameter changes, and timeline seeking. The source space can be active, hidden, or displayed in PiP; no PiP is required, and declaration order does not matter.

Coordinates are Cartesian values after the source's object, group, and space transforms, before camera projection. A 1D point supplies zero y/z; a 2D point supplies zero z unless transformed into that dimension. Destination tuples still use their own space's native coordinate convention and undergo destination transforms. These are mathematical coordinate connections, not screen-space lines between viewports. Hidden points retain their coordinate values. Missing points, non-point sources, invalid components, and circular dependencies are rejected when compiling. This syntax is for object expressions, not event expressions.

Add an optional `caption` string to any object to show a hover tooltip in 1D, 2D, polar, or 3D views:

```json
{
  "id": "origin",
  "type": "Point",
  "at": [0, 0],
  "caption": "The origin: x = 0, y = 0."
}
```

Captions are plain text (including line breaks), not HTML or executable content. They follow the pointer without intercepting navigation. A group's caption provides a fallback for its children; a child's caption overrides it, and an empty string suppresses it. Objects without captions show no tooltip. The resolved caption is also available on each headless `ObjectFrame`.

Style fields: `color`, `opacity`, `fillOpacity`, `strokeWidth`, `pointSize`, `fontSize`. Opacity values are in [0,1]; widths and sizes are positive. Default point size is 5 pixels, path stroke width 2 pixels, font size 20 pixels, closed-path fill opacity .15. Three.js native lines currently use the platform's line width, usually one pixel. Meshes use their object's `opacity`.

| Type                       | Geometry fields                                               |
| -------------------------- | ------------------------------------------------------------- |
| `Point`                    | `at`, optional `drag`                                         |
| `Line`, `Arrow`            | `from`, `to`                                                  |
| `Polyline`, `Polygon`      | `points`                                                      |
| `RegularPolygon`           | `sides`, `radius` (1)                                         |
| `Star`                     | `tips`, `radius` (1), `innerRadius` (.5)                      |
| `Rectangle`, `Square`      | `width`, `height`; or `size` (defaults 1)                     |
| `Circle`, `Ellipse`        | `radius`; or `radiusX`, `radiusY` (defaults 1)                |
| `Arc`, `Sector`            | `radius` (1), `startAngle` (0), `angle` (π)                   |
| `Bezier`                   | `points`: 3n+1 cubic Bézier controls                          |
| `FunctionGraph`            | `expression`, `domain`, optional `samples` (256)              |
| `PolarGraph`               | `expression`, `domain`, optional `samples` (256)              |
| `ParametricCurve`          | native `expressions` tuple, `domain`, `samples` (256)         |
| `PointOnCurve`             | `curve` reference, `parameter`, optional `drag`               |
| `Tangent`                  | `curve`, `parameter`, `length` (2)                            |
| `Group`                    | `children` reference array; one parent per child              |
| `Text`, `MathTex`          | `text`; KaTeX math labels use packaged fonts                  |
| `DecimalNumber`            | `value` expression or number, `decimals` (2)                  |
| `Sphere`, `Cube`, `Cuboid` | `radius`; `size`; or `width`, `height`, `depth`               |
| `Cone`, `Cylinder`         | `radius` (1), `height` (2), centered on z                     |
| `Torus`                    | `radius` (1), `tubeRadius` (.3), around z                     |
| `Surface`                  | three `expressions`, `uRange`, `vRange`, `resolution` (32×32) |

`PointOnCurve.parameter` is normalized arc length [0,1] of the sampled path. It is not the graph's x coordinate or the curve's native u. `Tangent` estimates direction from nearby samples. Sampling accuracy is configurable for curves and surfaces; this is not a symbolic geometry kernel.

`drag: {parameter, coordinate?, min?, max?}` opts a point into constrained dragging. For `Point`, the specified native coordinate (default 0) must directly name the parameter. For `PointOnCurve`, its `parameter` field must directly name the bound parameter. Other coordinates may contain expressions of that parameter. Screen-space inversion follows the constraint rather than moving the point off the curve.

Geometry expressions are parsed once. Base geometry is cached by its expression inputs; dependencies reevaluate with their upstream geometry. Non-finite geometry at time zero rejects compilation. Later non-finite samples omit the affected object and appear in `frame.diagnostics`, allowing a user to change parameters or seek to a valid state.

## Mathematical expressions

Real expressions accept named parameters, global `t`, numbers, `pi`, `e`, parentheses, and `+ - * / ^`. Multiplication must be explicit. Functions: `sin cos tan asin acos atan sqrt abs exp log floor ceil`; binary `min max atan2`. Geometry-local names: `x` for FunctionGraph, `theta` for PolarGraph, `u` for ParametricCurve, `u,v` for Surface. Local/function/constant names cannot be parameter names. Only declared point components (`space.point.x/y/z`) are accepted as qualified names; arbitrary property access, executable callbacks and JavaScript are rejected.

Complex plane expressions accept `z`, `i`, `pi`, `e`, arithmetic and `exp log sqrt sin cos conj abs re im`. Complex `log`, `sqrt` and powers use principal branches. `abs`, `re`, `im` return real complex values. Named document parameters and global `t` are also available and remain live during the mapping. These mappings have no executable callbacks.

## Timeline semantics

One global clock advances every space, including hidden ones. The first space is initially active. `duration` defaults to the latest event endpoint; specify a duration for a time-dependent scene with no events. Times clamp to [0,duration].

Objects with entrance effects are hidden until their first entrance. Others are visible at zero. Exit effects hide until a later entrance, which restores their appearance. Replacement targets are initially hidden unless an earlier entrance explicitly reveals them.

All effects use seconds. Default `start` is 0; default `duration` is 1, except instantaneous `Add` and `SwitchSpace` (0). Easing: `linear` (default), `smooth`, `ease-in`, `ease-out`.

| Event                                        | Target and fields                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `Add`, `Create`, `Uncreate`, `FadeIn`, `FadeOut` | `object`                                                                      |
| `MoveTo`                                         | `object`, native numeric `to`, optional `from`; moves object center           |
| `Shift`                                          | `object`, native numeric `by`                                                 |
| `Rotate`                                         | `object`, `angle`, optional Cartesian `axis` (z)                              |
| `Scale`                                          | `object`, positive `factor`; centered on object bounds                        |
| `FadeToColor`                                    | `object`, `color`                                                             |
| `ApplyMatrix`                                    | `object`, native-dimension square numeric `matrix`                            |
| `MoveAlongPath`                                  | `object`, `path` reference; snapshots the path at effect start                |
| `Indicate`                                       | `object`, optional `color` (yellow), `factor` (1.2); returns to initial style |
| `Wiggle`                                         | `object`, optional `angle` (.15); returns to initial rotation                 |
| `GrowFromCenter`                                 | `object`; entrance centered on bounds                                         |
| `Transform`, `ReplacementTransform`              | `object`, `to` vector-path reference                                          |
| `AnimateParameter`                               | `parameter`, numeric `to`, optional `from`                                    |
| `SwitchSpace`                                    | `space`, `transition`: `cut` (default) or `fade`                              |
| `ApplySpaceMatrix`                               | `space`, dimension-sized square `matrix`                                      |
| `ApplyComplexFunction`                           | 2D `space`, complex `expression`                                              |

`Transform` retains the source identity; `ReplacementTransform` hides it and reveals the target on completion. Vector paths are resampled to equal lengths. Snapshot endpoints are reconstructed at each track's start from the preceding tracks, so a later morph cannot overwrite an earlier one. Overrides apply consistently to the full reconstructed timeline. Cross-space morphing, mesh morphing and glyph matching are rejected.

Simultaneous independent property writers are valid (e.g. Shift and FadeToColor). Overlapping writers of the same effective property are rejected, including group/child transforms and replacement visibility. Adjacent intervals are valid; two instantaneous writes at the same time conflict. Space transitions cannot overlap, nor can two simultaneous whole-space transformations. Object motion and whole-space transformation compose in that order.

Group transforms are inherited by children; a group's transform origin is its local origin. Group Create/Uncreate is supported when all drawable descendants are vector paths. MathTex supports Add, fades, movement, color, and scale; unsupported creation/glyph/deformation effects produce explicit errors. Text and numeric labels do not yet rotate or deform.

`SwitchSpace` uses one frame time for both layers. During a fade, the destination owns interaction even at the beginning. Per-space cameras survive switches and seeking.

### Composition

```json
{
  "type": "Succession",
  "start": 1,
  "events": [
    { "type": "Create", "object": "plane.curve", "duration": 2 },
    {
      "type": "EventGroup",
      "duration": 3,
      "events": [
        {
          "type": "Shift",
          "object": "plane.curve",
          "by": [1, 0],
          "duration": 1
        },
        {
          "type": "FadeToColor",
          "object": "plane.curve",
          "color": "#ff8800",
          "duration": 1
        }
      ]
    }
  ]
}
```

EventGroup children begin together plus their local `start` offsets. Succession children begin after the preceding child ends, plus their local offset. LaggedStart advances the child start by `lagRatio × preceding child duration` (default .1), plus that child's own offset. A composition's explicit duration scales all nested starts and durations proportionally. Conflicts are checked after flattening.

### Whole-space transformations

```json
[
  {
    "type": "ApplySpaceMatrix",
    "space": "plane",
    "matrix": [
      [1, 0.5],
      [0, 1]
    ],
    "start": 1,
    "duration": 2
  },
  {
    "type": "ApplyComplexFunction",
    "space": "plane",
    "expression": "z^2 / 3",
    "start": 4,
    "duration": 3
  }
]
```

Each mapping interpolates each current Cartesian point toward its mapped endpoint. Successive mappings compose, including axes and grid. Paths are subdivided before nonlinear mapping so a line can become a curve. Singular matrices are supported for dimension-flattening demonstrations:

```json
{
  "type": "ApplySpaceMatrix",
  "space": "solid",
  "matrix": [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 0]
  ],
  "start": 1,
  "duration": 2
}
```

This geometrically flattens z while keeping the orbit camera. A subsequent 3×3 matrix with only its x diagonal nonzero flattens to a line. Camera choreography and slicing are separate future features.

## Fixtures and verification

`fixtures/four-spaces.json` covers all spaces, parameters, constrained point, tangent, hidden progress, and timed fades. `fixtures/plane-transformations.json` demonstrates shear followed by a complex map. These documents belong to the engine and do not depend on the application demo.

Run `npm test` for headless and compatibility checks. Run `npm run build:fixtures`, then `node scripts/serve-fixtures.mjs` and visit `http://localhost:1431` for the engine's plain browser acceptance harness. Use “Run browser checks” for transactional loading, zoom anchoring, camera persistence, fades, resizing, overrides, WebGL failure and disposal checks; orbit and drag can also be exercised directly.

See [MANIM-COVERAGE.md](./MANIM-COVERAGE.md) for implemented features and later stages.


### Camera events

The canonical timeline key is `events`, including nested `EventGroup`, `Succession`, and `LaggedStart` children. The public type is `SceneEvent`; capabilities are `supportedEvents`. The compiler still accepts legacy `animations` and `AnimationGroup` JSON and normalizes them to the new names. Supplying both keys in one scope is rejected. The published schema describes canonical documents. Deprecated TypeScript aliases remain exported.

```json
{
  "version": 1,
  "spaces": [{"name": "plane", "type": "plane2d", "objects": []}],
  "events": [
    {"type": "CameraZoom", "space": "plane", "factor": 100, "start": 0, "duration": 2},
    {"type": "CameraWindow", "space": "plane", "x": [-5, 5], "y": [-3, 3], "start": 2, "duration": 1}
  ]
}
```

`CameraZoom` multiplies the framing scale relative to its evaluated starting state. Use `0.01` to zoom out 100×. Zoom interpolates geometrically, with optional `easing`. It works in all spaces; perspective 3D uses lens zoom while retaining orbit position and target.

`CameraWindow` fits Cartesian `x` and `y` bounds, preserving aspect ratio (the panel may show additional space on one axis). A 1D axis accepts only `x`. Polar windows use Cartesian bounds. 3D window framing is explicitly unsupported; use `CameraZoom` there. Duration zero applies either event immediately. Window center interpolates linearly and scale geometrically.

Camera events advance in hidden spaces and reconstruct on seek. Overlapping camera writers in one space are rejected. Exploration is an offset on top of authored framing and persists across switches and seeks. `resetCamera` clears this exploration and restores the authored camera at the current time. A window refits on resize. Orbit/alignment and projection-change events remain future work.

Headless frames expose `space.camera` steps; `evaluateCamera(spaceDefinition, frameSpace.camera, width, height)` resolves their center and scale for a viewport in CSS pixels without browser or rendering imports.

### Picture-in-picture objects

`PictureInPicture` is an object in a space's `objects` array. Its `space` field names the space shown inside the panel. Its ID is qualified by the containing space, just like every other object:

```json
{
  "version": 1,
  "spaces": [
    {"name":"main","type":"plane2d","objects":[
      {"type":"PictureInPicture","id":"detail","space":"solid","x":16,"y":16,"width":240,"height":180}
    ]},
    {"name":"solid","type":"space3d","objects":[{"type":"Cube","id":"cube"}]}
  ],
  "events": [
    {"type":"FadeIn","object":"main.detail","start":1,"duration":1},
    {"type":"FadeOut","object":"main.detail","start":5,"duration":1}
  ]
}
```

Supported PiP events are `Add`, `FadeIn`, and `FadeOut`, including event composition, easing, and repeated entrances/exits. With no entrance it is visible immediately; an entrance hides it until that event starts. Geometry transforms, `Create`/`Uncreate`, and membership in world-geometry groups are explicitly unsupported. The former standalone `PictureInPicture` event syntax has been replaced by this object form.

`x`, `y`, `width`, and `height` are CSS pixels relative to the player's top-left corner. Dimensions must be positive; world `position` is not accepted. Each view clips its own contents and the player clips panels extending outside its bounds. Objects later in document order stack above earlier ones. Multiple PiPs can display the same space with separate cameras. All four space types work inside panels.

PiPs appear only when their containing space is in the main view and inherit that space's transition opacity. Referenced space contents use the same global time and parameter overrides. Inset contents do not recursively embed their own PiPs, so self-references and mutual references cannot recurse. An inset opened at time 5 shows content evaluated at time 5.

Manual pan/zoom/orbit is independent per view and survives seeking. Authored camera windows fit each panel's dimensions. Hover, captions, clicks, and parameter-bound dragging work in panel-local coordinates. Dragging pauses the shared playback and changes the shared parameter.

Hover/click callbacks include the qualified PiP object ID, e.g. `pictureInPicture: "main.detail"`, plus the usual qualified inner `object` ID. `getPictureInPictureCamera("main.detail")` and `resetPictureInPictureCamera("main.detail")` address individual cameras; main-view camera methods remain separate. Resources are prepared transactionally on load and disposed on replacement or player disposal. Each 3D view consumes a WebGL context; practical view counts depend on the device.

`fixtures/four-spaces.json` includes two PiP objects in the plane with staggered fades, an outro, and a second entrance when the plane returns. `fixtures/picture-in-picture.json` shows a moving wave with two synchronized number-line insets and an independently orbitable cube.


### Green’s theorem demo

Run `npm run build:fixtures`, then `node scripts/serve-fixtures.mjs` from the engine folder. Open http://localhost:1431/#greens for the lesson, timeline, and live circulation/area values.

### All animations demo

Open http://localhost:1431/#animations (or choose **All animations**) for the full
135-second sequence covering every supported event and all four easing options.
Choose an entry in **Animation** to play only that chapter; **Replay animation**
repeats it and **Play** continues through the sequence. The editable document is
`fixtures/all-animations.json`; chapter labels and timing live in
`fixtures/all-animations.chapters.json`. Regenerate both with
`node scripts/create-animation-demo.mjs`. The demo uses six Canvas spaces and
does not require WebGL.

### Optional graph domains

Graph `domain` fields are optional. The Canvas player re-samples fully revealed
`FunctionGraph` objects over the visible window, respecting any explicit domain.
It refines curves to screen-space error with a bounded sampling budget, breaks
unresolved discontinuities, and caches samples until the view or object changes.
Nonlinear space maps use the same bounded source-coverage estimate as the grid;
arbitrary non-invertible maps cannot guarantee complete coverage.

Deterministic document evaluation, curve-dependent objects, 3D rendering, and
partially revealed Create/Uncreate animations retain the base samples:
`FunctionGraph` uses `[-10, 10]`, `PolarGraph` uses `[0, 2*pi]`, and
`ParametricCurve` uses `[0, 1]` when the domain is omitted. Explicit domains
also define that base interval. Natural mathematical domains are not inferred;
use explicit bounds for functions such as `sqrt(x)` whose base samples would
otherwise be invalid.

Canvas wheel zoom has no fixed pixels-per-unit cap. It stops before viewport
bounds overflow or coordinate rounding exceeds a fraction of a screen pixel.
Grid spacing follows the scale, with bounded iteration even at extreme values.
Zoom easing remains on demand; expensive redraws use the existing direct-zoom
fallback. This does not change the Three.js orbit camera or its clipping planes.

```json
{"id":"wave","type":"FunctionGraph","expression":"sin(x)"}
```


## Additional geometry and fields

These object types use the same styles, live scalar expressions, cross-space point references, and lifecycle events as other objects. See `fixtures/manim-additions.json` or the browser harness **Manim additions** button. Play or seek to 6 seconds for fields, 12 seconds for tracing, and 21 seconds for the 3D vector-field chapter.

| Type | Fields and behavior |
| --- | --- |
| `DoubleArrow` | `from`, `to`; arrowheads at both ends |
| `DashedLine` | `from`, `to`, optional `dashLength` (0.2 world units), `dashRatio` (0.5, strictly between 0 and 1) |
| `ArcBetweenPoints`, `CurvedArrow`, `CurvedDoubleArrow` | `from`, `to`, optional signed `angle` (π/2). Zero gives a straight segment; magnitude must be below 2π; endpoints must differ. In 3D the chord determines a plane using an XY-perpendicular direction, with an X fallback for a vertical chord. |
| `Angle` | `from`, `vertex`, `to` define two rays; `radius` (0.5), optional `otherAngle` chooses the reflex arc |
| `RightAngle` | Same ray coordinates, `size` (0.25). Rays must be nonzero and perpendicular. |
| `Triangle` | Equilateral, `radius` (1) measured from center to vertices |
| `RoundedRectangle` | `width`, `height` (1), optional `cornerRadius` (min(0.2, half-width, half-height)); radius must fit inside the rectangle |
| `ImplicitFunction` | `expression` describing f(x,y)=0, `xRange`, `yRange`, `resolution` (64; 4–256). Marching squares in Cartesian coordinates; cells with non-finite samples are skipped. |
| `ArrowVectorField` | Cartesian `expressions` tuple, `xRange`, `yRange`, `spacing` (1), optional `zRange` (3D only), `lengthScale` (0.6), `maxLength` (0.8×spacing). Without zRange, sampled on the z=0 plane; with zRange, sampled throughout the volume. At most 4096 arrows total; zero/non-finite vectors are skipped. |
| `StreamLines` | Cartesian `expressions` tuple, Cartesian `seeds`, integration `step` (0.04), `steps` (256). Fourth-order Runge–Kutta, with the field frozen at the current scene time; at most 100000 total integration steps. Stops at stationary/non-finite results. |
| `TracedPath` | Qualified `point` reference to a Point or PointOnCurve in any space, `start` (0), optional trailing-window `duration`, `samples` (256). Samples historical source positions after source transforms and before cameras. |

Field expressions have local `x`, `y`, `z` names. Implicit curves require 2D; fields/streamlines accept 2D or 3D. Field sampling coordinates remain Cartesian even in a polar space. Traces apply the current parameter overrides to every sampled historical time; they are deterministic on seek and do not store a history of mouse gestures. Destination object/group/space transforms apply after trace generation.

Disconnected contours, field arrows and streamlines retain separate strokes in Canvas and Three.js and support Create/Uncreate/fades. They cannot currently be used as a PointOnCurve/Tangent/MoveAlongPath target or morphed; that requires selecting one continuous component. Dashes are split in world coordinates after transforms, with at most 2048 dash periods per line to bound extreme-input rendering work. Three.js batches field shafts and wire arrowheads; individual Arrow/DoubleArrow heads use cones.


## Additional entrance and stroke animations

All six events are demonstrated in the **All animations** selector. They accept ordinary `object`, `start`, `duration`, and `easing` fields, work with arbitrary seeking, and participate in the compiler's property-conflict checks.

| Event | Fields and behavior |
| --- | --- |
| `GrowArrow` | Arrow, DoubleArrow, CurvedArrow or CurvedDoubleArrow grows from its stationary first endpoint, including its arrowheads. |
| `GrowFromPoint` | Required numeric native `point` tuple. Geometry expands from this point into its original position. For grouped objects the point is in parent coordinates. |
| `GrowFromEdge` | Required `edge`: `left`, `right`, `top`, `bottom`, `front` (+z), or `back` (−z). Grows from the center of that side of the object's bounding box at event start. Only edges supported by the space dimension are accepted. |
| `SpinInFromNothing` | Optional `angle` (2π). Starts scaled to zero and rotated by this angle, then unwinds to the original orientation while growing about the object's center. |
| `DrawBorderThenFill` | First half of eased progress draws the outline with no fill; second half keeps the complete outline and increases fill opacity. Applies to vector paths and groups containing only vector paths. |
| `ShowPassingFlash` | Optional `timeWidth` (0.2, greater than 0 and at most 1), the fraction of path length occupied by the moving stroke. No fill or arrowheads; disappears at completion. Use a separately authored overlay object to preserve an underlying shape. |

These are entrance events: the target is hidden before its first entrance. Add/FadeIn can reveal it again after a flash. New growth events target individual drawable objects rather than Group objects; GrowFromEdge requires vector/mesh bounds, and SpinInFromNothing excludes text labels. MathTex retains its documented movement/fade/scale restrictions. Growth anchors are sampled at event start. ShowPassingFlash requires a continuous path; sampled function graphs use their base domain during the flash rather than adaptive viewport sampling.

Frames may expose `fillReveal`, `strokeRange`, and `arrowScale` for these effects. Custom renderers should use `fillReveal ?? reveal` for interior opacity, clip strokeRange by arc length without closing the clipped segment, and scale arrowheads with arrowScale. Existing Create/Uncreate behavior is unchanged.

## More geometry, layouts and animation

### Geometry

- `Annulus {radius:1, innerRadius:0.5}` and `AnnularSector` (also `startAngle`, `angle`) preserve the hole in Canvas filling/picking and Three.js triangles. Radii must satisfy `0 < innerRadius < radius`; a sector has a nonzero sweep of at most one turn.
- `Elbow {width:0.25, angle:0}`; `RegularPolygram {sides:5, step:2, radius:1}` draws closed stroke cycles. Polygram fills and continuous-path operations are not supported.
- `ConvexHull {points:[...]}` computes a 2D hull, discarding interior/duplicate points. `ConvexHull3D` accepts 4–64 points and merges coplanar faces.
- `Icosahedron` and `Dodecahedron` use a circumradius `radius` (default 1). `Polyhedron {points, faces}` accepts a closed shell of planar convex faces, each described by vertex indices. Invalid, flat, open or nonconvex faces are rejected.
- `SurroundingRectangle`, `BackgroundRectangle`, and `Brace` take a same-space `target` pointing to a 2D path or point. They follow its evaluated bounds, with `padding` default 0.15. Braces add `side` (default `bottom`) and `depth` (default 0.2). Background rectangles default to full fill opacity; declare them before the foreground object. Text measurement, group bounds and ArcBrace are not implemented.

### Matrices, charts and graphs

These `plane2d` layouts compile into an ordinary Group and stable child objects. The compiled document contains the expanded form and remains serializable. Table objects are intentionally out of scope.

```json
{"id":"m","type":"Matrix","entries":[["x","y"],["z","1"]],"cellWidth":1.5,"cellHeight":0.8}
```

`Matrix` uses KaTeX strings. `DecimalMatrix` accepts scalar expressions and `decimals` (default 2); `IntegerMatrix` displays zero decimal places. Rows must be rectangular, with at most 32 rows/columns and 512 cells. Font size remains a display setting; choose cell dimensions to accommodate your content. Children use IDs such as `m_cell_0_0`, `m_left_bracket` and `m_right_bracket`.

`BarChart {values:[1,-2,"a"], labels:["A","B","C"], barWidth:0.7, gap:0.3}` creates signed bars around a zero baseline. Zero bars have a negligible height. Labels are optional; axes are authored separately. Bar IDs are `id_bar_0`, etc.

`SampleSpace {probabilities:[0.25,0.75], labels:["A","B"], width:6, height:2}` creates horizontal partitions. Probabilities must be positive and sum to one.

`Graph` and `DiGraph` accept `vertices:["a","b"]`, `edges:[["a","b"]]`, optional `layout:"circle"|"line"`, `radius`, `labels`, and optional complete `positions:{"a":[0,0],"b":[2,1]}`. Vertex/edge IDs are `id_vertex_a` and `id_edge_0`. Edges use the declared layout; separately moving a vertex does not relayout its edges. Self loops and automatic force layout are not implemented. Qualified references can read generated vertex points. Child IDs must not collide with authored object IDs.

### Text, choreography and deformation

- `AddTextLetterByLetter`, `RemoveTextLetterByLetter` and `AddTextWordByWord` target plain Text. Grapheme segmentation keeps combined emoji and accents intact. These reveal whole characters/words, not glyph strokes.
- `ShowIncreasingSubsets` reveals Group children in order; `ShowSubmobjectsOneByOne` leaves only the most recently revealed child visible, including at completion.
- `Blink {count:1}` temporarily dims opacity. `ApplyWave {amplitude:0.3, waves:1, direction:[0,1,0]}` temporarily deforms a continuous vector path and restores it at completion.
- `Homotopy {expressions:["x","y+alpha*sin(x)"]}` evaluates a local Cartesian map with `alpha` running from 0 to 1. Supply an identity map at alpha 0 for a continuous entrance.
- `ApplyPointwiseFunction {expressions:["x","y+x*x"]}` interpolates from the original path to the mapped path.
- `PhaseFlow {expressions:["-y","x"], virtualTime:3.14, steps:128}` integrates a local vector field using fixed-step RK4. `steps` is capped at 512; paths use 128 samples. `virtualTime` defaults to event duration and can be negative. Parameters are frozen at event start; `t` is integration time. Completed deformation results are cached. These mappings accept points/continuous paths, not groups, labels, images, meshes or disconnected contours.
- `Restore {at:0}` restores an explicit historical snapshot; `at` must not exceed the event start. Positions/colors/opacity and matrix elements interpolate; compatible paths morph, other geometry switches at completion. This is a deterministic snapshot, not a mutable save-state stack.
- `Swap {to:"s.other"}` exchanges the centers of two drawable siblings. `FadeTransform {to:"s.other"}` crossfades source into destination and transfers visibility. It does not match glyphs or morph geometry.
- `LaggedStartMap {objects:["s.a","s.b"], animation:{type:"Shift",by:[0,2],duration:1}, lagRatio:0.5}` expands one event template into a staggered composition. The outer duration can rescale the composition.

### Camera and easing

`CameraMove {space:"solid", position:[7,-5,3], center:[0,0,1]}` interpolates position and look-at center in `space3d`. Paths crossing the look-at center are rejected. `CameraOrbit {space:"solid", angle:3.14, axis:[0,0,1]}` rotates the viewpoint around its center (default axis z). Interactive camera offsets remain available; animated roll and projection switching are not implemented.

`easingNames` exports 23 bounded curves: the original `linear`, `smooth`, `ease-in`, `ease-out`; `smoother`; and the `sine`, `cubic`, `quart`, `quint`, `expo`, `circ` families with `-in`, `-out`, `-in-out`. `easeProgress` evaluates these independently of rendering.

### Raster images

`ImageMobject {source:"./picture.png", width:2, height:2}` displays an image in `plane2d`. Width and height are explicit world dimensions; intrinsic image size does not determine aspect ratio. The player preloads resources before replacing the current scene. HTTP(S), relative image URLs and PNG/JPEG/WebP/GIF data URLs are accepted; executable URL schemes are rejected. At most 256 unique sources and 64 million decoded pixels are permitted.

`ImageSequence {sources:["./a.png","./b.png"], fps:12, start:0, loop:false, width:2, height:2}` selects frames from scene time. It holds the first frame before start and the last frame after completion unless looping. Browser resource caching handles repeated image sources. Images support affine 2D positioning/rotation/scaling and fading; 3D image planes and pixel deformation are not implemented.


### Boolean paths and animated boundaries

`Union`, `Difference`, `Intersection`, and `Exclusion` take `operands:["s.a","s.b"]` (2–32 references to closed paths in `plane2d`). Difference subtracts subsequent operands from the first. Operands retain their visibility; set their opacity to zero if only the result should be visible. The result follows evaluated operand geometry, preserves disconnected polygons and holes, and can be empty. Curves use their sampled outlines. Limits are 8192 input vertices and 16384 output vertices. Continuous-path morph/follow operations reject these potentially disconnected results.

`ArcPolygon {points:[[0,0],[2,0],[1,2]], angles:[0,0.5,0.5]}` joins each vertex to the next with its signed arc sweep. Omitted angles give straight edges. There must be one angle per edge, with absolute sweep below one turn; up to 128 vertices are accepted.

`AnimatedBoundary {target:"s.shape", period:2, timeWidth:0.25, colors:["#58a6ff","#75dda5"]}` draws a repeating stroke window over a continuous path and interpolates its color each cycle. It leaves the source visible, follows its current geometry, and uses scene time so seeking is deterministic. No animation work runs while the player is paused.


### Cyclic replacement and complex homotopy

```json
{"type":"CyclicReplace","objects":["s.a","s.b","s.c"],"start":1,"duration":2,"easing":"smooth"}
```

Each object moves to the next object's center as it was at the event start; the last moves to the first. Targets must be distinct drawable siblings in the same space. Two targets act like `Swap`. IDs, shape, color and visibility are preserved. A simultaneous position writer on any target is rejected. Groups themselves are not targets, but drawable children of one transformed group are supported.

```json
{"type":"ComplexHomotopy","object":"s.curve","expression":"z + 0.25*alpha*z^2","duration":2}
```

This maps the local Cartesian point `(x,y)` to complex `z=x+iy` in `plane2d`. `alpha` is eased event progress, `t` is event-start time plus eased elapsed duration, and named parameters are sampled at the event start. The existing safe complex parser supports principal branches; executable code and arbitrary property access remain rejected. Supply an identity map at alpha zero for a continuous start. Points and continuous paths are supported; paths use 128 samples. Disconnected contours, meshes, images, labels and groups are rejected. Non-finite results hide the object and produce a frame diagnostic. Repeated seeking and parameter overrides reuse the deterministic deformation cache.


## Emphasis overlays and copying transforms

These events appear in **All animations** and support deterministic seeking.

- `Flash {object:"s.shape", radius:0.3, lineLength:0.3, numLines:12}` emits radial strokes around the target. `numLines` must be an integer from 2 to 64.
- `FocusOn {object:"s.shape", radius:3}` shrinks a translucent circle onto the target.
- `Circumscribe {object:"s.shape", padding:0.15}` draws and fades a rectangle around its geometric bounds.

All three accept an optional hex `color` (default `#f4b66b`). They follow the live target in `plane2d`, preserve its state, and can run alongside its movement. Targets must be individual drawables; Circumscribe excludes text because measured glyph bounds are unavailable. Distances are Cartesian space units before space transforms.

`TransformFromCopy {object:"s.source", to:"s.destination"}` morphs a temporary copy between continuous vector paths in the same space, including 3D. It snapshots both paths at event start, preserves the source, and hides the destination until completion. Different parent groups are allowed. The source may animate independently; overlapping writes to the destination are rejected. Text, meshes, groups and disconnected paths are unsupported.

Temporary frames have synthetic IDs and `interactive:false`. Custom renderers should draw them without picking or dragging them, and release their resources when the frames disappear after completion or seeking.
