import { add3, sub3, lerp3, rotation, transform3 } from "./spatial.ts";
import type { CameraStep, SpaceDefinition, Vec3 } from "./types.ts";

/** Resolve authored framing for a viewport in CSS pixels, without browser dependencies. */
export function evaluateCamera(
  space: SpaceDefinition,
  steps: readonly CameraStep[],
  width: number,
  height: number,
) {
  if (!(
    width > 0 &&
    height > 0 &&
    Number.isFinite(width) &&
    Number.isFinite(height)
  ))
    throw new RangeError("Viewport dimensions must be positive and finite");
  let center: Vec3 = [...(space.camera?.center ?? [0, 0, 0])];
  let position: Vec3 = [...(space.camera?.position ?? [7, -9, 7])];
  let scale = space.camera?.scale ?? 60;
  for (const { event, progress: p } of steps) {
    if (event.type === "CameraZoom")
      scale *= Math.exp(Math.log(event.factor) * p);
    else if (event.type === "CameraMove") {
      position = lerp3(position, event.position, p);
      center = lerp3(center, event.center ?? center, p);
    } else if (event.type === "CameraOrbit") {
      position = add3(
        center,
        transform3(
          sub3(position, center),
          rotation(event.angle * p, event.axis ?? [0, 0, 1]),
        ),
      );
    } else {
      const target: Vec3 = [
        event.x[0] / 2 + event.x[1] / 2,
        event.y ? event.y[0] / 2 + event.y[1] / 2 : center[1],
        center[2],
      ];
      const fit = Math.min(
        width / (event.x[1] - event.x[0]),
        event.y ? height / (event.y[1] - event.y[0]) : Infinity,
      );
      position = add3(position, sub3(lerp3(center, target, p), center));
      center = center.map((v, i) => v * (1 - p) + target[i] * p) as Vec3;
      scale = Math.exp(Math.log(scale) * (1 - p) + Math.log(fit) * p);
    }
    if (
      !position.every(Number.isFinite) ||
      !center.every(Number.isFinite) ||
      (space.type === "space3d" &&
        Math.hypot(...sub3(position, center)) < 1e-10)
    )
      throw new RangeError(
        "Camera position must be finite and differ from center",
      );
    if (!(scale > 0 && Number.isFinite(scale)))
      throw new RangeError("Camera events exceed finite zoom limits");
  }
  return { center, position, scale };
}
