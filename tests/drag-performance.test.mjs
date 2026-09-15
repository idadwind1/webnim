import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileScene,evaluateDocument} from '../dist/document/index.js';
import {evaluateDragTarget} from '../dist/document/evaluator.js';
import {parameterFromDrag} from '../dist/player/drag.js';
import {createFrameQueue} from '../dist/player/frame-queue.js';
test('targeted drag evaluation matches complete frames including dependencies and transforms',async()=>{
 for(const [file,id,param] of [['four-spaces','plane.point','along'],['greens-theorem','green.size','a'],['greens-theorem','green.tracer','along']]){
  const doc=JSON.parse(await readFile(new URL(`../fixtures/${file}.json`,import.meta.url),'utf8'));
  doc.events.push({type:'ApplySpaceMatrix',space:id.split('.')[0],matrix:[[1,.3],[.2,1]],start:0,duration:1});
  const c=compileScene(doc);
  for(const time of [0,1,4,12])for(const value of [.2,.7,1]){
   const overrides={[param]:value}, full=evaluateDocument(c,time,overrides),target=evaluateDragTarget(c,time,overrides,id);
   assert.deepEqual(target.object,full.spaces.flatMap(s=>s.objects).find(o=>o.id===id));assert.deepEqual(target.parameters,full.parameters);
  }
 }
});
test('drag search does not evaluate unrelated parameter-dependent geometry',()=>{
 const c=compileScene({version:1,parameters:{a:0},spaces:[{name:'s',type:'plane2d',objects:[{id:'point',type:'Point',at:['a',0],drag:{parameter:'a',min:-4,max:4}},{id:'expensive',type:'FunctionGraph',expression:'a*sin(x)',domain:[-10,10],samples:2048}]}]});
 const expression=c.objects.get('s.expensive').expressions.get('expression'), evaluate=expression.evaluate;
 let calls=0;expression.evaluate=(values)=>{calls++;return evaluate(values)};
 const result=parameterFromDrag(c,0,{},'s.point',[120,0],p=>[p[0]*60,p[1]*60,0]);
 assert.ok(Math.abs(result.value-2)<1e-4);assert.equal(calls,0,'candidate search only visits the dragged dependency graph');
 evaluateDocument(c,0,{a:2});assert.ok(calls>0,'normal redraw still updates dependent visible geometry');
});
test('pointer samples coalesce per frame, flush on release, and cancel on disposal',()=>{
 const oldR=globalThis.requestAnimationFrame,oldC=globalThis.cancelAnimationFrame;let next=0;const frames=new Map(),consumed=[];
 globalThis.requestAnimationFrame=fn=>{frames.set(++next,fn);return next};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 try{const q=createFrameQueue(v=>consumed.push(v));q.push(1);q.push(2);q.push(3);assert.equal(frames.size,1);[...frames.values()][0]();assert.deepEqual(consumed,[3]);q.push(4);q.flush();assert.deepEqual(consumed,[3,4]);assert.equal(frames.size,0);q.push(5);q.cancel();assert.equal(frames.size,0);q.flush();assert.deepEqual(consumed,[3,4]);}finally{globalThis.requestAnimationFrame=oldR;globalThis.cancelAnimationFrame=oldC}
});
test('optimized inverse follows curved and transformed constraints accurately',async()=>{
 const doc=JSON.parse(await readFile(new URL('../fixtures/four-spaces.json',import.meta.url),'utf8'));
 doc.events.push({type:'ApplySpaceMatrix',space:'plane',matrix:[[1,.4],[.2,1]],start:0,duration:1});
 const c=compileScene(doc), project=p=>[400+p[0]*65,300-p[1]*65,p[2]];
 for(const along of [0,.13,.37,.84,1]){
  const p=evaluateDragTarget(c,4,{along},'plane.point').object.geometry.points[0], screen=project(p);
  const result=parameterFromDrag(c,4,{},'plane.point',screen.slice(0,2),project);
  const actual=project(evaluateDragTarget(c,4,{along:result.value},'plane.point').object.geometry.points[0]);
  assert.ok(Math.hypot(actual[0]-screen[0],actual[1]-screen[1])<.02);
 }
});
