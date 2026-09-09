import type {Lesson,SceneFrame} from './scene.ts';
import {evaluateScene} from './scene.ts';
import {renderScene,type RenderOptions} from './renderer.ts';
/** Small framework-independent facade. The host controls time and camera. */
export class Engine {
 constructor(public lesson:Lesson){}
 frame(time:number,parameter=this.lesson.initialA):SceneFrame{return evaluateScene(this.lesson,time,parameter)}
 render(ctx:CanvasRenderingContext2D,time:number,options:Omit<RenderOptions,'frame'>,parameter=this.lesson.initialA){return renderScene(ctx,{...options,frame:this.frame(time,parameter)})}
}
