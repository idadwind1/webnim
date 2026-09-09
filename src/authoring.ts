import { executeCommand, initialShell, type ShellState } from "./shell.ts";
import type { SceneNode, Lesson } from "./scene.ts";
export type Animation =
  | { kind: "command"; command: string }
  | {
      kind: "parallel" | "sequence" | "stagger";
      animations: Animation[];
      lag?: number;
    };
const command = (text: string): Animation => ({
  kind: "command",
  command: text,
});
export const Create = (id: string, seconds = 1) =>
  command(`write ${id} ${seconds}`);
export const Write = Create;
export const FadeIn = (id: string, seconds = 1) =>
  command(`fadein ${id} ${seconds}`);
export const FadeOut = (id: string, seconds = 1) =>
  command(`fadeout ${id} ${seconds}`);
export const Rotate = (id: string, radians: number, seconds = 1) =>
  command(`rotate ${id} ${radians} ${seconds}`);
export const Shift = (id: string, x: number, y: number, seconds = 1) =>
  command(`shift ${id} ${x} ${y} ${seconds}`);
export const Scale = (id: string, factor: number, seconds = 1) =>
  command(`scale ${id} ${factor} ${seconds}`);
export const Transform = (source: string, target: string, seconds = 1) =>
  command(`transform ${source} ${target} ${seconds}`);
export const Indicate = (id: string, seconds = 1) =>
  command(`indicate ${id} ${seconds}`);
export const MoveAlongPath = (id: string, path: string, seconds = 1) =>
  command(`follow ${id} ${path} ${seconds}`);
export const Wait = (seconds = 1) => command(`wait ${seconds}`);
export const AnimationGroup = (...animations: Animation[]): Animation => ({
  kind: "parallel",
  animations,
});
export const Succession = (...animations: Animation[]): Animation => ({
  kind: "sequence",
  animations,
});
export const LaggedStart = (
  lag: number,
  ...animations: Animation[]
): Animation => ({ kind: "stagger", lag, animations });
export class SceneBuilder {
  private state: ShellState = initialShell();
  private cursor = 0;
  add(...objects: (SceneNode | SceneNode[])[]): this {
    for (const node of objects.flat()) {
      if (this.state.lesson.nodes.some((n) => n.id === node.id))
        throw new Error(`Duplicate ID: ${node.id}`);
      this.state.lesson.nodes.push(structuredClone(node));
      if (this.cursor > 0)
        this.state.lesson.tracks.push({
          target: node.id,
          property: "opacity",
          start: this.cursor,
          duration: 1e-6,
          from: 0,
          to: node.opacity ?? 1,
        });
    }
    return this;
  }
  private schedule(animation: Animation, start: number): number {
    if (animation.kind === "command") {
      const before = new Set(this.state.lesson.tracks);
      this.state = executeCommand(
        { ...this.state, time: start },
        animation.command,
      ).state;
      return Math.max(
        start,
        ...this.state.lesson.tracks
          .filter((t) => !before.has(t))
          .map((t) => t.start + t.duration),
      );
    }
    let end = start;
    animation.animations.forEach((child, i) => {
      const childStart =
        animation.kind === "sequence"
          ? end
          : animation.kind === "stagger"
            ? start + i * (animation.lag ?? 0)
            : start;
      end = Math.max(end, this.schedule(child, childStart));
    });
    return end;
  }
  play(...animations: Animation[]): this {
    this.cursor = this.schedule(AnimationGroup(...animations), this.cursor);
    return this;
  }
  wait(seconds = 1): this {
    return this.play(Wait(seconds));
  }
  build(): Lesson {
    return structuredClone({
      ...this.state.lesson,
      duration: Math.max(this.cursor, this.state.lesson.duration),
    });
  }
}
