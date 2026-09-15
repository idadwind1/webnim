import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
import { arrowTips, strokePaths } from "../dist/player/adapter.js";
import { createCanvasAdapter } from "../dist/player/canvas.js";
const doc = (objects, extra = {}) => ({ version: 1, spaces: [{ name: "s", type: "plane2d", objects }], ...extra });
const frame = (c, t = 0, parameters = {}) => evaluateDocument(c, t, parameters).spaces[0].objects;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("arcs pass through exact endpoints and all samples stay on the intended circle", () => {
  for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI, 0]) {
    const c = compileScene(doc([{ id: "arc", type: "ArcBetweenPoints", from: [-1, 0], to: [1, 0], angle }]));
    const points = frame(c)[0].geometry.points;
    assert.deepEqual(points[0], [-1, 0, 0]); assert.deepEqual(points.at(-1), [1, 0, 0]);
    if (!angle) assert.equal(points.length, 2);
    else {
      const cy = 1 / Math.tan(angle / 2), radius = Math.hypot(1, cy);
      for (const [x, y] of points) near(Math.hypot(x, y - cy), radius);
    }
  }
});

test("double and curved arrows have correctly oriented heads and respect Create", () => {
  for (const type of ["DoubleArrow", "CurvedArrow", "CurvedDoubleArrow"]) {
    const c = compileScene(doc([{ id: "a", type, from: [-2, 0], to: [2, 0] }], {
      events: [{ type: "Create", object: "s.a", duration: 2 }],
    }));
    assert.equal(arrowTips(frame(c, 0)[0]).length, 0);
    for (const t of [1, 2]) {
      const f = frame(c, t)[0], tips = arrowTips(f);
      assert.equal(tips.length, type === "CurvedArrow" ? 1 : 2);
      if (t === 2) assert.deepEqual(tips[0][0], [2, 0, 0]);
      if (tips.length === 2) assert.deepEqual(tips[1][0], [-2, 0, 0]);
    }
  }
});

test("dashes use world length, have real gaps, update with dependencies and bound work", () => {
  const c = compileScene(doc([
    { id: "point", type: "Point", at: ["a", 0] },
    { id: "dash", type: "DashedLine", from: [0, 0], to: ["s.point.x", 0], dashLength: 0.2, dashRatio: 0.5 },
  ], { parameters: { a: 2 } }));
  const paths = strokePaths(frame(c)[1]);
  assert.equal(paths.length, 5);
  near(paths[0][1][0], 0.2); near(paths[1][0][0], 0.4);
  assert.equal(strokePaths(frame(c, 0, { a: 4 })[1]).length, 10);
  const tiny = compileScene(doc([{ id: "dash", type: "DashedLine", from: [0, 0], to: [10, 0], dashLength: 1e-30 }]));
  assert.ok(strokePaths(frame(tiny)[0]).length <= 2048);
});

test("angle markers, rounded corners and triangles have correct dimensions", () => {
  const c = compileScene(doc([
    { id: "angle", type: "Angle", from: [2, 0], vertex: [0, 0], to: [0, 2], radius: 0.5 },
    { id: "right", type: "RightAngle", from: [2, 0], vertex: [0, 0], to: [0, 2], size: 0.3 },
    { id: "round", type: "RoundedRectangle", width: 4, height: 2, cornerRadius: 0.4 },
    { id: "triangle", type: "Triangle", radius: 2 },
  ]));
  const [angle, right, round, triangle] = frame(c).map(o => o.geometry);
  for (const [x, y] of angle.points) near(Math.hypot(x, y), 0.5);
  assert.deepEqual(right.points, [[0.3, 0, 0], [0.3, 0.3, 0], [0, 0.3, 0]]);
  near(Math.max(...round.points.map(p => p[0])), 2); near(Math.max(...round.points.map(p => p[1])), 1);
  assert.equal(round.closed, true); assert.equal(triangle.points.length, 3);
  for (const p of triangle.points) near(Math.hypot(...p), 2);
});

test("invalid helper geometry fails clearly instead of emitting broken frames", () => {
  for (const definition of [
    { type: "RoundedRectangle", width: 1, height: 1, cornerRadius: 2 },
    { type: "ArcBetweenPoints", from: [0, 0], to: [1, 0], angle: 2 * Math.PI },
    { type: "RightAngle", from: [1, 0], vertex: [0, 0], to: [1, 1] },
    { type: "Angle", from: [0, 0], vertex: [0, 0], to: [1, 1] },
    { type: "DashedLine", from: [0, 0], to: [1, 0], dashRatio: 1 },
  ]) assert.throws(() => compileScene(doc([{ id: "bad", ...definition }])));
});

test("Canvas renders and picks separate dashes and streamlines without bridges", () => {
  const c = compileScene(doc([
    { id: "dash", type: "DashedLine", from: [0, 2], to: [3, 2], dashLength: 0.25, dashRatio: 0.25 },
    { id: "flows", type: "StreamLines", expressions: [1, 0], seeds: [[0, -1], [0, 1]], step: 1, steps: 1 },
  ]));
  const saved = ["document", "window"].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  const strokes = []; let current = [], cursor;
  const ctx = new Proxy({
    beginPath() { current = []; cursor = undefined; },
    moveTo(x, y) { cursor = [x, y]; },
    lineTo(x, y) { if (cursor) current.push([cursor, [x, y]]); cursor = [x, y]; },
    stroke() { strokes.push(...current); },
  }, { get: (o, k) => k in o ? o[k] : () => {} });
  const canvas = { style: {}, getContext: () => ctx, addEventListener() {}, removeEventListener() {}, remove() {} };
  Object.defineProperty(globalThis, "document", { configurable: true, value: { createElement: () => canvas } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { devicePixelRatio: 1 } });
  let adapter;
  try {
    adapter = createCanvasAdapter({ ...c.document.spaces[0], grid: false, axes: false }, () => {});
    adapter.resize(800, 600); adapter.draw(evaluateDocument(c, 0).spaces[0], null);
    const pick = p => { const screen = adapter.project(p); return adapter.pick(screen[0], screen[1]); };
    assert.equal(pick([0.125, 2, 0]), "s.dash");
    assert.equal(pick([0.65, 2, 0]), null, "dash gap is not pickable");
    assert.equal(pick([0.5, 1, 0]), "s.flows");
    assert.equal(pick([0.5, 0, 0]), null, "no connecting stroke between seeds");
    assert.equal(strokes.length, 5, "three dashes and two independent streamlines");
  } finally {
    adapter?.dispose();
    for (const [k, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
    }
  }
});

test('Canvas annulus renders separate contours and picks the ring without filling its hole',()=>{
 const c=compileScene(doc([{id:'ring',type:'Annulus',innerRadius:1,radius:2,style:{fillOpacity:.5}}]));
 const saved=['document','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);let rule;
 const ctx=new Proxy({fill(value){rule=value;}},{get:(o,k)=>k in o?o[k]:()=>{}});
 const canvas={style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},remove(){}};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas}});Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1}});
 let adapter;
 try{adapter=createCanvasAdapter({...c.document.spaces[0],grid:false,axes:false},()=>{});adapter.resize(800,600);adapter.draw(evaluateDocument(c,0).spaces[0],null);const pick=p=>{const q=adapter.project(p);return adapter.pick(q[0],q[1]);};assert.equal(rule,'evenodd');assert.equal(pick([0,0,0]),null);assert.equal(pick([1.5,0,0]),'s.ring');assert.equal(strokePaths(frame(c)[0]).length,2);}
 finally{adapter?.dispose();for(const [k,d]of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}}
});

test('arc polygons join exact vertices and animated boundaries follow the source without hiding it',()=>{
 const c=compileScene(doc([{id:'arc',type:'ArcPolygon',points:[[-1,0],[1,0],[0,2]],angles:[.5,.5,.5]},{id:'boundary',type:'AnimatedBoundary',target:'s.arc',period:2}],{events:[{type:'Shift',object:'s.arc',by:[2,0],duration:2}]}));
 const f=frame(c,1);assert.ok(f[0].visible);assert.equal(f[0].geometry.closed,true);assert.deepEqual(f[0].geometry.points[0],[0,0,0]);assert.deepEqual(f[0].geometry.points.at(-1),[0,0,0]);assert.deepEqual(f[1].geometry.points,f[0].geometry.points);assert.deepEqual(f[1].strokeRange,[.375,.625]);assert.equal(f[1].fillReveal,0);
 const first=frame(c,1);frame(c,2);assert.deepEqual(frame(c,1),first);
 assert.throws(()=>compileScene(doc([{id:'arc',type:'ArcPolygon',points:[[0,0],[1,0],[0,1]],angles:[1,1,1,1]}])),/one sweep/);
});
