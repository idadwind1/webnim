/** Serializable scene language v1. All angles are radians and times are seconds. */
export type Scalar = number | string;
export type Coordinate = [Scalar] | [Scalar, Scalar] | [Scalar, Scalar, Scalar];
export type Vec3 = [number, number, number];
export type SpaceType = "axis1d" | "plane2d" | "polar2d" | "space3d";
export interface DocumentTheme {
  background?: string;
  foreground?: string;
  axes?: string;
  grid?: string;
  objectColors?: string[];
}
export interface ObjectStyle {
  color?: string;
  opacity?: number;
  fillOpacity?: number;
  strokeWidth?: number;
  pointSize?: number;
  fontSize?: number;
}
export interface DragBinding {
  parameter: string;
  coordinate?: number;
  min?: number;
  max?: number;
}
export interface ObjectBase {
  id: string;
  /** Plain-text explanation displayed when hovering this object. */
  caption?: string;
  position?: Coordinate;
  style?: ObjectStyle;
}
export interface TableSpecs { entries: (string | number)[][]; cellWidth?: number; cellHeight?: number; decimals?: number }
export interface GraphSpecs { vertices: string[]; edges: [string,string][]; layout?: "circle" | "line"; radius?: number; positions?: Record<string,[number,number]>; labels?: boolean }
export interface ObjectSpecs {
  Table: TableSpecs;
  MathTable: TableSpecs;
  DecimalTable: TableSpecs;
  Matrix: TableSpecs;
  DecimalMatrix: TableSpecs;
  IntegerMatrix: TableSpecs;
  BarChart: { values: Scalar[]; labels?: string[]; barWidth?: number; gap?: number };
  SampleSpace: { probabilities: number[]; labels?: string[]; width?: number; height?: number };
  Graph: GraphSpecs;
  DiGraph: GraphSpecs;
  PictureInPicture: PictureInPictureSpecs;
  Point: { at: Coordinate; drag?: DragBinding };
  Line: { from: Coordinate; to: Coordinate };
  Arrow: { from: Coordinate; to: Coordinate };
  DoubleArrow: { from: Coordinate; to: Coordinate };
  DashedLine: { from: Coordinate; to: Coordinate; dashLength?: Scalar; dashRatio?: number };
  ArcBetweenPoints: { from: Coordinate; to: Coordinate; angle?: Scalar };
  CurvedArrow: { from: Coordinate; to: Coordinate; angle?: Scalar };
  CurvedDoubleArrow: { from: Coordinate; to: Coordinate; angle?: Scalar };
  Angle: { from: Coordinate; vertex: Coordinate; to: Coordinate; radius?: Scalar; otherAngle?: boolean };
  RightAngle: { from: Coordinate; vertex: Coordinate; to: Coordinate; size?: Scalar };
  Triangle: { radius?: Scalar };
  SurroundingRectangle: { target: string; padding?: Scalar };
  BackgroundRectangle: { target: string; padding?: Scalar };
  Brace: { target: string; side?: "left" | "right" | "top" | "bottom"; padding?: Scalar; depth?: Scalar };
  Elbow: { width?: Scalar; angle?: Scalar };
  Annulus: { innerRadius?: Scalar; radius?: Scalar };
  AnnularSector: { innerRadius?: Scalar; radius?: Scalar; startAngle?: Scalar; angle?: Scalar };
  RegularPolygram: { sides: number; step: number; radius?: Scalar };
  ConvexHull: { points: Coordinate[] };
  Polyhedron: { points: Coordinate[]; faces: number[][] };
  ConvexHull3D: { points: Coordinate[] };
  Icosahedron: { radius?: Scalar };
  Dodecahedron: { radius?: Scalar };
  RoundedRectangle: { width?: Scalar; height?: Scalar; cornerRadius?: Scalar };
  ImplicitFunction: { expression: string; xRange: [number, number]; yRange: [number, number]; resolution?: number };
  ArrowVectorField: { expressions: Coordinate; xRange: [number, number]; yRange: [number, number]; zRange?: [number, number]; spacing?: number; lengthScale?: Scalar; maxLength?: number };
  StreamLines: { expressions: Coordinate; seeds: Coordinate[]; step?: number; steps?: number };
  TracedPath: { point: string; start?: number; duration?: number; samples?: number };
  Polyline: { points: Coordinate[] };
  Polygon: { points: Coordinate[] };
  RegularPolygon: { sides: number; radius?: Scalar };
  Star: { tips: number; radius?: Scalar; innerRadius?: Scalar };
  Rectangle: { width?: Scalar; height?: Scalar };
  Square: { size?: Scalar };
  Circle: { radius?: Scalar };
  Ellipse: { radiusX?: Scalar; radiusY?: Scalar };
  Arc: { radius?: Scalar; startAngle?: Scalar; angle?: Scalar };
  Sector: { radius?: Scalar; startAngle?: Scalar; angle?: Scalar };
  Bezier: { points: Coordinate[] };
  FunctionGraph: {
    expression: string;
    domain?: [number, number];
    samples?: number;
  };
  PolarGraph: {
    expression: string;
    domain?: [number, number];
    samples?: number;
  };
  ParametricCurve: {
    expressions: Coordinate;
    domain?: [number, number];
    samples?: number;
  };
  PointOnCurve: { curve: string; parameter: Scalar; drag?: DragBinding };
  Tangent: { curve: string; parameter: Scalar; length?: Scalar };
  Group: { children: string[] };
  Text: { text: string };
  MathTex: { text: string };
  DecimalNumber: { value: Scalar; decimals?: number };
  Sphere: { radius?: Scalar };
  Cube: { size?: Scalar };
  Cuboid: { width?: Scalar; height?: Scalar; depth?: Scalar };
  Cone: { radius?: Scalar; height?: Scalar };
  Cylinder: { radius?: Scalar; height?: Scalar };
  Torus: { radius?: Scalar; tubeRadius?: Scalar };
  Surface: {
    expressions: [Scalar, Scalar, Scalar];
    uRange: [number, number];
    vRange: [number, number];
    resolution?: [number, number];
  };
}
export type ObjectType = keyof ObjectSpecs;
export type SceneObject = {
  [K in ObjectType]: ObjectBase & { type: K } & ObjectSpecs[K];
}[ObjectType];
export interface SpaceDefinition {
  name: string;
  type: SpaceType;
  objects: SceneObject[];
  theme?: DocumentTheme;
  axes?: boolean | ("x" | "y" | "z")[];
  ticks?: boolean;
  grid?: boolean;
  camera?: {
    center?: [number, number, number];
    scale?: number;
    position?: [number, number, number];
    projection?: "perspective" | "orthographic";
  };
}
import type { Ease } from "./easing.ts";
export type { Ease } from "./easing.ts";
export interface EventSpecs {
  Add: {};
  Create: {};
  Uncreate: {};
  FadeIn: {};
  FadeOut: {};
  MoveTo: { to: Coordinate; from?: Coordinate };
  Shift: { by: Coordinate };
  Rotate: { angle: number; axis?: [number, number, number] };
  Scale: { factor: number };
  FadeToColor: { color: string };
  ApplyMatrix: { matrix: number[][] };
  MoveAlongPath: { path: string };
  Indicate: { color?: string; factor?: number };
  Wiggle: { angle?: number };
  Blink: { count?: number };
  Homotopy: { expressions: Coordinate };
  ApplyPointwiseFunction: { expressions: Coordinate };
  PhaseFlow: { expressions: Coordinate; steps?: number; virtualTime?: number };
  Restore: { at?: number };
  ApplyWave: { amplitude?: number; waves?: number; direction?: Vec3 };
  AddTextLetterByLetter: {};
  RemoveTextLetterByLetter: {};
  AddTextWordByWord: {};
  ShowIncreasingSubsets: {};
  ShowSubmobjectsOneByOne: {};
  GrowFromCenter: {};
  GrowArrow: {};
  GrowFromPoint: { point: Coordinate };
  GrowFromEdge: { edge: "left" | "right" | "top" | "bottom" | "front" | "back" };
  SpinInFromNothing: { angle?: number };
  DrawBorderThenFill: {};
  ShowPassingFlash: { timeWidth?: number };
  Transform: { to: string };
  ReplacementTransform: { to: string };
}
export type ObjectEvent = {
  [K in keyof EventSpecs]: {
    type: K;
    object: string;
    start?: number;
    duration?: number;
    easing?: Ease;
  } & EventSpecs[K];
}[keyof EventSpecs];
export type CameraEvent =
  | { type: "CameraMove"; space: string; position: Vec3; center?: Vec3; start?: number; duration?: number; easing?: Ease }
  | { type: "CameraOrbit"; space: string; angle: number; axis?: Vec3; start?: number; duration?: number; easing?: Ease }
  | {
      type: "CameraZoom";
      space: string;
      factor: number;
      start?: number;
      duration?: number;
      easing?: Ease;
    }
  | {
      type: "CameraWindow";
      space: string;
      x: [number, number];
      y?: [number, number];
      start?: number;
      duration?: number;
      easing?: Ease;
    };
/** Absolute CSS-pixel inset relative to the player's top-left corner. */
export interface PictureInPictureSpecs {
  space: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export type PictureInPictureObject = ObjectBase & {
  type: "PictureInPicture";
} & PictureInPictureSpecs;
export interface PictureInPictureFrame {
  opacity: number;
  owner: string;
  id: string;
  space: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export type SceneEvent =
  | CameraEvent
  | ObjectEvent
  | {
      type: "AnimateParameter";
      parameter: string;
      to: number;
      from?: number;
      start?: number;
      duration?: number;
      easing?: Ease;
    }
  | {
      type: "ApplySpaceMatrix";
      space: string;
      matrix: number[][];
      start?: number;
      duration?: number;
      easing?: Ease;
    }
  | {
      type: "ApplyComplexFunction";
      space: string;
      expression: string;
      start?: number;
      duration?: number;
      easing?: Ease;
    }
  | {
      type: "SwitchSpace";
      space: string;
      transition?: "cut" | "fade";
      start?: number;
      duration?: number;
    }
  | {
      type: "EventGroup" | "Succession" | "LaggedStart";
      events: SceneEvent[];
      start?: number;
      duration?: number;
      lagRatio?: number;
    };
export interface SceneDocument {
  version: 1;
  parameters?: Record<string, number>;
  theme?: DocumentTheme;
  spaces: SpaceDefinition[];
  events?: SceneEvent[];
  duration?: number;
}
export interface Diagnostic {
  path: string;
  message: string;
}
export class SceneValidationError extends Error {
  constructor(public readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map((d) => `${d.path}: ${d.message}`).join("\n"));
    this.name = "SceneValidationError";
  }
}
export type Matrix4 = number[];
/** Renderer-neutral world geometry: paths, indexed triangles, anchors and labels. */
export interface Geometry {
  /** Optional render-time function sampling; base points remain deterministic. */
  functionPlot?: { expression: string | number; values: Record<string, number>; domain?: [number, number] };
  kind: "path" | "mesh" | "point" | "text" | "group";
  points: Vec3[];
  indices?: number[];
  closed?: boolean;
  dash?: { length: number; ratio: number };
  /** Starting point indices for disconnected strokes (including index zero). */
  breaks?: number[];
  arrows?: boolean;
  text?: string;
  math?: boolean;
}
export interface ObjectFrame {
  id: string;
  draggable?: boolean;
  caption?: string;
  type: ObjectType;
  geometry: Geometry;
  matrix: Matrix4;
  visible: boolean;
  opacity: number;
  reveal: number;
  fillReveal?: number;
  strokeRange?: [number, number];
  arrowScale?: number;
  color: string;
  style: ObjectStyle;
  selected: false;
}
export interface SpaceTransform {
  matrix?: Matrix4;
  expression?: string;
  values?: Record<string, number>;
  progress: number;
}
export interface CameraStep {
  event: CameraEvent;
  progress: number;
}
export interface SpaceFrame {
  camera: CameraStep[];
  transforms: SpaceTransform[];
  name: string;
  type: SpaceType;
  objects: ObjectFrame[];
  theme: Required<DocumentTheme>;
}
export interface DocumentFrame {
  time: number;
  duration: number;
  parameters: Record<string, number>;
  spaces: SpaceFrame[];
  activeSpace: string;
  pictureInPictures: PictureInPictureFrame[];
  layers: { space: string; opacity: number }[];
  diagnostics: Diagnostic[];
}

/** @deprecated Use SceneEvent, ObjectEvent and EventSpecs. */
export type Animation = SceneEvent;
export type ObjectAnimation = ObjectEvent;
export type AnimationSpecs = EventSpecs;
