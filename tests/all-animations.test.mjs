import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileScene,evaluateDocument,supportedEvents} from '../dist/document/index.js';
const read = async file => JSON.parse(await readFile(new URL(`../fixtures/${file}`,import.meta.url),'utf8'));
test('animation demo covers every supported event, with finite seekable chapters',async()=>{
 const doc=await read('all-animations.json'), chapters=await read('all-animations.chapters.json'), compiled=compileScene(doc);
 const types=new Set(); const walk=es=>es.forEach(e=>{types.add(e.type);if(e.events)walk(e.events)});walk(doc.events);
 assert.deepEqual([...types].sort(),[...supportedEvents].sort());
 assert.deepEqual(chapters.filter(c=>c.name!=='Easing').map(c=>c.name).sort(),[...supportedEvents].sort());
 assert.equal(chapters.at(-1).end,compiled.duration);
 for(const c of chapters){
  for(const time of [c.start,c.start+2.25,c.end-.3]){
   const f=evaluateDocument(compiled,time);assert.deepEqual(f.diagnostics,[],c.name);
   assert.ok(f.spaces.flatMap(s=>s.objects).every(o=>o.geometry.points.every(p=>p.every(Number.isFinite))),c.name);
  }
  const time=c.start+2.25, first=evaluateDocument(compiled,time);evaluateDocument(compiled,compiled.duration);assert.deepEqual(evaluateDocument(compiled,time),first);
 }
});
