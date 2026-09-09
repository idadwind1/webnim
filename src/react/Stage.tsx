import {resolveTheme,themeFrame,type ThemeOptions} from "../theme.ts";
import type {CSSProperties} from "react";
import { MathLabel } from "./MathLabel.tsx";
import { transform, inverse } from "../vector.ts";
import { useEffect, useRef, useState } from "react";
import {
  defaultCamera,
  panBy,
  screenToWorld,
  zoomAt,
  type Camera,
  type Vec,
  type Viewport,
} from "../camera.ts";
import {
  hitTest,
  nodeDescription,
  renderScene,
  type HitTarget,
} from "../renderer.ts";
import type { SceneFrame } from "../scene.ts";
import { formatNumber } from "../math.ts";
export interface StageProps {
  theme?:ThemeOptions;
  initialCamera?: Partial<Camera>;
  frame: SceneFrame;
  lessonId: string;
  highlight: string[];
  onHover: (id: string | null) => void;
  onSelect: (id: string | null) => void;
  onDragPoint: (a: number) => void;
  onCamera: (camera: Camera) => void;
  resetToken: number;
  focusToken: number;
  grid: boolean;
}
export function Stage(props: StageProps) {
  const theme=resolveTheme(props.theme);
  const themed=themeFrame(props.frame,theme);
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null);
  const hits = useRef<HitTarget[]>([]);
  const viewport = useRef<Viewport>({ width: 800, height: 600 });
  const camera = useRef<Camera>(defaultCamera(viewport.current));
  const current = useRef(props);
  current.current = props;
  const [size, setSize] = useState(viewport.current),
    [revision, setRevision] = useState(0),
    [tooltip, setTooltip] = useState<{ text: string; p: Vec } | null>(null),
    [cursor, setCursor] = useState("grab");
  const pointers = useRef(new Map<number, Vec>());
  const gesture = useRef<{
    kind: "point" | "pan";
    last: Vec;
    start: Vec;
    moved: boolean;
  } | null>(null);
  const pinching = useRef(false);
  const update = (next: Camera) => {
    camera.current = next;
    current.current.onCamera(next);
    setRevision((v) => v + 1);
  };
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let first = true;
    const observer = new ResizeObserver(([entry]) => {
      const next = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };
      viewport.current = next;
      setSize(next);
      if (first) {
        camera.current = ({...defaultCamera(next),...current.current.initialCamera});
        current.current.onCamera(camera.current);
        first = false;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    update(({...defaultCamera(viewport.current),...props.initialCamera}));
    setTooltip(null);
  }, [props.lessonId, props.resetToken]);
  useEffect(() => {
    if (props.focusToken === 0) return;
    const point = current.current.frame.nodes.find((n) => n.id === "P");
    if (point?.type === "point")
      update({
        ...camera.current,
        x: transform(point.at, point.matrix).x,
        y: transform(point.at, point.matrix).y,
        scale: Math.max(camera.current.scale, 220),
      });
  }, [props.focusToken]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(devicePixelRatio || 1, 3);
    const width = Math.round(size.width * dpr),
      height = Math.round(size.height * dpr);
    if (el.width !== width || el.height !== height) {
      el.width = width;
      el.height = height;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    hits.current = renderScene(ctx, {
      theme:props.theme,
      camera: camera.current,
      viewport: size,
      frame: props.frame,
      highlight: props.highlight,
      grid: props.grid,
    });
  }, [props.frame, props.highlight, props.grid, props.theme, size, revision]);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const dy =
        e.deltaY *
        (e.deltaMode === 1
          ? 16
          : e.deltaMode === 2
            ? viewport.current.height
            : 1);
      const factor = Math.exp(
        -Math.max(-120, Math.min(120, dy)) * (e.ctrlKey ? 0.012 : 0.003),
      );
      update(zoomAt(camera.current, viewport.current, p, factor));
      setTooltip(null);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  const local = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const finish = (e: React.PointerEvent<HTMLCanvasElement>, cancel = false) => {
    const g = gesture.current;
    if (!cancel && !pinching.current && g && !g.moved) {
      const target = hitTest(hits.current, local(e));
      props.onSelect(target?.id ?? null);
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      gesture.current = null;
      pinching.current = false;
      setCursor("grab");
    } else {
      const p = Array.from(pointers.current.values())[0];
      gesture.current = { kind: "pan", last: p, start: p, moved: true };
    }
  };
  const magnify = (factor: number) =>
    update(
      zoomAt(
        camera.current,
        viewport.current,
        { x: size.width / 2, y: size.height / 2 },
        factor,
      ),
    );
  return (
    <div className="stage axiom-stage" ref={host} style={{"--axiom-background":theme.background,"--axiom-foreground":theme.foreground,"--axiom-border":theme.axes} as CSSProperties}>
      <canvas
        ref={canvas}
        style={{ cursor }}
        tabIndex={0}
        aria-label="Interactive mathematical canvas. Drag empty space to pan. Scroll or pinch to zoom. Arrow keys pan, plus and minus zoom, zero resets the view. Drag point P to change its position."
        onKeyDown={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "=",
              "-",
              "0",
            ].includes(e.key)
          )
            e.preventDefault();
          switch (e.key) {
            case "ArrowLeft":
              update(panBy(camera.current, { x: 40, y: 0 }));
              break;
            case "ArrowRight":
              update(panBy(camera.current, { x: -40, y: 0 }));
              break;
            case "ArrowUp":
              update(panBy(camera.current, { x: 0, y: 40 }));
              break;
            case "ArrowDown":
              update(panBy(camera.current, { x: 0, y: -40 }));
              break;
            case "+":
            case "=":
              magnify(1.3);
              break;
            case "-":
              magnify(1 / 1.3);
              break;
            case "0":
              update(({...defaultCamera(size),...props.initialCamera}));
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.focus({ preventScroll: true });
          const p = local(e);
          pointers.current.set(e.pointerId, p);
          e.currentTarget.setPointerCapture(e.pointerId);
          setTooltip(null);
          if (pointers.current.size === 2) {
            pinching.current = true;
            gesture.current = null;
            return;
          }
          const hit = hitTest(hits.current, p);
          gesture.current = {
            kind: hit?.draggable ? "point" : "pan",
            last: p,
            start: p,
            moved: false,
          };
          setCursor(hit?.draggable ? "ew-resize" : "grabbing");
        }}
        onPointerMove={(e) => {
          const p = local(e);
          if (pointers.current.has(e.pointerId)) {
            const before = Array.from(pointers.current.values());
            pointers.current.set(e.pointerId, p);
            const after = Array.from(pointers.current.values());
            if (after.length === 2 && before.length === 2) {
              const midpoint = (ps: Vec[]) => ({
                x: (ps[0].x + ps[1].x) / 2,
                y: (ps[0].y + ps[1].y) / 2,
              });
              const oldMid = midpoint(before),
                newMid = midpoint(after);
              const d0 = Math.hypot(
                  before[0].x - before[1].x,
                  before[0].y - before[1].y,
                ),
                d1 = Math.hypot(
                  after[0].x - after[1].x,
                  after[0].y - after[1].y,
                );
              const zoomed = zoomAt(
                camera.current,
                viewport.current,
                oldMid,
                d0 > 0 ? d1 / d0 : 1,
              );
              update(
                panBy(zoomed, {
                  x: newMid.x - oldMid.x,
                  y: newMid.y - oldMid.y,
                }),
              );
              return;
            }
            const g = gesture.current;
            if (!g) return;
            g.moved ||= Math.hypot(p.x - g.start.x, p.y - g.start.y) > 3;
            if (g.kind === "point") {
              const point = props.frame.nodes.find((n) => n.id === "P");
              if (point) {
                try {
                  props.onDragPoint(
                    transform(
                      screenToWorld(p, camera.current, size),
                      inverse(point.matrix),
                    ).x,
                  );
                } catch {
                  /* A fully collapsed transform cannot be dragged. */
                }
              }
            } else
              update(
                panBy(camera.current, { x: p.x - g.last.x, y: p.y - g.last.y }),
              );
            g.last = p;
          } else {
            const hit = hitTest(hits.current, p);
            props.onHover(hit?.id ?? null);
            setCursor(hit?.draggable ? "ew-resize" : hit ? "pointer" : "grab");
            const node = props.frame.nodes.find((n) => n.id === hit?.id);
            setTooltip(node ? { text: nodeDescription(node), p } : null);
          }
        }}
        onPointerUp={(e) => finish(e)}
        onPointerCancel={(e) => finish(e, true)}
        onLostPointerCapture={(e) => {
          pointers.current.delete(e.pointerId);
          if (!pointers.current.size) {
            gesture.current = null;
            pinching.current = false;
          }
        }}
        onPointerLeave={() => {
          props.onHover(null);
          setTooltip(null);
        }}
      />
      {themed.nodes
        .filter((n) => n.type === "text" && n.math)
        .map((node) =>
          node.type === "text" ? (
            <MathLabel
              key={node.id}
              node={node}
              camera={camera.current}
              viewport={size}
              highlight={
                props.highlight.includes(node.id) ||
                node.ancestors.some((id) => props.highlight.includes(id))
              }
              onHover={props.onHover}
              onSelect={props.onSelect}
            />
          ) : null,
        )}
      {tooltip && (
        <div
          className="canvas-tooltip"
          style={{
            left: Math.max(8, Math.min(size.width - 235, tooltip.p.x + 16)),
            top: Math.max(8, Math.min(size.height - 44, tooltip.p.y - 38)),
          }}
        >
          {tooltip.text}
        </div>
      )}
      <div className="camera-tools">
        <button aria-label="Zoom in" onClick={() => magnify(1.4)}>
          +
        </button>
        <button aria-label="Zoom out" onClick={() => magnify(1 / 1.4)}>
          −
        </button>
        <span />
        <button
          aria-label="Reset camera"
          onClick={() => update(({...defaultCamera(size),...props.initialCamera}))}
        >
          ⌖
        </button>
      </div>
      <div className="camera-readout">
        <span className="live-dot" /> LIVE COORDINATES{" "}
        <span>
          {formatNumber(camera.current.x)} , {formatNumber(camera.current.y)}
        </span>
        <span className="unit-scale">
          {formatNumber(100 / camera.current.scale, 5)} units / 100px
        </span>
      </div>
    </div>
  );
}
