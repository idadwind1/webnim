import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileScene,evaluateDocument} from '../dist/document/index.js';
const fixture = async name => JSON.parse(await readFile(new URL(`../fixtures/${name}.json`,import.meta.url),'utf8'));
const close = (a,b) => a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-8, `${a} ≠ ${b}`));
test('Green fixture boundary is closed CCW and circulation equals the area for resized regions',async()=>{
 const c=compileScene(await fixture('greens-theorem'));
 for(const a of [.6,1.5,3]){
  const f=evaluateDocument(c,24,{a});const ps=f.spaces[0].objects.find(o=>o.id==='green.region').geometry.points;
  close(ps[0],ps.at(-1));
  let circulation=0;
  for(let i=1;i<ps.length;i++){const p=ps[i-1],q=ps[i]; circulation+=-(p[1]+q[1])/4*(q[0]-p[0])+(p[0]+q[0])/4*(q[1]-p[1]);}
  assert.ok(Math.abs(circulation-4*a*a)<1e-8);
 }
});
