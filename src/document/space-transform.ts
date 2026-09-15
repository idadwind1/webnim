import { compileComplex, type Complex } from "./complex.ts";
import { lerp3, transform3 } from "./spatial.ts";
import type { SpaceTransform, Vec3 } from "./types.ts";
const expressions = new Map<
  string,
  (z: Complex, values?: Record<string, number>) => Complex
>();
export function transformSpacePoint(
  point: Vec3,
  transforms: readonly SpaceTransform[],
): Vec3 {
  return transforms.reduce((p, t) => {
    if (t.matrix) return lerp3(p, transform3(p, t.matrix), t.progress);
    if (t.expression) {
      const variables = Object.keys(t.values ?? {}).sort(),
        key = JSON.stringify([t.expression, variables]);
      let fn = expressions.get(key);
      if (!fn) {
        fn = compileComplex(
          t.expression,
          "$.spaceTransform.expression",
          variables,
        );
        if (expressions.size >= 256)
          expressions.delete(expressions.keys().next().value!);
        expressions.set(key, fn);
      }
      const z = fn([p[0], p[1]], t.values);
      return lerp3(p, [z[0], z[1], p[2]], t.progress);
    }
    return p;
  }, point);
}
