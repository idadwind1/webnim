import test from 'node:test';
import assert from 'node:assert/strict';
import {compileScene,evaluateDocument} from '../dist/document/index.js';
const scene=(objects,type='space3d',extra={})=>compileScene({version:1,spaces:[{name:'s',type,objects}],...extra});
const geometry=c=>evaluateDocument(c,0).spaces[0].objects[0].geometry;
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const area=(p,ix)=>ix.reduce((sum,_,i)=>{if(i%3)return sum;const [a,b,c]=ix.slice(i,i+3).map(j=>p[j]);return sum+Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;},0);
test('annular geometry preserves hole area, signed sweep and two independent outlines',()=>{
 for(const angle of [Math.PI/2,-Math.PI/2,2*Math.PI]){
  const g=geometry(scene([{id:'a',type:'AnnularSector',innerRadius:1,radius:2,angle}], 'plane2d'));
  assert.ok(Math.abs(area(g.points,g.indices)-Math.abs(angle)*1.5)<.004);
  assert.ok(g.points.every(p=>Math.hypot(...p)>=1-1e-8));
 }
 const g=geometry(scene([{id:'a',type:'Annulus',innerRadius:1,radius:2}], 'plane2d'));
 assert.deepEqual(g.breaks,[0,129]);
 assert.throws(()=>scene([{id:'a',type:'Annulus',innerRadius:2,radius:1}],'plane2d'));
});
test('planar hull removes duplicates and interior points; polygrams visit all vertices',()=>{
 const g=geometry(scene([{id:'h',type:'ConvexHull',points:[[0,0],[1,0],[1,1],[0,1],[.5,.5],[0,0]]}],'plane2d'));
 assert.equal(g.points.length,4);
 const star=geometry(scene([{id:'p',type:'RegularPolygram',sides:6,step:2}],'plane2d'));
 assert.deepEqual(star.breaks,[0,4]);assert.equal(star.points.length,8);
 assert.throws(()=>scene([{id:'h',type:'ConvexHull',points:[[0,0],[1,1],[2,2]]}],'plane2d'));
});
test('Platonic meshes have correct vertices, surface topology, outward winding and radius',()=>{
 for(const [type,vertices,triangles] of [['Icosahedron',12,20],['Dodecahedron',20,36]]){
  const g=geometry(scene([{id:'p',type,radius:2}]));
  assert.equal(g.points.length,vertices);assert.equal(g.indices.length,triangles*3);
  for(const p of g.points)near(Math.hypot(...p),2);
  for(let i=0;i<g.indices.length;i+=3){const [a,b,c]=g.indices.slice(i,i+3).map(j=>g.points[j]);const u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];assert.ok(n.reduce((s,x,k)=>s+x*a[k],0)>0);}
 }
});
test('3D hull merges coplanar facets and rejects flat input; custom shells validate topology',()=>{
 const points=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[0,0,0]];
 const g=geometry(scene([{id:'h',type:'ConvexHull3D',points}]));assert.equal(g.indices.length,36);
 assert.ok(!g.indices.includes(8));
 assert.throws(()=>scene([{id:'h',type:'ConvexHull3D',points:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]]}]));
 const tetra={id:'p',type:'Polyhedron',points:[[0,0,0],[1,0,0],[0,1,0],[0,0,1]],faces:[[0,1,2],[0,1,3],[0,2,3],[1,2,3]]};
 assert.equal(geometry(scene([tetra])).indices.length,12);
 assert.throws(()=>scene([{...tetra,faces:[[0,1,2],[0,1,3],[0,2,3],[0,1,2]]}]));
 assert.throws(()=>scene([{...tetra,faces:[[0,1,9],...tetra.faces.slice(1)]}]));
});
