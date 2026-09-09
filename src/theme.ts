import type {SceneFrame} from './scene.ts';
/** View-local colors. Omitted values retain the dark default theme. */
export interface EngineTheme {
 background:string; gridMinor:string; gridMajor:string; axes:string;
 tickLabels:string; axisLabels:string; foreground:string;
 /** Override any scene object's authored color by its stable ID. */
 objectColors:Record<string,string>;
 /** Replace authored colors globally in this view, without mutating the scene. */
 palette:Record<string,string>;
}
export type ThemeOptions=Partial<EngineTheme>;
export const defaultTheme:Readonly<EngineTheme>=Object.freeze({background:'#171c22',gridMinor:'#ffffff04',gridMajor:'#ffffff09',axes:'#59626c',tickLabels:'#7c858e',axisLabels:'#9aa2a9',foreground:'#dce3d7',objectColors:Object.freeze({}),palette:Object.freeze({})});
export const lightTheme:Readonly<EngineTheme>=Object.freeze({...defaultTheme,background:'#f7faf5',gridMinor:'#00000008',gridMajor:'#00000015',axes:'#778477',tickLabels:'#526452',axisLabels:'#354935',foreground:'#203024'});
export function resolveTheme(options:ThemeOptions={}):EngineTheme{return {...defaultTheme,...options,objectColors:{...options.objectColors},palette:{...options.palette}}}
export function themeFrame(frame:SceneFrame,options:ThemeOptions={}):SceneFrame {return {...frame,nodes:frame.nodes.map(node=>({...node,color:options.objectColors?.[node.id]??options.palette?.[node.color]??node.color}))}}
