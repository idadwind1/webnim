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
| FunctionGraph | Supported | Optional domain, adaptive viewport sampling and discontinuity breaks |
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
| Animated camera, MovingCamera, ThreeDCamera choreography | Partial | CameraZoom, CameraWindow, CameraMove and CameraOrbit; no animated roll or projection switching |
| Coordinate slicing / partial derivative cross-sections             | Planned   | Declarative constraints/slicing planes; axis visibility is already configurable             |
| BarChart, SampleSpace, probability diagrams | Partial | Signed bars and labeled probability partitions; no automatic axes or nested conditional diagrams |
| Table, MathTable, DecimalTable, MobjectTable | Excluded | Removed from scope at user request |
| Matrix, DecimalMatrix, IntegerMatrix, MobjectMatrix | Partial | Fixed-cell matrix layout, KaTeX and dynamic numeric entries; MobjectMatrix remains planned |
| Graph, DiGraph, layout functions | Partial | Circle, line and explicit 2D layouts; static edges, no force layout or self loops |
| ArrowVectorField, StreamLines | Partial | Cartesian fields, bounded grids and RK4 streamlines; no component morphing |
| TracedPath | Supported | Deterministic historical point samples and optional trailing time window |
| AnimatedBoundary | Supported | Repeating stroke window and color cycling on a referenced continuous path |
| ImplicitFunction | Partial | Bounded 2D marching squares; disconnected contour components |
| ArcBetweenPoints | Supported | Signed circular sweep between endpoints |
| Annulus, AnnularSector, ArcPolygon | Supported | Hole-preserving annular paths and per-edge signed arc sweeps |
| DashedLine, DoubleArrow, CurvedArrow, CurvedDoubleArrow | Supported | World-space dashes and endpoint arrowheads in Canvas/Three.js |
| Angle, RightAngle | Supported | Ray-defined markers, live coordinate references, perpendicularity validation |
| Elbow, labeled geometry | Partial | Elbow supported; labels can be composed separately |
| RoundedRectangle, Triangle | Supported | Rounded corners and equilateral triangle |
| RegularPolygram, ConvexHull | Partial | Stroke-only polygrams, planar convex hull; no self-intersecting polygram fill |
| Union, Difference, Intersection, Exclusion | Supported | Bounded polygon clipping with disconnected components and hole triangulation; sampled curved boundaries |
| Brace, ArcBrace, surrounding/background rectangles | Partial | 2D path/point bounds, Brace, SurroundingRectangle, BackgroundRectangle; no ArcBrace or measured text bounds |
| ComplexPlane, nonlinear/log scales                                 | Partial   | Complex transforms supported; alternate axis scale systems planned                          |
| ShowPassingFlash | Supported | Temporary moving arc-length stroke window; source hidden after completion |
| Flash, FocusOn, Circumscribe, ApplyWave, Blink | Partial | ApplyWave/Blink and temporary 2D Flash/FocusOn/Circumscribe overlays; no group or measured text outlines |
| GrowArrow, GrowFromEdge, GrowFromPoint, SpinInFromNothing | Partial | Anchored drawable-object growth and centered spin; new growth events exclude groups, and label restrictions apply |
| DrawBorderThenFill | Supported | Separate outline and fill phases; supports vector-path groups |
| ShowIncreasingSubsets, ShowSubmobjectsOneByOne | Supported | Ordered group children, including nested descendants |
| Write, Unwrite, AddTextLetterByLetter, word writing | Partial | Unicode grapheme reveal/removal and AddTextWordByWord; actual glyph stroke writing remains planned |
| TransformMatchingTex, TransformMatchingShapes                      | Planned   | Matching/glyph correspondence                                                               |
| Homotopy, ComplexHomotopy, PhaseFlow | Partial | Safe Cartesian/complex homotopies and deterministic RK4 PhaseFlow on points/continuous paths; no mesh or label deformation |
| ApplyFunction, ApplyMethod, ApplyPointwiseFunction | Partial | ApplyPointwiseFunction uses safe Cartesian expressions; executable callbacks stay excluded |
| Restore, Swap, CyclicReplace, TransformFromCopy, FadeTransform | Partial | Snapshot Restore, sibling Swap/CyclicReplace, crossfade FadeTransform and continuous-path TransformFromCopy |
| ChangeSpeed, arbitrary rate functions | Partial | 23 bounded built-in easing curves; custom time warps remain planned |
| LaggedStartMap | Supported | Declarative target-list expansion with one shared animation template |
| Polyhedron, Dodecahedron, Icosahedron, ConvexHull3D | Supported | Closed convex-face shells, Platonic meshes and bounded 64-point spatial hulls |
| Code, markup/paragraph/title/bulleted text, Typst                  | Planned   | Structured text/layout adapters                                                             |
| ImageMobject and image sequences | Partial | Preloaded 2D ImageMobject/ImageSequence, affine transforms and deterministic frames; no 3D textured images |
| SVG import, SVGMobject, VMobjectFromSVGPath                        | Excluded  | Explicitly outside project scope                                                            |
| Executable Python/JavaScript callbacks, arbitrary updaters         | Excluded  | No executable code in scene JSON; typed dependencies/expressions replace callback use cases |
| Manim Python script compatibility, Python CLI, video pipeline      | Excluded  | Browser-native interactive TypeScript engine                                                |

| Picture-in-picture multi-view composition (engine extension) | Supported | PiP objects with Add/FadeIn/FadeOut, absolute-pixel insets, shared clock and independent cameras |

## Rendering differences

All geometry is evaluated headlessly into Cartesian 3D triples. Canvas and Three.js are rendering adapters over that common representation, and the player composites space fades. Mesh normals are recomputed by the 3D adapter; math labels are DOM/KaTeX overlays. Geometry is sampled, including morph endpoints, tangents and nonlinear maps. Three.js native line width may be limited by WebGL. None of these are advertised as glyph-level Manim equivalence.
