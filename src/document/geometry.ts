import type { CompiledObject } from "./compiler.ts";
import type { Geometry, Vec3 } from "./types.ts";
import { hull2D, hull3D, platonic, polyhedron } from "./polyhedra.ts";
import { fieldGeometry } from "./fields.ts";
import {
  add3,
  along,
  lerp3,
  mul3,
  nativeToCartesian,
  sub3,
  unit3,
} from "./spatial.ts";
function generateGeometry(
  o: CompiledObject,
  values: Record<string, number>,
  dependency?: Geometry,
): Geometry {
  const d = o.definition;
  for (const key of ["parameter", "value"]) {
    const value = o.expressions.get(key)?.evaluate(values);
    if (value !== undefined && !Number.isFinite(value))
      return { kind: "point", points: [[NaN, NaN, NaN]] };
  }
  const n = (key: string, fallback = 1, local: Record<string, number> = {}) => {
    const value =
      o.expressions.get(key)?.evaluate({ ...values, ...local }) ?? fallback;
    return [
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
    ].includes(key) && value <= 0
      ? NaN
      : value;
  };
  const coord = (key: string, local: Record<string, number> = {}): Vec3 =>
    nativeToCartesian(
      Array.from(
        {
          length:
            o.space.type === "axis1d" ? 1 : o.space.type === "space3d" ? 3 : 2,
        },
        (_, i) => n(`${key}.${i}`, 0, local),
      ),
      o.space.type,
    );
  const path = (points: Vec3[], closed = false): Geometry => ({
    kind: "path",
    points,
    closed,
  });
  const sample = (count: number, fn: (s: number) => Vec3) =>
    Array.from({ length: count + 1 }, (_, i) => fn(i / count));
  const circle = (rx: number, ry: number, start = 0, angle = Math.PI * 2) =>
    sample(128, (s) => [
      rx * Math.cos(start + s * angle),
      ry * Math.sin(start + s * angle),
      0,
    ]);
  const surface = (
    nu: number,
    nv: number,
    fn: (u: number, v: number) => Vec3,
  ): Geometry => {
    const points: Vec3[] = [],
      indices: number[] = [];
    for (let i = 0; i <= nu; i++)
      for (let j = 0; j <= nv; j++) points.push(fn(i / nu, j / nv));
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j,
          b = a + nv + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    return { kind: "mesh", points, indices };
  };
  switch (d.type) {
    case "ImplicitFunction":
    case "ArrowVectorField":
    case "StreamLines":
      return fieldGeometry(o, values);
    case "TracedPath":
      return path([]); // The evaluator samples the source's historical world positions.
    case "PictureInPicture":
      return { kind: "group", points: [] };
    case "Point":
      return { kind: "point", points: [coord("at")] };
    case "Line":
    case "Arrow":
    case "DoubleArrow":
      return path([coord("from"), coord("to")]);
    case "DashedLine": {
      const length = n("dashLength", 0.2);
      return { ...path([coord("from"), coord("to")]),
        ...(Number.isFinite(length) ? { dash: { length, ratio: d.dashRatio ?? 0.5 } }
          : { points: [[NaN, NaN, NaN] as Vec3] }) };
    }
    case "ArcBetweenPoints":
    case "CurvedArrow":
    case "CurvedDoubleArrow": {
      const a = coord("from"), b = coord("to"), angle = n("angle", Math.PI / 2);
      const delta = sub3(b, a), length = Math.hypot(...delta);
      if (!Number.isFinite(angle) || Math.abs(angle) >= 2 * Math.PI || length === 0)
        return path([[NaN, NaN, NaN]]);
      if (Math.abs(angle) < 1e-8) return path([a, b]);
      const direction = unit3(delta);
      // Choose the XY plane for 2D; in 3D use a perpendicular plane through the chord.
      const perpendicular: Vec3 = Math.hypot(direction[0], direction[1]) > 1e-10
        ? unit3([-direction[1], direction[0], 0]) : [1, 0, 0];
      const center = add3(mul3(add3(a, b), 0.5), mul3(perpendicular, length / (2 * Math.tan(angle / 2))));
      const radial = sub3(a, center);
      // A perpendicular radius with the same magnitude, oriented toward the endpoint.
      const tangent = add3(mul3(direction, length / (2 * Math.tan(angle / 2))), mul3(perpendicular, -length / 2));
      const points = sample(128, s => add3(center,
        add3(mul3(radial, Math.cos(s * angle)), mul3(tangent, Math.sin(s * angle)))));
      points[0] = a; points[points.length - 1] = b;
      return path(points);
    }
    case "Angle":
    case "RightAngle": {
      const vertex = coord("vertex"), a = sub3(coord("from"), vertex), b = sub3(coord("to"), vertex);
      if (Math.hypot(...a) === 0 || Math.hypot(...b) === 0) return path([[NaN, NaN, NaN]]);
      const u = unit3(a), v = unit3(b), dot = Math.max(-1, Math.min(1, u.reduce((sum, x, i) => sum + x * v[i], 0)));
      if (d.type === "RightAngle") {
        if (Math.abs(dot) > 1e-6) return path([[NaN, NaN, NaN]]);
        const x = mul3(u, n("size", 0.25)), y = mul3(v, n("size", 0.25));
        return path([add3(vertex, x), add3(vertex, add3(x, y)), add3(vertex, y)]);
      }
      let angle = Math.acos(dot);
      let tangent = sub3(v, mul3(u, dot));
      if (Math.hypot(...tangent) < 1e-10)
        tangent = Math.hypot(u[0], u[1]) > 1e-10 ? [-u[1], u[0], 0] : [1, 0, 0];
      tangent = unit3(tangent);
      if (d.otherAngle) angle -= 2 * Math.PI;
      const radius = n("radius", 0.5);
      return path(sample(64, s => add3(vertex,
        mul3(add3(mul3(u, Math.cos(angle * s)), mul3(tangent, Math.sin(angle * s))), radius))));
    }
    case "SurroundingRectangle":
    case "BackgroundRectangle":
    case "Brace": {
      const points=dependency?.points ?? [],pad=n("padding",.15);
      if(!points.length || !Number.isFinite(pad) || pad<0)return path([[NaN,NaN,NaN]]);
      const min=[0,1].map(i=>Math.min(...points.map(p=>p[i]))-pad),max=[0,1].map(i=>Math.max(...points.map(p=>p[i]))+pad);
      if(d.type!=="Brace")return path([[min[0],min[1],0],[max[0],min[1],0],[max[0],max[1],0],[min[0],max[1],0]],true);
      const side=d.side??"bottom",vertical=side==="left"||side==="right",axis=vertical?1:0,sign=side==="left"||side==="bottom"?-1:1,edge=sign<0?min[1-axis]:max[1-axis],depth=n("depth",.2);
      return path(sample(96,u=>{
        const q=(1-Math.cos(4*Math.PI*u))/4 + Math.exp(-(((u-.5)/.06)**2))*.75;
        const along=min[axis]+(max[axis]-min[axis])*u,across=edge+sign*depth*q;
        return vertical?[across,along,0]:[along,across,0];
      }));
    }
    case "Elbow": {
      const w = n("width", 0.25), a = n("angle", 0);
      return path([[w,0,0],[w,w,0],[0,w,0]].map(([x,y,z]) => [x*Math.cos(a)-y*Math.sin(a), x*Math.sin(a)+y*Math.cos(a), z]));
    }
    case "Annulus":
    case "AnnularSector": {
      const inner = n("innerRadius", 0.5), outer = n("radius", 1);
      const a = d.type === "Annulus" ? 2*Math.PI : n("angle", Math.PI/2), start = n("startAngle",0);
      if (!(inner < outer) || Math.abs(a)>2*Math.PI || a===0) return path([[NaN,NaN,NaN]]);
      const outside=circle(outer,outer,start,a), inside=circle(inner,inner,start,a).reverse();
      const points=[...outside,...inside], indices:number[]=[];
      for(let i=0;i<128;i++) indices.push(i,i+1,257-i,i+1,256-i,257-i);
      return {...path(points,true),indices,...(d.type==="Annulus" ? {breaks:[0,129]} : {})};
    }
    case "RegularPolygram": {
      const visited=new Set<number>(), points:Vec3[]=[], breaks:number[]=[];
      for(let i=0;i<d.sides;i++) if(!visited.has(i)) {
        breaks.push(points.length); let j=i;
        do { visited.add(j); const a=j*2*Math.PI/d.sides+Math.PI/2; points.push([n("radius")*Math.cos(a),n("radius")*Math.sin(a),0]); j=(j+d.step)%d.sides; } while(j!==i);
        points.push(points[breaks.at(-1)!]);
      }
      return {...path(points,true),...(breaks.length>1?{breaks}:{})};
    }
    case "ConvexHull": {
      const points=hull2D(d.points.map((_,i)=>coord(`points.${i}`)));
      return path(points.length>=3?points:[[NaN,NaN,NaN]],true);
    }
    case "Polyhedron": return polyhedron(d.points.map((_,i)=>coord(`points.${i}`)),d.faces);
    case "ConvexHull3D": return hull3D(d.points.map((_,i)=>coord(`points.${i}`)));
    case "Icosahedron":
    case "Dodecahedron": return platonic(d.type,n("radius"));
    case "Polyline":
    case "Polygon":
      return path(
        d.points.map((_, i) => coord(`points.${i}`)),
        d.type === "Polygon",
      );
    case "RegularPolygon":
    case "Triangle":
    case "Star": {
      const count = d.type === "Star" ? d.tips * 2 : d.type === "Triangle" ? 3 : d.sides;
      return path(
        Array.from({ length: count }, (_, i) => {
          const a = (i * Math.PI * 2) / count + Math.PI / 2,
            r =
              d.type === "Star" && i % 2 ? n("innerRadius", 0.5) : n("radius");
          return [r * Math.cos(a), r * Math.sin(a), 0];
        }),
        true,
      );
    }
    case "Rectangle":
    case "RoundedRectangle":
    case "Square": {
      const w = n(d.type === "Square" ? "size" : "width") / 2,
        h = n(d.type === "Square" ? "size" : "height") / 2;
      if (d.type === "RoundedRectangle") {
        const r = n("cornerRadius", Math.min(0.2, w, h));
        if (r > Math.min(w, h)) return path([[NaN, NaN, NaN]]);
        return path([[w - r, h - r], [-w + r, h - r], [-w + r, -h + r], [w - r, -h + r]]
          .flatMap(([x, y], corner) => sample(16, s =>
            [x + r * Math.cos((corner + s) * Math.PI / 2), y + r * Math.sin((corner + s) * Math.PI / 2), 0])), true);
      }
      return path(
        [
          [-w, -h, 0],
          [w, -h, 0],
          [w, h, 0],
          [-w, h, 0],
        ],
        true,
      );
    }
    case "Circle":
    case "Ellipse":
      return path(
        circle(
          n(d.type === "Circle" ? "radius" : "radiusX"),
          n(d.type === "Circle" ? "radius" : "radiusY"),
        ),
        true,
      );
    case "Arc":
    case "Sector": {
      const points = circle(
        n("radius"),
        n("radius"),
        n("startAngle", 0),
        n("angle", Math.PI),
      );
      if (d.type === "Sector") points.push([0, 0, 0]);
      return path(points, d.type === "Sector");
    }
    case "Bezier": {
      const points: Vec3[] = [];
      for (let i = 0; i < d.points.length - 1; i += 3) {
        const a = coord(`points.${i}`),
          b = coord(`points.${i + 1}`),
          c = coord(`points.${i + 2}`),
          e = coord(`points.${i + 3}`);
        points.push(
          ...sample(48, (t) =>
            add3(
              add3(mul3(a, (1 - t) ** 3), mul3(b, 3 * (1 - t) ** 2 * t)),
              add3(mul3(c, 3 * (1 - t) * t * t), mul3(e, t ** 3)),
            ),
          ),
        );
      }
      return path(points);
    }
    case "FunctionGraph":
    case "PolarGraph":
    case "ParametricCurve":
      return {
        ...(d.type === "FunctionGraph" ? { functionPlot: {
          expression: d.expression,
          values: Object.fromEntries((o.expressions.get("expression")?.dependencies ?? []).filter(k => k !== "x").map(k => [k, values[k]])),
          ...(d.domain ? { domain: d.domain } : {}),
        } } : {}),
        ...path(
        sample(d.samples ?? 256, (s) => {
          const domain = d.domain ?? (d.type === "FunctionGraph" ? [-10, 10] : d.type === "PolarGraph" ? [0, 2 * Math.PI] : [0, 1]);
          const q = domain[0] + (domain[1] - domain[0]) * s;
          if (d.type === "FunctionGraph")
            return [q, n("expression", 0, { x: q }), 0];
          if (d.type === "PolarGraph") {
            const r = n("expression", 0, { theta: q });
            return [r * Math.cos(q), r * Math.sin(q), 0];
          }
          return coord("expressions", { u: q });
        }),
      ),
      };
    case "PointOnCurve":
    case "Tangent": {
      const points = dependency?.points ?? [],
        u = n("parameter", 0),
        p = along(points, u);
      if (d.type === "PointOnCurve") return { kind: "point", points: [p] };
      const direction = unit3(
          sub3(
            along(points, Math.min(1, u + 1e-4)),
            along(points, Math.max(0, u - 1e-4)),
          ),
        ),
        half = mul3(direction, n("length", 2) / 2);
      return path([sub3(p, half), add3(p, half)]);
    }
    case "Text":
    case "MathTex":
    case "DecimalNumber":
      return {
        kind: "text",
        points: [[0, 0, 0]],
        text:
          d.type === "DecimalNumber"
            ? n("value", 0).toFixed(d.decimals ?? 2)
            : d.text,
        math: d.type === "MathTex",
      };
    case "Table": case "MathTable": case "DecimalTable": case "Matrix": case "DecimalMatrix": case "IntegerMatrix":
    case "BarChart": case "SampleSpace": case "Graph": case "DiGraph":
    case "Group":
      return { kind: "group", points: [] };
    case "Sphere":
      return surface(40, 24, (u, v) => {
        const a = u * Math.PI * 2,
          b = v * Math.PI,
          r = n("radius");
        return [
          r * Math.cos(a) * Math.sin(b),
          r * Math.sin(a) * Math.sin(b),
          r * Math.cos(b),
        ];
      });
    case "Torus":
      return surface(40, 20, (u, v) => {
        const a = u * Math.PI * 2,
          b = v * Math.PI * 2,
          r = n("radius") + n("tubeRadius", 0.3) * Math.cos(b);
        return [
          r * Math.cos(a),
          r * Math.sin(a),
          n("tubeRadius", 0.3) * Math.sin(b),
        ];
      });
    case "Cone":
    case "Cylinder": {
      const r = n("radius"),
        h = n("height", 2);
      const g = surface(40, 1, (u, v) => {
        const a = u * Math.PI * 2,
          rr = d.type === "Cone" ? r * (1 - v) : r;
        return [rr * Math.cos(a), rr * Math.sin(a), (v - 0.5) * h];
      });
      for (const z of [-h / 2, h / 2]) {
        if (d.type === "Cone" && z > 0) continue;
        const c = g.points.length;
        g.points.push([0, 0, z]);
        for (let i = 0; i <= 40; i++)
          g.points.push([
            r * Math.cos((i * Math.PI) / 20),
            r * Math.sin((i * Math.PI) / 20),
            z,
          ]);
        for (let i = 0; i < 40; i++) g.indices!.push(c, c + i + 1, c + i + 2);
      }
      return g;
    }
    case "Cube":
    case "Cuboid": {
      const x = n(d.type === "Cube" ? "size" : "width") / 2,
        y = n(d.type === "Cube" ? "size" : "height") / 2,
        z = n(d.type === "Cube" ? "size" : "depth") / 2;
      return {
        kind: "mesh",
        points: [
          [-x, -y, -z],
          [x, -y, -z],
          [x, y, -z],
          [-x, y, -z],
          [-x, -y, z],
          [x, -y, z],
          [x, y, z],
          [-x, y, z],
        ],
        indices: [
          0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7,
          6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7,
        ],
      };
    }
    case "Surface":
      return surface(...(d.resolution ?? [32, 32]), (u, v) =>
        coord("expressions", {
          u: d.uRange[0] + u * (d.uRange[1] - d.uRange[0]),
          v: d.vRange[0] + v * (d.vRange[1] - d.vRange[0]),
        }),
      );
  }
}
export function resampleGeometry(g: Geometry, count = 128): Vec3[] {
  const points = g.closed ? [...g.points, g.points[0]] : g.points;
  return Array.from({ length: count }, (_, i) =>
    along(points, i / (count - 1)),
  );
}
export function morphGeometry(
  from: Geometry,
  to: Geometry,
  p: number,
): Geometry {
  const target = resampleGeometry(to);
  return {
    kind: "path",
    points: resampleGeometry(from).map((v, i) => lerp3(v, target[i], p)),
    closed: p === 1 ? to.closed : from.closed,
  };
}

const cache = new WeakMap<
  CompiledObject,
  { key: string; geometry: Geometry }
>();
export function geometryFor(
  o: CompiledObject,
  values: Record<string, number>,
  dependency?: Geometry,
): Geometry {
  const keys = [
    ...new Set([...o.expressions.values()].flatMap((e) => e.dependencies)),
  ].sort();
  const key = JSON.stringify(keys.map((k) => values[k]));
  const cached = cache.get(o);
  if (!dependency && cached?.key === key) return cached.geometry;
  const geometry = generateGeometry(o, values, dependency);
  if (!dependency) cache.set(o, { key, geometry });
  return geometry;
}
