import test from 'node:test';
import assert from 'node:assert/strict';
import { compileScene, evaluateDocument } from '../dist/document/index.js';
import { validViewport, zoomCamera, gridValues } from '../dist/player/viewport.js';
import { sampleFunctionPlot } from '../dist/player/function-plot.js';
const camera = () => ({center:[0,0,0],scale:60,position:[0,0,1],projection:'orthographic'});
test('zoom exceeds old limits while retaining the cursor anchor and safe finite bounds',()=>{
 const c=camera(), anchor=200/c.scale;
 assert.equal(zoomCamera(c,8,200,100,800,600),true);
 assert.ok(c.scale>10000);assert.ok(Math.abs(c.center[0]+200/c.scale-anchor)<1e-12);
 zoomCamera(c,-20,0,0,800,600);assert.ok(c.scale<.5);
 zoomCamera(c,700,0,0,800,600);assert.ok(validViewport(c.center,c.scale,800,600));
 const before=structuredClone(c);zoomCamera(c,700,0,0,800,600);
 assert.ok(validViewport(c.center,c.scale,800,600));assert.ok(c.scale/before.scale<1.00001);
 const origin=camera();zoomCamera(origin,700,0,0,800,600);zoomCamera(origin,-1400,0,0,800,600);
 assert.ok(validViewport(origin.center,origin.scale,800,600));
 assert.equal(validViewport([1e15,0],10000,800,600),false);
});
test('grid work remains bounded at extreme scales and unrepresentable increments',()=>{
 for(const [min,max,step] of [[-1e300,1e300,1e298],[-1e-300,1e-300,1e-302],[1e20,1e20+1e6,1]]){
  const ticks=gridValues(min,max,step);assert.ok(ticks.length<=150);assert.ok(ticks.every(Number.isFinite));
 }
});
function plot(expression,domain,position){
 const doc={version:1,spaces:[{name:'s',type:'plane2d',objects:[{id:'f',type:'FunctionGraph',expression,...(domain?{domain}:{}),...(position?{position}: {})}]}]};
 return evaluateDocument(compileScene(doc),0).spaces[0].objects[0];
}
const bounds={minX:100,maxX:102,minY:-2,maxY:2};
const project=p=>[(p[0]-101)*400+400,300-p[1]*150,0];
test('function plots follow distant viewports, refine curves, and retain explicit domains',()=>{
 const object=plot('sin(x)');const points=sampleFunctionPlot(object,[],bounds,project,800);
 assert.equal(points[0][0],100);assert.equal(points.at(-1)[0],102);
 for(const p of points) assert.ok(Math.abs(p[1]-Math.sin(p[0]))<1e-12);
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],mid=(a[0]+b[0])/2;
  assert.ok(Math.abs(Math.sin(mid)-(a[1]+b[1])/2)*150<.8);
 }
 assert.ok(points.length<9000);
 const limited=sampleFunctionPlot(plot('x',[100.5,101.5]),[],bounds,project,800);
 assert.equal(limited[0][0],100.5);assert.equal(limited.at(-1)[0],101.5);
 assert.deepEqual(sampleFunctionPlot(plot('x',[-1,1]),[],bounds,project,800),[]);
 const shifted=sampleFunctionPlot(plot('x',undefined,[101,0]),[],bounds,project,800);
 assert.equal(shifted[0][0],100);assert.equal(shifted.at(-1)[0],102);
});
test('unresolved poles break the stroke and hostile functions have bounded sampling work',()=>{
 const view={minX:-1,maxX:1,minY:-2,maxY:2};
 const ps=sampleFunctionPlot(plot('1/(x-0.1)'),[],view,p=>[400+p[0]*400,300-p[1]*150,0],800);
 assert.ok(ps.some(p=>!p.every(Number.isFinite)));
 const busy=sampleFunctionPlot(plot('sin(100000*x)'),[],view,p=>[400+p[0]*400,300-p[1]*150,0],800);
 assert.ok(busy.length<9000);
});
