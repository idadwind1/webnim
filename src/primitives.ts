// TypeScript authoring API. All results are plain, serializable scene data.
import type { SceneNode } from "./scene.ts";
import type { Expr } from "./math.ts";
import { ellipse, arc, polygon, type VectorPath } from "./vector.ts";
import type { Vec } from "./camera.ts";
interface Options {
  x?: number;
  y?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
}
const base = (id: string, o: Options = {}) => ({
  id,
  name: id,
  color: o.color ?? "#bed6af",
  tx: o.x ?? 0,
  ty: o.y ?? 0,
  fillOpacity: o.fillOpacity ?? 0,
  strokeWidth: o.strokeWidth ?? 2,
});
export const Path = (
  id: string,
  path: VectorPath,
  o: Options = {},
): SceneNode => ({ ...base(id, o), type: "path", path });
export const Circle = (id: string, radius = 1, o: Options = {}): SceneNode =>
  Path(id, ellipse(radius, radius), o);
export const Ellipse = (
  id: string,
  rx: number,
  ry: number,
  o: Options = {},
): SceneNode => Path(id, ellipse(rx, ry), o);
export const Rectangle = (
  id: string,
  width = 2,
  height = 1,
  o: Options = {},
): SceneNode =>
  Path(
    id,
    polygon([
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 },
    ]),
    o,
  );
export const Square = (id: string, size = 2, o: Options = {}): SceneNode =>
  Rectangle(id, size, size, o);
export const Polygon = (
  id: string,
  vertices: Vec[],
  o: Options = {},
): SceneNode => Path(id, polygon(vertices), o);
export const RegularPolygon = (
  id: string,
  sides: number,
  radius = 1,
  o: Options = {},
): SceneNode => {
  if (sides < 3 || sides > 128 || !Number.isInteger(sides))
    throw new Error("Invalid polygon side count.");
  return Polygon(
    id,
    Array.from({ length: sides }, (_, i) => ({
      x: radius * Math.cos(Math.PI / 2 + (i * 2 * Math.PI) / sides),
      y: radius * Math.sin(Math.PI / 2 + (i * 2 * Math.PI) / sides),
    })),
    o,
  );
};
export const Triangle = (id: string, radius = 1, o: Options = {}): SceneNode =>
  RegularPolygon(id, 3, radius, o);
export const Arc = (
  id: string,
  radius: number,
  start: number,
  end: number,
  o: Options = {},
): SceneNode => Path(id, arc(radius, start, end), o);
export const Sector = (
  id: string,
  radius: number,
  start: number,
  end: number,
  o: Options = {},
): SceneNode => Path(id, arc(radius, start, end, true), o);
export const Line = (
  id: string,
  from: Vec,
  to: Vec,
  o: Options = {},
): SceneNode => Path(id, polygon([from, to], false), o);
export const Arrow = (
  id: string,
  from: Vec,
  to: Vec,
  o: Options = {},
): SceneNode =>
  ({ ...Path(id, polygon([from, to], false), o), arrow: true }) as SceneNode;
export const Vector = (id: string, to: Vec, o: Options = {}): SceneNode =>
  Arrow(id, { x: 0, y: 0 }, to, o);
export const Dot = (
  id: string,
  x: Expr = 0,
  y: Expr = 0,
  o: Options = {},
): SceneNode => ({ ...base(id, o), type: "point", x, y, label: id });
export const Text = (
  id: string,
  text: string,
  x: Expr = 0,
  y: Expr = 0,
  o: Options = {},
): SceneNode => ({ ...base(id, o), type: "text", x, y, text, fontSize: 24 });
export const MathTex = (
  id: string,
  tex: string,
  x: Expr = 0,
  y: Expr = 0,
  o: Options = {},
): SceneNode => ({ ...Text(id, tex, x, y, o), math: true }) as SceneNode;
export const DecimalNumber = (
  id: string,
  value: Expr,
  x: Expr = 0,
  y: Expr = 0,
  decimals = 2,
): SceneNode => ({ ...Text(id, "", x, y), value, decimals }) as SceneNode;
export const FunctionGraph = (
  id: string,
  expression: Expr,
  domain: [number, number] = [-5, 5],
  o: Options = {},
): SceneNode => ({ ...base(id, o), type: "curve", expression, domain });
export const VGroup = (
  id: string,
  children: string[],
  o: Options = {},
): SceneNode => ({ ...base(id, o), type: "group", children });
export function Axes(id: string, extent = 4): SceneNode[] {
  const x = Arrow(`${id}_x`, { x: -extent, y: 0 }, { x: extent, y: 0 }),
    y = Arrow(`${id}_y`, { x: 0, y: -extent }, { x: 0, y: extent });
  return [x, y, VGroup(id, [x.id, y.id])];
}
export function NumberLine(id: string, min = -3, max = 3): SceneNode[] {
  const nodes: SceneNode[] = [
    Line(`${id}_axis`, { x: min, y: 0 }, { x: max, y: 0 }),
  ];
  for (let value = Math.ceil(min); value <= max && nodes.length < 80; value++) {
    nodes.push(
      Line(
        `${id}_tick_${value}`,
        { x: value, y: -0.08 },
        { x: value, y: 0.08 },
      ),
    );
    nodes.push({
      ...Text(`${id}_label_${value}`, String(value), value, -0.32),
      fontSize: 14,
    } as SceneNode);
  }
  return [
    ...nodes,
    VGroup(
      id,
      nodes.map((n) => n.id),
    ),
  ];
}
export function BarChart(
  id: string,
  values: number[],
  labels?: string[],
): SceneNode[] {
  if (
    values.length > 30 ||
    !values.length ||
    values.some((v) => !Number.isFinite(v))
  )
    throw new Error("Bar chart requires 1–30 finite values.");
  const nodes: SceneNode[] = [];
  values.forEach((v, i) => {
    nodes.push(
      Rectangle(`${id}_bar_${i}`, 0.65, Math.abs(v), {
        x: i,
        y: v / 2,
        fillOpacity: 0.35,
      }),
    );
    nodes.push({
      ...Text(`${id}_label_${i}`, labels?.[i] ?? String(i + 1), i, -0.4),
      fontSize: 14,
    } as SceneNode);
  });
  return [
    ...nodes,
    VGroup(
      id,
      nodes.map((n) => n.id),
    ),
  ];
}
export function Matrix(id: string, rows: number[][], x = 0, y = 0): SceneNode {
  if (
    !rows.length ||
    rows.length > 20 ||
    rows.some(
      (row) =>
        row.length !== rows[0].length ||
        row.length > 20 ||
        row.some((n) => !Number.isFinite(n)),
    )
  )
    throw new Error("Matrix must be finite and rectangular.");
  return MathTex(
    id,
    `\\begin{pmatrix}${rows.map((r) => r.join(" & ")).join(" \\\\ ")}\\end{pmatrix}`,
    x,
    y,
  );
}
export function Graph(
  id: string,
  vertices: Vec[],
  edges: [number, number][],
): SceneNode[] {
  if (vertices.length + edges.length > 80)
    throw new Error("Graph is too large.");
  const nodes: SceneNode[] = edges.map(([a, b], i) => {
    if (!vertices[a] || !vertices[b]) throw new Error("Unknown graph vertex.");
    return Line(`${id}_edge_${i}`, vertices[a], vertices[b], {
      color: "#758d75",
    });
  });
  nodes.push(...vertices.map((p, i) => Dot(`${id}_vertex_${i}`, p.x, p.y)));
  return [
    ...nodes,
    VGroup(
      id,
      nodes.map((n) => n.id),
    ),
  ];
}
