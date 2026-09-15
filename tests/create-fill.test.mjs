import test from 'node:test';
import assert from 'node:assert/strict';
import {compileScene,evaluateDocument} from '../dist/document/index.js';
import {createCanvasAdapter} from '../dist/player/canvas.js';
test('Create and Uncreate fade a closed fill continuously without closing the partial outline',()=>{
 const compiled=compileScene({version:1,spaces:[{name:'s',type:'plane2d',axes:false,ticks:false,grid:false,objects:[{id:'square',type:'Square',size:2,style:{opacity:.8,fillOpacity:.5}}]}],events:[{type:'Create',object:'s.square',duration:1},{type:'Uncreate',object:'s.square',start:2,duration:1}]});
 const saved=['document','window'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 let fills=[],strokes=[],closed=false;
 const ctx=new Proxy({globalAlpha:1,beginPath(){closed=false},closePath(){closed=true},fill(){fills.push(this.globalAlpha)},stroke(){strokes.push(closed)}},{get:(o,k)=>k in o?o[k]:()=>{}});
 const canvas={style:{},getContext:()=>ctx,addEventListener(){},removeEventListener(){},remove(){}};
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>canvas}});
 Object.defineProperty(globalThis,'window',{configurable:true,value:{devicePixelRatio:1}});
 let adapter;
 try{
  adapter=createCanvasAdapter(compiled.document.spaces[0],()=>{});adapter.resize(800,600);
  for(const [time,progress] of [[0,0],[.25,.25],[.5,.5],[.999,.999],[1,1],[2.25,.75],[2.999,.001],[3,0],[.5,.5]]){
   fills=[];strokes=[];adapter.draw(evaluateDocument(compiled,time).spaces[0],null);
   assert.ok(Math.abs((fills[0]??0)-.4*progress)<1e-9,`fill alpha at ${time}: ${fills}`);
   if(progress>0&&progress<1)assert.equal(strokes.at(-1),false,'no diagonal closing stroke during Create');
  }
  const border=compileScene({version:1,spaces:compiled.document.spaces,events:[{type:'DrawBorderThenFill',object:'s.square',duration:2}]});
  for(const [time,alpha] of [[.5,0],[1,0],[1.5,.2],[2,.4]]){
   fills=[];strokes=[];adapter.draw(evaluateDocument(border,time).spaces[0],null);
   assert.ok(Math.abs((fills[0]??0)-alpha)<1e-9,`border-then-fill alpha at ${time}`);
  }
  const flash=compileScene({version:1,spaces:compiled.document.spaces,events:[{type:'ShowPassingFlash',object:'s.square',duration:2}]});
  fills=[];strokes=[];adapter.draw(evaluateDocument(flash,1).spaces[0],null);
  assert.equal(fills.length,0,'flash never fills the square');
  assert.equal(strokes.at(-1),false,'flash does not close its moving segment');
  assert.equal(adapter.pick(400,300),null,'flash does not pick the invisible square interior');
 }finally{adapter?.dispose();for(const [k,d] of saved){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}}
});
