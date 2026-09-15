export * from "./types.ts";
export { compileScene } from "./compiler.ts";
export type {
  CompiledScene,
  CompiledObject,
  CompiledTrack,
} from "./compiler.ts";
export { evaluateDocument, documentDefaultTheme } from "./evaluator.ts";
export {
  sceneSchemaV1,
  supportedObjects,
  supportedEvents,
  supportedAnimations,
  supportedSpaces,
} from "./schema.ts";
export {
  nativeToCartesian,
  cartesianToNative,
  projectPoint,
} from "./spatial.ts";
export { evaluateCamera } from "./camera.ts";

export { easingNames, easeProgress } from "./easing.ts";
