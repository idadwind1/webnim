import test from 'node:test';
import assert from 'node:assert/strict';
import {compileScene,evaluateDocument} from '../dist/document/index.js';
const documentFor = object => ({version:1,spaces:[{name:'s',type:'plane2d',objects:[{id:'f',...object}]}]});
const points=doc=>evaluateDocument(compileScene(doc),0).spaces[0].objects[0].geometry.points;
test('omitted graph domains equal explicit defaults without modifying the authored document',()=>{
 for(const [object,domain] of [[{type:'FunctionGraph',expression:'sin(x)'},[-10,10]],[{type:'PolarGraph',expression:'2*cos(3*theta)'},[0,2*Math.PI]],[{type:'ParametricCurve',expressions:['u','u^2']},[0,1]]]){
  const doc=documentFor(object);assert.deepEqual(points(doc),points(documentFor({...object,domain})));
  assert.equal('domain' in compileScene(doc).document.spaces[0].objects[0],false);
  assert.equal('domain' in doc.spaces[0].objects[0],false);
 }
});
test('explicit domains still override defaults and invalid ranges are rejected',()=>{
 const object={type:'FunctionGraph',expression:'x^2',domain:[2,4]};const ps=points(documentFor(object));
 assert.deepEqual(ps[0],[2,4,0]);assert.deepEqual(ps.at(-1),[4,16,0]);
 for(const domain of [[1,1],[2,-2],[0,Infinity],[],[0],null])assert.throws(()=>compileScene(documentFor({...object,domain})));
});
