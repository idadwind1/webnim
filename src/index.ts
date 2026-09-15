export * from "./authoring.ts";
export * from "./primitives.ts";
export { evaluateScene } from "./scene.ts";
export type { Lesson, SceneNode, ResolvedNode } from "./scene.ts";
export { executeCommand, initialShell } from "./shell.ts";
export * from "./theme.ts";
export { renderScene, hitTest } from "./renderer.ts";
export type { RenderOptions, HitTarget } from "./renderer.ts";
export * from "./camera.ts";
export type { SceneFrame, LessonStep } from "./scene.ts";
export type { Track, Easing } from "./timeline.ts";
export type { Expr } from "./math.ts";
export { Engine } from "./engine.ts";

export {
  compileScene,
  evaluateDocument,
  evaluateCamera,
  sceneSchemaV1,
  supportedObjects,
  supportedAnimations,
  supportedEvents,
  supportedSpaces,
  SceneValidationError,
} from "./document/index.ts";
export type {
  SceneDocument,
  SceneObject,
  SpaceDefinition,
  Animation,
  SceneEvent,
  CameraEvent,
  PictureInPictureObject,
  PictureInPictureFrame,
  DocumentFrame,
  CompiledScene,
} from "./document/index.ts";
