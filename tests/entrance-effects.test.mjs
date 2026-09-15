import test from "node:test";
import assert from "node:assert/strict";
import { compileScene, evaluateDocument } from "../dist/document/index.js";
import { shownPoints } from "../dist/player/adapter.js";
const scene = (object, events, type = "plane2d") => ({version:1, duration:5, spaces:[{name:"s",type,objects:[{id:"o",...object}]}],events});
const at = (c,t) => evaluateDocument(c,t).spaces[0].objects[0];
const close = (p,q) => p.forEach((x,i) => assert.ok(Math.abs(x-q[i])<1e-8,`${p} != ${q}`));

test("growth from a point and edge preserves anchors with translated geometry", () => {
  const shape = {type:"Rectangle",width:4,height:2,position:[3,1]};
  const point = compileScene(scene(shape,[{type:"GrowFromPoint",object:"s.o",point:[-2,-1],start:1,duration:2}]));
  assert.equal(at(point,0).visible,false);
  for (const p of at(point,1).geometry.points) close(p,[-2,-1,0]);
  const final = at(point,3).geometry.points;
  at(point,2).geometry.points.forEach((p,i)=>close(p, final[i].map((x,k)=>(x+[-2,-1,0][k])/2)));
  const edge = compileScene(scene(shape,[{type:"GrowFromEdge",object:"s.o",edge:"left",duration:2}]));
  for(const time of [0,0.5,1,2]) close(at(edge,time).geometry.points[0].map((x,i)=>i===1?1:x),[1,1,0]);
  assert.deepEqual(at(edge,2).geometry.points,final);
});

test("GrowArrow keeps a moved arrow's tail fixed and reaches its full endpoint", () => {
  const c = compileScene(scene({type:"Arrow",from:[-1,0],to:[2,1]},[
    {type:"Shift",object:"s.o",by:[3,2],duration:1},
    {type:"GrowArrow",object:"s.o",start:1,duration:2},
  ]));
  for(const time of [1,1.5,2,3]) close(at(c,time).geometry.points[0],[2,2,0]);
  close(at(c,2).geometry.points[1],[3.5,2.5,0]);
  assert.equal(at(c,2).arrowScale,0.5);
  close(at(c,3).geometry.points[1],[5,3,0]);
});

test("spin-in stays centered and restores exact final geometry in 3D", () => {
  const shape = {type:"Cube",size:2,position:[3,1,2]};
  const c = compileScene(scene(shape,[{type:"SpinInFromNothing",object:"s.o",duration:2}],"space3d"));
  for(const time of [0,0.5,1,1.5,2]) {
    const points=at(c,time).geometry.points;
    close([0,1,2].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length),[3,1,2]);
  }
  assert.deepEqual(at(c,2).geometry.points, at(compileScene(scene(shape,[],"space3d")),0).geometry.points);
});

test("border-then-fill separates stroke and fill and composes with erase and reentry", () => {
  const c = compileScene(scene({type:"Square",size:2},[
    {type:"DrawBorderThenFill",object:"s.o",duration:2},
    {type:"Uncreate",object:"s.o",start:2,duration:1},
    {type:"Add",object:"s.o",start:4},
  ]));
  assert.equal(at(c,0.5).reveal,0.5); assert.equal(at(c,0.5).fillReveal,0);
  assert.equal(at(c,1).reveal,1); assert.equal(at(c,1).fillReveal,0);
  assert.equal(at(c,1.5).reveal,1); assert.equal(at(c,1.5).fillReveal,0.5);
  assert.equal(at(c,2.5).fillReveal,0.5); assert.equal(at(c,3).visible,false);
  assert.equal(at(c,4).fillReveal,undefined); assert.equal(at(c,4).reveal,1);
});

test("passing flashes use arc length, never fill, and reset on Add", () => {
  const c=compileScene(scene({type:"Polyline",points:[[0,0],[1,0],[10,0]]},[
    {type:"ShowPassingFlash",object:"s.o",start:1,duration:2,timeWidth:0.2},
    {type:"Add",object:"s.o",start:4},
  ]));
  assert.equal(at(c,0).visible,false); assert.equal(at(c,1).visible,false);
  const middle=at(c,2), points=shownPoints(middle);
  close(points[0],[4,0,0]); close(points.at(-1),[6,0,0]);
  assert.equal(middle.fillReveal,0); assert.equal(at(c,3).visible,false);
  assert.equal(at(c,4).strokeRange,undefined);
  for(const time of [2,1.5,4,2.5]) {const expected=at(c,time);at(c,5);assert.deepEqual(at(c,time),expected);}
});

test("border-then-fill propagates both phases through nested path groups", () => {
  const c=compileScene({version:1,spaces:[{name:"s",type:"plane2d",objects:[
    {id:"square",type:"Square"},
    {id:"inner",type:"Group",children:["s.square"]},
    {id:"outer",type:"Group",children:["s.inner"]},
  ]}],events:[{type:"DrawBorderThenFill",object:"s.outer",duration:2}]});
  const child=t=>evaluateDocument(c,t).spaces[0].objects[0];
  assert.equal(child(0.5).reveal,0.5); assert.equal(child(0.5).fillReveal,0);
  assert.equal(child(1.5).reveal,1); assert.equal(child(1.5).fillReveal,0.5);
  assert.equal(child(2).fillReveal,1);
});

test("new events reject unsupported targets, dimensions and overlapping writers", () => {
  const square={type:"Square"};
  for(const event of [
    {type:"GrowArrow"}, {type:"GrowFromPoint",point:[1]},
    {type:"GrowFromEdge",edge:"front"}, {type:"ShowPassingFlash",timeWidth:2},
  ]) assert.throws(()=>compileScene(scene(square,[{object:"s.o",...event}])));
  assert.throws(()=>compileScene(scene({type:"Text",text:"hi"},[{type:"SpinInFromNothing",object:"s.o"}])));
  assert.throws(()=>compileScene(scene(square,[{type:"DrawBorderThenFill",object:"s.o"},{type:"Create",object:"s.o"}])));
  assert.throws(()=>compileScene(scene(square,[{type:"GrowFromPoint",object:"s.o",point:[0,0]},{type:"Shift",object:"s.o",by:[1,1]}])));
});
