import { evaluate, type Expr, type MathContext } from "./math.ts";
import { evaluateTracks, type Track } from "./timeline.ts";
import type { Vec } from "./camera.ts";
import {
  matrixOf,
  multiply,
  pointAlong,
  morphPath,
  type Matrix,
  type VectorPath,
} from "./vector.ts";
export interface BaseNode {
  id: string;
  name: string;
  color: string;
  opacity?: number;
  reveal?: number;
  tx?: number;
  ty?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  strokeWidth?: number;
  fillOpacity?: number;
  m00?: number;
  m01?: number;
  m10?: number;
  m11?: number;
  motionPath?: Vec[];
  morphTarget?: {
    from: Vec[];
    to: Vec[];
    closed: boolean;
    fromPath?: VectorPath;
    toPath?: VectorPath;
  };
}
export type SceneNode = BaseNode &
  (
    | { type: "curve"; expression: Expr; domain: [number, number] }
    | { type: "point"; x: Expr; y: Expr; label: string; draggable?: boolean }
    | { type: "line"; x: Expr; y: Expr; slope: Expr; dashed?: boolean }
    | { type: "polyline"; points: [Expr, Expr][]; dashed?: boolean }
    | { type: "path"; path: VectorPath; arrow?: boolean }
    | {
        type: "text";
        x: Expr;
        y: Expr;
        text: string;
        fontSize?: number;
        value?: Expr;
        decimals?: number;
        math?: boolean;
      }
    | { type: "group"; children: string[] }
  );
export interface LessonStep {
  id: string;
  title: string;
  body: string;
  start: number;
  end: number;
  objectIds: string[];
  formula: string;
}
export interface Lesson {
  id: string;
  title: string;
  subtitle: string;
  equation: string;
  derivativeLabel: string;
  fn: Expr;
  derivative: Expr;
  duration: number;
  initialA: number;
  initialH: number;
  nodes: SceneNode[];
  tracks: Track[];
  steps: LessonStep[];
}
export type ResolvedNode = Omit<BaseNode, "opacity" | "reveal"> & {
  opacity: number;
  reveal: number;
  matrix: Matrix;
  ancestors: string[];
  strokeWidth: number;
  fillOpacity: number;
} & (
    | { type: "curve"; fn: (x: number) => number; domain: [number, number] }
    | { type: "point"; at: Vec; label: string; draggable?: boolean }
    | { type: "line"; at: Vec; slope: number; dashed?: boolean }
    | { type: "polyline"; points: Vec[]; dashed?: boolean }
    | { type: "path"; path: VectorPath; arrow?: boolean }
    | { type: "text"; at: Vec; text: string; fontSize: number; math?: boolean }
    | { type: "group"; children: string[] }
  );
export interface SceneFrame {
  nodes: ResolvedNode[];
  vars: Record<string, number>;
  step: LessonStep;
  context: MathContext;
}
export function evaluateScene(
  lesson: Lesson,
  time: number,
  a: number,
): SceneFrame {
  const state = evaluateTracks(lesson.tracks, time);
  const vars = { a, h: lesson.initialH, t: time, ...state.parameters };
  const context: MathContext = {
    vars,
    fn: lesson.fn,
    derivative: lesson.derivative,
  };
  const num = (expr: Expr) => evaluate(expr, context);
  const parents = new Map<string, SceneNode>();
  for (const node of lesson.nodes)
    if (node.type === "group")
      for (const child of node.children) {
        if (!lesson.nodes.some((n) => n.id === child))
          throw new Error(`Missing group child: ${child}`);
        if (parents.has(child))
          throw new Error(`Object ${child} already belongs to a group.`);
        parents.set(child, node);
      }
  function inherited(
    node: SceneNode,
    seen = new Set<string>(),
  ): { matrix: Matrix; opacity: number; reveal: number; ancestors: string[] } {
    if (seen.has(node.id)) throw new Error("Group cycle detected.");
    seen.add(node.id);
    const properties = {
      ...(node as unknown as Record<string, number>),
      ...state[node.id],
    };
    if (node.motionPath && state[node.id]?.motion !== undefined) {
      const p = pointAlong(node.motionPath, state[node.id].motion);
      properties.tx = p.x;
      properties.ty = p.y;
    }
    const own = matrixOf(properties);
    const opacity = state[node.id]?.opacity ?? node.opacity ?? 1;
    const reveal = state[node.id]?.reveal ?? node.reveal ?? 1;
    const parent = parents.get(node.id);
    if (!parent) return { matrix: own, opacity, reveal, ancestors: [] };
    const upstream = inherited(parent, seen);
    return {
      matrix: multiply(upstream.matrix, own),
      opacity: upstream.opacity * opacity,
      reveal: upstream.reveal * reveal,
      ancestors: [parent.id, ...upstream.ancestors],
    };
  }
  const nodes = lesson.nodes.map((node): ResolvedNode => {
    const base = {
      id: node.id,
      name: node.name,
      color: node.color,
      tx: node.tx ?? 0,
      ty: node.ty ?? 0,
      rotation: node.rotation ?? 0,
      scaleX: node.scaleX ?? 1,
      scaleY: node.scaleY ?? 1,
      strokeWidth: node.strokeWidth ?? 2,
      fillOpacity: node.fillOpacity ?? 0,
      ...state[node.id],
      ...inherited(node),
    };
    if (state[node.id]?.red !== undefined) {
      const channel = (key: string) =>
        Math.round(Math.max(0, Math.min(255, state[node.id][key])))
          .toString(16)
          .padStart(2, "0");
      base.color = `#${channel("red")}${channel("green")}${channel("blue")}`;
    }
    switch (node.type) {
      case "group":
        return { ...base, type: "group", children: node.children };
      case "text":
        return {
          ...base,
          type: "text",
          at: { x: num(node.x), y: num(node.y) },
          text:
            node.value !== undefined
              ? num(node.value).toFixed(node.decimals ?? 2)
              : node.text,
          fontSize: node.fontSize ?? 24,
          math: node.math,
        };
      case "path":
        return {
          ...base,
          type: "path",
          path:
            node.morphTarget && state[node.id]?.morph !== undefined
              ? state[node.id].morph <= 0
                ? (node.morphTarget.fromPath ?? node.path)
                : state[node.id].morph >= 1
                  ? (node.morphTarget.toPath ?? node.path)
                  : morphPath(
                      node.morphTarget.from,
                      node.morphTarget.to,
                      state[node.id].morph,
                      node.morphTarget.closed,
                    )
              : node.path,
          arrow: node.arrow,
        };
      case "curve":
        return {
          ...base,
          type: node.type,
          fn: (x) =>
            evaluate(node.expression, { ...context, vars: { ...vars, x } }),
          domain: node.domain,
        };
      case "point":
        return {
          ...base,
          type: node.type,
          at: { x: num(node.x), y: num(node.y) },
          label: node.label,
          draggable: node.draggable,
        };
      case "line":
        return {
          ...base,
          type: node.type,
          at: { x: num(node.x), y: num(node.y) },
          slope: num(node.slope),
          dashed: node.dashed,
        };
      case "polyline":
        return {
          ...base,
          type: node.type,
          points: node.points.map(([x, y]) => ({ x: num(x), y: num(y) })),
          dashed: node.dashed,
        };
    }
  });
  return {
    nodes,
    vars,
    context,
    step: lesson.steps.find((s) => time >= s.start && time < s.end) ??
      lesson.steps[lesson.steps.length - 1] ?? {
        id: "scene",
        title: "Scene",
        body: "",
        start: 0,
        end: Infinity,
        objectIds: [],
        formula: "",
      },
  };
}
