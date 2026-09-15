import { createFrameQueue } from "./frame-queue.ts";
import { evaluateCamera } from "../document/camera.ts";
import { initialCamera } from "./adapter.ts";
import { compileScene, type CompiledScene } from "../document/compiler.ts";
import { evaluateDocument } from "../document/evaluator.ts";
import {
  SceneValidationError,
  type DocumentFrame,
  type PictureInPictureObject,
} from "../document/types.ts";
import { createCanvasAdapter } from "./canvas.ts";
import { parameterFromDrag } from "./drag.ts";
import type { RenderAdapter, ViewCamera } from "./adapter.ts";
export interface PlayerEvent {
  type: "hover" | "click" | "parameter" | "time" | "error";
  object?: string | null;
  /** PiP instance ID, absent for the main view. */
  pictureInPicture?: string;
  parameter?: string;
  value?: number;
  time?: number;
  error?: Error;
}
export interface PlayerOptions {
  document: unknown;
  autoplay?: boolean;
  onEvent?: (event: PlayerEvent) => void;
}
export interface ScenePlayer {
  play(): void;
  pause(): void;
  seek(time: number): void;
  load(document: unknown): Promise<void>;
  setParameter(name: string, value: number): void;
  clearParameterOverrides(name?: string): void;
  resetCamera(space?: string): void;
  getCamera(space?: string): ViewCamera;
  getPictureInPictureCamera(id: string): ViewCamera;
  resetPictureInPictureCamera(id: string): void;
  getFrame(): DocumentFrame;
  on(listener: (event: PlayerEvent) => void): () => void;
  dispose(): void;
  readonly playing: boolean;
}
interface Layer {
  space: string;
  pip?: PictureInPictureObject;
  element: HTMLDivElement;
  labels: HTMLDivElement;
  adapter: RenderAdapter;
}
/** Browser-only entry point. Resource preparation and validation complete before load commits. */
export async function createPlayer(
  container: HTMLElement,
  options: PlayerOptions,
): Promise<ScenePlayer> {
  const root = document.createElement("div");
  root.className = "axiom-document-player";
  root.style.cssText =
    "position:relative;width:100%;height:100%;min-height:100px;overflow:hidden;touch-action:none";
  root.setAttribute("aria-label", "Interactive mathematical scene");
  const tooltip = document.createElement("div");
  tooltip.className = "axiom-object-caption";
  tooltip.setAttribute("role", "tooltip");
  tooltip.style.cssText =
    "display:none;position:absolute;z-index:2147483647;pointer-events:none;box-sizing:border-box;max-width:min(320px,calc(100% - 16px));max-height:calc(100% - 16px);overflow:hidden;padding:8px 10px;border:1px solid;border-radius:4px;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.4 system-ui,sans-serif";
  let compiled: CompiledScene,
    frame: DocumentFrame,
    layers = new Map<string, Layer>(),
    overrides: Record<string, number> = {},
    time = 0,
    playing = false,
    disposed = false,
    request = 0,
    last = 0,
    loadGeneration = 0,
    hover: string | null = null,
    dragging: string | null = null;
  let hoverLayer: string | null = null;
  let dragLayer: string | null = null;
  let downLayer: string | null = null;
  let downPosition: [number, number] | null = null;
  let hoverPosition: [number, number] | null = null;
  const listeners = new Set<(event: PlayerEvent) => void>();
  if (options.onEvent) listeners.add(options.onEvent);
  let math: typeof import("katex") | undefined;
  const emit = (event: PlayerEvent) => listeners.forEach((fn) => fn(event));
  const error = (e: Error) => {
    playing = false;
    emit({ type: "error", error: e });
  };
  const size = () => ({
    width: Math.max(1, container.clientWidth),
    height: Math.max(100, container.clientHeight),
  });
  const updateCaption = () => {
    const layer = layers.get(hoverLayer ?? frame.activeSpace);
    const space = frame.spaces.find((s) => s.name === layer?.space)!;
    const object = space?.objects.find((o) => o.id === hover);
    if (
      !layer ||
      layer.element.style.display === "none" ||
      !hoverPosition ||
      dragging ||
      !object?.visible ||
      object.opacity <= 0 ||
      object.reveal <= 0 ||
      !object.caption?.trim() ||
      (object.geometry.kind !== "text" &&
        layer.adapter.pick(
          hoverPosition[0] - (layer.pip?.x ?? 0),
          hoverPosition[1] - (layer.pip?.y ?? 0),
        ) !== hover)
    ) {
      tooltip.style.display = "none";
      return;
    }
    tooltip.textContent = object.caption;
    tooltip.style.background = space.theme.background;
    tooltip.style.color = space.theme.foreground;
    tooltip.style.borderColor = space.theme.axes;
    tooltip.style.display = "block";
    const [x, y] = hoverPosition;
    const { width, height } = size();
    const w = tooltip.offsetWidth,
      h = tooltip.offsetHeight;
    const left = x + 14 + w <= width - 8 ? x + 14 : x - w - 14;
    const top = y + 14 + h <= height - 8 ? y + 14 : y - h - 14;
    tooltip.style.left = Math.max(8, Math.min(left, width - w - 8)) + "px";
    tooltip.style.top = Math.max(8, Math.min(top, height - h - 8)) + "px";
  };
  const labels = (layer: Layer, spaceName: string) => {
    const space = frame.spaces.find((s) => s.name === spaceName)!;
    const wanted = new Set<string>();
    for (const object of space.objects) {
      if (
        object.geometry.kind !== "text" ||
        !object.visible ||
        !object.geometry.points.length
      )
        continue;
      wanted.add(object.id);
      let label = [...layer.labels.children].find(
        (el) => (el as HTMLElement).dataset.object === object.id,
      ) as HTMLDivElement | undefined;
      if (!label) {
        label = document.createElement("div");
        label.dataset.object = object.id;
        label.style.cssText =
          "position:absolute;white-space:pre;pointer-events:auto;transform-origin:center;cursor:default";
        layer.labels.append(label);
      }
      const text = object.geometry.text ?? "";
      if (label.dataset.text !== text) {
        if (object.geometry.math)
          math!.render(text, label, {
            throwOnError: true,
            trust: false,
            strict: "error",
          });
        else label.textContent = text;
        label.dataset.text = text;
      }
      const p = layer.adapter.project(object.geometry.points[0]),
        scale = Math.hypot(
          object.matrix[0],
          object.matrix[4],
          object.matrix[8],
        );
      label.style.left = p[0] + "px";
      label.style.top = p[1] + "px";
      label.style.color = object.color;
      label.style.opacity = String(object.opacity);
      label.style.fontSize = (object.style.fontSize ?? 20) * scale + "px";
      label.style.transform = "translate(-50%,-50%)";
      label.style.display =
        space.type === "space3d" && (p[2] < -1 || p[2] > 1) ? "none" : "";
    }
    for (const element of [...layer.labels.children])
      if (!wanted.has((element as HTMLElement).dataset.object!))
        element.remove();
  };
  const authoredCameras = new Map<string, ReturnType<typeof evaluateCamera>>();
  const applyCamera = (
    scene: CompiledScene,
    at: DocumentFrame,
    name: string,
    adapter: RenderAdapter,
    previous?: ReturnType<typeof evaluateCamera>,
    viewport = size(),
  ) => {
    const definition = scene.document.spaces.find((s) => s.name === name)!;
    const { width, height } = viewport;
    const next = evaluateCamera(
      definition,
      at.spaces.find((s) => s.name === name)!.camera,
      width,
      height,
    );
    const before = previous ?? evaluateCamera(definition, [], width, height);
    const current = adapter.camera;
    const delta = next.center.map((v, i) => v - before.center[i]);
    adapter.setCamera({
      ...current,
      center: current.center.map((v, i) => v + delta[i]) as [
        number,
        number,
        number,
      ],
      position: current.position.map((v, i) => v + next.position[i] - before.position[i]) as [
        number,
        number,
        number,
      ],
      scale: current.scale * (next.scale / before.scale),
    });
    return next;
  };
  const draw = () => {
    if (disposed || !compiled) return;
    try {
      frame = evaluateDocument(compiled, time, overrides);
      for (const [name, layer] of layers) {
        authoredCameras.set(
          name,
          applyCamera(
            compiled,
            frame,
            layer.space,
            layer.adapter,
            authoredCameras.get(name),
            layer.pip ?? size(),
          ),
        );
        const pip =
          layer.pip &&
          frame.pictureInPictures.find((p) => p.id === layer.pip!.id);
        const visible = layer.pip
          ? pip
            ? { opacity: pip.opacity }
            : undefined
          : frame.layers.find((l) => l.space === name);
        const interactive =
          !!visible && (!!layer.pip || name === frame.activeSpace);
        layer.element.style.display = visible ? "block" : "none";
        layer.element.style.opacity = String(
          !layer.pip &&
            frame.layers.length === 2 &&
            frame.layers[0].space === name
            ? 1
            : (visible?.opacity ?? 0),
        );
        layer.element.style.zIndex = String(
          layer.pip
            ? 10 + [...layers.keys()].indexOf(name)
            : name === frame.activeSpace
              ? 2
              : 1,
        );
        layer.element.style.pointerEvents = interactive ? "auto" : "none";
        layer.adapter.navigate(interactive && !dragging);
        if (visible) {
          layer.adapter.draw(
            frame.spaces.find((s) => s.name === layer.space)!,
            hoverLayer === name ? hover : null,
          );
          labels(layer, layer.space);
        }
      }
      updateCaption();
    } catch (e) {
      error(e instanceof Error ? e : new Error(String(e)));
    }
  };
  const resize = () => {
    const { width, height } = size();
    for (const layer of layers.values())
      layer.adapter.resize(
        layer.pip?.width ?? width,
        layer.pip?.height ?? height,
      );
    draw();
  };
  const loop = (stamp: number) => {
    request = 0;
    if (!playing || disposed) return;
    time = Math.min(compiled.duration, time + (stamp - last) / 1000);
    last = stamp;
    draw();
    emit({ type: "time", time });
    if (time >= compiled.duration) playing = false;
    if (playing) request = requestAnimationFrame(loop);
  };
  const pause = () => {
    playing = false;
    if (request) cancelAnimationFrame(request);
    request = 0;
  };
  const load = async (documentValue: unknown) => {
    if (disposed) throw new Error("Player is disposed");
    const generation = ++loadGeneration,
      next = compileScene(documentValue),
      prepared = new Map<string, Layer>();
    try {
      if (
        next.document.spaces.some((s) =>
          s.objects.some((o) => o.type === "MathTex"),
        )
      ) {
        math = await import("katex");
        const probe = window.document.createElement("div");
        probe.style.cssText =
          "position:absolute;left:-100000px;visibility:hidden";
        try {
          for (const [si, s] of next.document.spaces.entries())
            for (const [oi, o] of s.objects.entries())
              if (o.type === "MathTex") {
                const label = window.document.createElement("span");
                try {
                  math.render(o.text, label, {
                    throwOnError: true,
                    trust: false,
                    strict: "error",
                  });
                } catch (e) {
                  throw new SceneValidationError([
                    {
                      path: `$.spaces[${si}].objects[${oi}].text`,
                      message: String(e),
                    },
                  ]);
                }
                probe.append(label);
              }
          container.append(probe);
          void probe.offsetWidth;
          await window.document.fonts.ready;
          if (
            [...window.document.fonts].some(
              (font) =>
                font.family.startsWith("KaTeX") && font.status === "error",
            )
          )
            throw new Error(
              "Required math fonts are unavailable. Import @axiom-math/engine/browser/style.css and serve its fonts.",
            );
        } finally {
          probe.remove();
        }
      }
      const three = next.document.spaces.some((s) => s.type === "space3d")
        ? await import("./three.ts")
        : undefined;
      const { width, height } = size();
      const views = [
        ...next.document.spaces.map((space) => ({
          key: space.name,
          space,
          pip: undefined as PictureInPictureObject | undefined,
        })),
        ...[...next.objects.values()].flatMap((o) =>
          o.definition.type === "PictureInPicture"
            ? [
                {
                  key: `pip:${o.id}`,
                  space: next.document.spaces.find(
                    (s) =>
                      s.name === (o.definition as PictureInPictureObject).space,
                  )!,
                  pip: { ...o.definition, id: o.id },
                },
              ]
            : [],
        ),
      ];
      for (const { key, space, pip } of views) {
        const element = window.document.createElement("div"),
          labelLayer = window.document.createElement("div");
        element.dataset.view = key;
        if (pip) element.dataset.pip = pip.id;
        element.style.cssText = pip
          ? `position:absolute;left:${pip.x}px;top:${pip.y}px;width:${pip.width}px;height:${pip.height}px;overflow:hidden;outline:1px solid #888`
          : "position:absolute;inset:0;overflow:hidden";
        labelLayer.style.cssText =
          "position:absolute;inset:0;pointer-events:none";
        // Camera navigation reuses the evaluated frame and redraws only this view.
        const cameraChanged = () => {
          const layer = layers.get(key);
          if (disposed || !layer || layer.element.style.display === "none")
            return;
          layer.adapter.draw(
            frame.spaces.find((s) => s.name === layer.space)!,
            hoverLayer === key ? hover : null,
          );
          labels(layer, layer.space);
          updateCaption();
        };
        const adapter =
          space.type === "space3d"
            ? three!.createThreeAdapter(space, cameraChanged, error)
            : createCanvasAdapter(space, cameraChanged);
        adapter.resize(pip?.width ?? width, pip?.height ?? height);
        element.append(adapter.element, labelLayer);
        prepared.set(key, {
          space: space.name,
          pip,
          element,
          labels: labelLayer,
          adapter,
        });
      }
      if (disposed || generation !== loadGeneration) {
        for (const layer of prepared.values()) layer.adapter.dispose();
        return;
      }
      const initial = evaluateDocument(next, 0);
      const preparedCameras = new Map<
        string,
        ReturnType<typeof evaluateCamera>
      >();
      for (const [name, layer] of prepared) {
        preparedCameras.set(
          name,
          applyCamera(
            next,
            initial,
            layer.space,
            layer.adapter,
            undefined,
            layer.pip ?? size(),
          ),
        );
        layer.adapter.draw(
          initial.spaces.find((s) => s.name === layer.space)!,
          null,
        );
      }
      pause();
      authoredCameras.clear();
      for (const [name, camera] of preparedCameras)
        authoredCameras.set(name, camera);
      for (const layer of layers.values()) layer.adapter.dispose();
      dragUpdates.cancel();
      layers = prepared;
      compiled = next;
      overrides = {};
      time = 0;
      hover = null;
      hoverLayer = dragLayer = downLayer = null;
      hoverPosition = null;
      dragging = null;
      root.replaceChildren(
        ...[...layers.values()].map((l) => l.element),
        tooltip,
      );
      if (!root.parentElement) container.append(root);
      draw();
    } catch (e) {
      for (const layer of prepared.values()) layer.adapter.dispose();
      throw e;
    }
  };
  const pointer = (e: PointerEvent) => {
    const r = root.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };
  const viewAt = (e: PointerEvent) =>
    (e.target as HTMLElement).closest<HTMLElement>("[data-view]")?.dataset
      .view ?? frame.activeSpace;
  const localPointer = (e: PointerEvent, key: string) => {
    const p = pointer(e),
      pip = layers.get(key)?.pip;
    return [p[0] - (pip?.x ?? 0), p[1] - (pip?.y ?? 0)] as [number, number];
  };
  const pick = (e: PointerEvent) => {
    const label = (e.target as HTMLElement).closest(
      "[data-object]",
    ) as HTMLElement | null;
    return (
      label?.dataset.object ??
      layers.get(viewAt(e))!.adapter.pick(...localPointer(e, viewAt(e)))
    );
  };
  const down = (e: PointerEvent) => {
    downPosition = pointer(e);
    downLayer = viewAt(e);
    const id = pick(e),
      definition = id ? compiled.objects.get(id)?.definition : undefined;
    if (definition && "drag" in definition && definition.drag) {
      pause();
      dragging = id!;
      root.style.cursor = "grabbing";
      dragLayer = downLayer;
      tooltip.style.display = "none";
      layers.get(dragLayer!)!.adapter.navigate(false);
      root.setPointerCapture(e.pointerId);
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const dragUpdates = createFrameQueue<[number, number]>((position) => {
    if (!dragging || !dragLayer || disposed) return;
    const value = parameterFromDrag(compiled, time, overrides, dragging, position, layers.get(dragLayer)!.adapter.project);
    if (value && overrides[value.parameter] !== value.value) {
      overrides[value.parameter] = value.value;
      draw();
      emit({ type: "parameter", object: dragging, ...value });
    }
  });
  const move = (e: PointerEvent) => {
    hoverPosition = pointer(e);
    if (dragging) {
      dragUpdates.push(localPointer(e, dragLayer!));
      e.stopPropagation();
      return;
    }
    const next = pick(e);
    const definition = next
      ? compiled.objects.get(next)?.definition
      : undefined;
    root.style.cursor =
      definition && "drag" in definition && definition.drag ? "grab" : "";
    if (next !== hover || hoverLayer !== viewAt(e)) {
      hoverLayer = viewAt(e);
      hover = next;
      draw();
      emit({
        type: "hover",
        object: hover,
        pictureInPicture: layers.get(hoverLayer!)?.pip?.id,
      });
    } else updateCaption();
  };
  const up = (e: PointerEvent) => {
    if (dragging) {
      if (e.type === "pointercancel") dragUpdates.cancel(); else dragUpdates.flush();
      dragging = null;
      root.style.cursor = "grab";
      layers.get(dragLayer!)!.adapter.navigate(true);
      dragLayer = null;
      draw();
    } else if (
      downPosition &&
      downLayer === viewAt(e) &&
      Math.hypot(...pointer(e).map((v, i) => v - downPosition![i])) < 5
    )
      emit({
        type: "click",
        object: pick(e),
        pictureInPicture: layers.get(viewAt(e))?.pip?.id,
      });
    downPosition = null;
  };
  const leave = () => {
    hoverPosition = null;
    tooltip.style.display = "none";
    if (hover) {
      hover = null;
      emit({ type: "hover", object: null });
      draw();
    }
  };
  root.addEventListener("pointerdown", down, true);
  root.addEventListener("pointermove", move, true);
  root.addEventListener("pointerup", up, true);
  root.addEventListener("pointercancel", up, true);
  root.addEventListener("pointerleave", leave);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const player: ScenePlayer = {
    get playing() {
      return playing;
    },
    play() {
      if (disposed) throw new Error("Player is disposed");
      if (playing) return;
      if (time >= compiled.duration) time = 0;
      playing = true;
      last = performance.now();
      request = requestAnimationFrame(loop);
    },
    pause,
    seek(value) {
      if (!Number.isFinite(value)) throw new Error("Time must be finite");
      time = Math.max(0, Math.min(compiled.duration, value));
      last = performance.now();
      draw();
      emit({ type: "time", time });
    },
    load,
    setParameter(name, value) {
      evaluateDocument(compiled, time, { ...overrides, [name]: value });
      overrides = { ...overrides, [name]: value };
      draw();
      emit({ type: "parameter", parameter: name, value });
    },
    clearParameterOverrides(name) {
      if (name === undefined) overrides = {};
      else delete overrides[name];
      draw();
    },
    resetCamera(name = frame.activeSpace) {
      const layer = layers.get(name);
      if (!layer) throw new Error(`Unknown space ${name}`);
      const definition = compiled.document.spaces.find((s) => s.name === name)!;
      layer.adapter.navigate(false);
      layer.adapter.setCamera(initialCamera(definition));
      authoredCameras.delete(name);
      draw();
    },
    getCamera(name = frame.activeSpace) {
      const layer = layers.get(name);
      if (!layer) throw new Error(`Unknown space ${name}`);
      return structuredClone(layer.adapter.camera);
    },
    getPictureInPictureCamera(id) {
      const layer = layers.get(`pip:${id}`);
      if (!layer) throw new Error(`Unknown picture-in-picture ${id}`);
      return structuredClone(layer.adapter.camera);
    },
    resetPictureInPictureCamera(id) {
      const key = `pip:${id}`,
        layer = layers.get(key);
      if (!layer) throw new Error(`Unknown picture-in-picture ${id}`);
      layer.adapter.navigate(false);
      layer.adapter.setCamera(
        initialCamera(
          compiled.document.spaces.find((s) => s.name === layer.space)!,
        ),
      );
      authoredCameras.delete(key);
      draw();
    },
    getFrame() {
      return structuredClone(frame);
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      dragUpdates.cancel();
      loadGeneration++;
      pause();
      observer.disconnect();
      root.removeEventListener("pointerdown", down, true);
      root.removeEventListener("pointermove", move, true);
      root.removeEventListener("pointerup", up, true);
      root.removeEventListener("pointercancel", up, true);
      root.removeEventListener("pointerleave", leave);
      for (const layer of layers.values()) layer.adapter.dispose();
      layers.clear();
      listeners.clear();
      root.remove();
    },
  };
  try {
    await load(options.document);
  } catch (e) {
    player.dispose();
    throw e;
  }
  if (options.autoplay) player.play();
  return player;
}
export type { ViewCamera } from "./adapter.ts";
