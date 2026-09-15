# Manim reference coverage

Baseline: Manim Community v0.21.0 [mobjects reference](https://docs.manim.community/en/stable/reference_index/mobjects.html) and [animation reference](https://docs.manim.community/en/stable/reference_index/animations.html), inspected 2026-09-09. This tracks declarative TypeScript equivalents, not Python compatibility. “Supported” means the documented JSON behavior works; it does not imply identical Manim rendering or every constructor argument.

| Manim feature / family                                             | Status    | JSON equivalent or difference                                                               |
| ------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------- |
| NumberLine, UnitInterval                                           | Supported | `axis1d`; native one-coordinate objects                                                     |
| Axes, NumberPlane                                                  | Supported | `plane2d`, axes/ticks/grid/camera/theme                                                     |
| PolarPlane                                                         | Supported | `polar2d`, radians, native polar tuples                                                     |
| ThreeDAxes                                                         | Supported | `space3d`, perspective/orthographic orbit camera                                            |
| Dot, Dot3D                                                         | Supported | `Point`; opt-in parameter dragging                                                          |
| Line, Line3D, Arrow, Arrow3D                                       | Supported | `Line`, `Arrow`; native coordinate dimension                                                |
| Polygon, Polyline                                                  | Supported | Explicit vertices                                                                           |
| RegularPolygon, Star                                               | Supported | Sides/tips and radii                                                                        |
| Rectangle, Square                                                  | Supported | Width/height/size                                                                           |
| Circle, Ellipse, Arc, Sector                                       | Supported | Sampled paths; no symbolic intersections                                                    |
| CubicBezier                                                        | Supported | `Bezier`, chained cubic control points                                                      |
| FunctionGraph                                                      | Partial   | Parsed expression, finite domain, configurable sampling; non-finite samples diagnosed       |
| ParametricFunction                                                 | Supported | `ParametricCurve`, 1D/2D/polar/3D native expressions                                        |
| Polar functions                                                    | Supported | `PolarGraph`                                                                                |
| TangentLine, point from proportion                                 | Partial   | Typed `Tangent`/`PointOnCurve`, numerical sampled arc length                                |
| Group, VGroup                                                      | Partial   | Qualified children, one parent, inherited transforms; local-origin group transforms         |
| Text                                                               | Partial   | Browser text with movement/fade/scale; rotation/deformation rejected                        |
| Tex, MathTex                                                       | Partial   | KaTeX; movement/fade/scale only; no system LaTeX compiler                                   |
| DecimalNumber, Integer, Variable                                   | Partial   | `DecimalNumber` bound to expression; choose decimal precision                               |
| Sphere, Cube, Prism                                                | Supported | `Sphere`, `Cube`, `Cuboid`, triangle meshes                                                 |
| Cone, Cylinder, Torus                                              | Supported | Triangle meshes, z-oriented                                                                 |
| Surface                                                            | Supported | 3 parsed expressions, u/v ranges and mesh resolution                                        |
| Add                                                                | Supported | Instantaneous entrance                                                                      |
| Create, Uncreate                                                   | Partial   | Vector paths/path-only groups; no text/mesh clipping masquerading as writing                |
| FadeIn, FadeOut                                                    | Supported | Persistent entrance/exit semantics                                                          |
| MoveToTarget / .animate.move_to                                    | Supported | `MoveTo`, object center                                                                     |
| .animate.shift, Rotate, Rotating, ScaleInPlace                     | Partial   | Shift/Rotate/Scale; restricted label combinations                                           |
| FadeToColor                                                        | Supported | Hex color interpolation                                                                     |
| ApplyMatrix                                                        | Supported | Object matrix or whole-space `ApplySpaceMatrix`                                             |
| ApplyComplexFunction                                               | Partial   | Whole 2D space, safe complex arithmetic and principal branches                              |
| MoveAlongPath                                                      | Supported | Path endpoint snapshot; normalized arc-length movement                                      |
| Indicate, Wiggle                                                   | Supported | Temporary style/scale/rotation emphasis                                                     |
| GrowFromCenter                                                     | Supported | Centered entrance                                                                           |
| Transform, ReplacementTransform                                    | Partial   | Vector-path resampling, deterministic repeated morphs; no surfaces/text/cross-space morphs  |
| AnimationGroup, Succession, LaggedStart                            | Supported | Nested absolute-time compilation, duration scaling and conflicts                            |
| ValueTracker, ChangeDecimalToValue                                 | Partial   | Named parameters, `AnimateParameter`, numeric labels                                        |
| Wait                                                               | Supported | Timeline gaps and explicit document duration                                                |
| Scene changes                                                      | Supported | `SwitchSpace`, cut/fade, single clock, destination interaction                              |
| Free camera exploration                                            | Supported | Independent per-space pan/zoom/orbit; no automatic selection                                |
| Animated camera, MovingCamera, ThreeDCamera choreography           | Partial   | CameraZoom (all spaces), CameraWindow (1D/2D); projection/alignment planned                                 |
| Coordinate slicing / partial derivative cross-sections             | Planned   | Declarative constraints/slicing planes; axis visibility is already configurable             |
| BarChart, SampleSpace, probability diagrams                        | Planned   | Later-stage charts                                                                          |
| Table, MathTable, DecimalTable, MobjectTable                       | Planned   | Later-stage structured tables                                                               |
| Matrix, DecimalMatrix, IntegerMatrix, MobjectMatrix                | Planned   | Later-stage matrix layout                                                                   |
| Graph, DiGraph, layout functions                                   | Planned   | Declarative graph layouts                                                                   |
| ArrowVectorField, StreamLines | Partial | Cartesian fields, bounded grids and RK4 streamlines; no component morphing |
| TracedPath | Supported | Deterministic historical point samples and optional trailing time window |
| AnimatedBoundary | Planned | Animated boundary emphasis |
| ImplicitFunction | Partial | Bounded 2D marching squares; disconnected contour components |
| ArcBetweenPoints | Supported | Signed circular sweep between endpoints |
| Annulus, AnnularSector, ArcPolygon | Planned | Additional geometry |
| DashedLine, DoubleArrow, CurvedArrow, CurvedDoubleArrow | Supported | World-space dashes and endpoint arrowheads in Canvas/Three.js |
| Angle, RightAngle | Supported | Ray-defined markers, live coordinate references, perpendicularity validation |
| Elbow, labeled geometry | Planned | Additional geometry helpers |
| RoundedRectangle, Triangle | Supported | Rounded corners and equilateral triangle |
| RegularPolygram, ConvexHull | Planned | Additional polygon helpers |
| Union, Difference, Intersection, Exclusion                         | Planned   | Geometry boolean operations                                                                 |
| Brace, ArcBrace, surrounding/background rectangles                 | Planned   | Declarative geometry/layout equivalents                                                     |
| ComplexPlane, nonlinear/log scales                                 | Partial   | Complex transforms supported; alternate axis scale systems planned                          |
| ShowPassingFlash | Supported | Temporary moving arc-length stroke window; source hidden after completion |
| Flash, FocusOn, Circumscribe, ApplyWave, Blink | Planned | Richer indication |
| GrowArrow, GrowFromEdge, GrowFromPoint, SpinInFromNothing | Partial | Anchored drawable-object growth and centered spin; new growth events exclude groups, and label restrictions apply |
| DrawBorderThenFill | Supported | Separate outline and fill phases; supports vector-path groups |
| ShowIncreasingSubsets, ShowSubmobjectsOneByOne | Planned | Subobject choreography |
| Write, Unwrite, AddTextLetterByLetter, word writing                | Planned   | Actual glyph-level geometry; explicitly unsupported today                                   |
| TransformMatchingTex, TransformMatchingShapes                      | Planned   | Matching/glyph correspondence                                                               |
| Homotopy, ComplexHomotopy, PhaseFlow                               | Planned   | Declarative general deformation                                                             |
| ApplyFunction, ApplyMethod, ApplyPointwiseFunction                 | Planned   | Safe declarative equivalents, never executable JSON callbacks                               |
| Restore, Swap, CyclicReplace, TransformFromCopy, FadeTransform     | Planned   | Additional state/transform primitives                                                       |
| ChangeSpeed, arbitrary rate functions                              | Partial   | Four built-in easings; richer declarative time warps planned                                |
| LaggedStartMap                                                     | Planned   | Declarative target-list expansion                                                           |
| Polyhedron, Dodecahedron, Icosahedron, ConvexHull3D                | Planned   | Advanced 3D primitives                                                                      |
| Code, markup/paragraph/title/bulleted text, Typst                  | Planned   | Structured text/layout adapters                                                             |
| ImageMobject and image sequences                                   | Planned   | Resource declarations and preload policy                                                    |
| SVG import, SVGMobject, VMobjectFromSVGPath                        | Excluded  | Explicitly outside project scope                                                            |
| Executable Python/JavaScript callbacks, arbitrary updaters         | Excluded  | No executable code in scene JSON; typed dependencies/expressions replace callback use cases |
| Manim Python script compatibility, Python CLI, video pipeline      | Excluded  | Browser-native interactive TypeScript engine                                                |

| Picture-in-picture multi-view composition (engine extension) | Supported | PiP objects with Add/FadeIn/FadeOut, absolute-pixel insets, shared clock and independent cameras |

## Rendering differences

All geometry is evaluated headlessly into Cartesian 3D triples. Canvas and Three.js are rendering adapters over that common representation, and the player composites space fades. Mesh normals are recomputed by the 3D adapter; math labels are DOM/KaTeX overlays. Geometry is sampled, including morph endpoints, tangents and nonlinear maps. Three.js native line width may be limited by WebGL. None of these are advertised as glyph-level Manim equivalence.
