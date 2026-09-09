import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { worldToScreen, type Camera, type Viewport } from "../camera.ts";
import { transform } from "../vector.ts";
import type { ResolvedNode } from "../scene.ts";
export function MathLabel({
  node,
  camera,
  viewport,
  highlight,
  onHover,
  onSelect,
}: {
  node: Extract<ResolvedNode, { type: "text" }>;
  camera: Camera;
  viewport: Viewport;
  highlight: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(node.text, {
        throwOnError: false,
        trust: false,
        displayMode: false,
        maxExpand: 200,
        output: "htmlAndMathml",
      }),
    [node.text],
  );
  const p = worldToScreen(transform(node.at, node.matrix), camera, viewport),
    scale = Math.hypot(node.matrix[0], node.matrix[1]),
    angle = -Math.atan2(node.matrix[1], node.matrix[0]);
  if (
    node.opacity < 0.01 ||
    node.reveal <= 0 ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y)
  )
    return null;
  return (
    <button
      className="math-object"
      aria-label={`${node.name}: ${node.text}`}
      style={{
        position: "absolute",
        left: p.x,
        top: p.y,
        transform: `translate(-50%, -50%) rotate(${angle}rad)`,
        fontSize: node.fontSize * scale,
        opacity: node.opacity,
        color: node.color,
        padding: 3,
        margin: 0,
        border: 0,
        background: "transparent",
        whiteSpace: "nowrap",
        clipPath: `inset(0 ${(1 - node.reveal) * 100}% 0 0)`,
        filter: highlight ? "drop-shadow(0 0 6px currentColor)" : undefined,
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(node.id)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(node.id)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
