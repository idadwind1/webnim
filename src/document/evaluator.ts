import { easeProgress } from "./easing.ts";
import { entrances, type CompiledScene } from "./compiler.ts";
import { transformSpacePoint } from "./space-transform.ts";
import { geometryFor, morphGeometry, resampleGeometry } from "./geometry.ts";
import {
  SceneValidationError,
  type DocumentFrame,
  type Geometry,
  type Matrix4,
  type Vec3,
  type ObjectFrame,
  type DocumentTheme,
  type SpaceTransform,
} from "./types.ts";
import {
  identity4,
  inverse4,
  translation,
  scaling,
  rotation,
  multiply4,
  transform3,
  lerp3,
  add3,
  mul3,
  sub3,
  along,
  nativeToCartesian,
  centerOf,
  mix,
  unit3,
} from "./spatial.ts";
export const documentDefaultTheme: Required<DocumentTheme> = {
  background: "#10141d",
  foreground: "#e9eef8",
  axes: "#8995ad",
  grid: "#283142",
  objectColors: ["#58a6ff", "#b695f8", "#75dda5", "#f4b66b"],
};
interface State {
  geometry: Geometry;
  position: Vec3;
  rotation: Matrix4;
  scale: Matrix4;
  matrix: Matrix4;
  color: string;
  opacity: number;
  reveal: number;
  fillReveal?: number;
  strokeRange?: [number, number];
  arrowScale?: number;
  visible: boolean;
}
const progress = (
  time: number,
  start: number,
  duration: number,
  easing?: string,
) => {
  const p = duration ? Math.max(0, Math.min(1, (time - start) / duration)) : 1;
  return easeProgress(p, easing);
};
const colorMix = (a: string, b: string, t: number) =>
  "#" +
  [1, 3, 5]
    .map((i) =>
      Math.round(
        mix(
          parseInt(a.slice(i, i + 2), 16),
          parseInt(b.slice(i, i + 2), 16),
          t,
        ),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
function evaluateFrame(
  compiled: CompiledScene,
  time: number,
  parameterOverrides: Record<string, number> = {},
  onlyObject?: string,
): DocumentFrame {
  if (!Number.isFinite(time))
    throw new SceneValidationError([
      { path: "$.time", message: "Time must be finite" },
    ]);
  for (const [key, value] of Object.entries(parameterOverrides))
    if (
      !Object.hasOwn(compiled.document.parameters ?? {}, key) ||
      !Number.isFinite(value)
    )
      throw new SceneValidationError([
        {
          path: `$.parameterOverrides.${key}`,
          message: "Expected a known parameter and finite value",
        },
      ]);
  time = Math.max(0, Math.min(compiled.duration, time));
  const parameterCache = new Map<number, Record<string, number>>();
  const parametersAt = (at: number) => {
    if (parameterCache.has(at)) return parameterCache.get(at)!;
    const values = { ...compiled.document.parameters };
    for (const t of compiled.tracks) {
      const a = t.event;
      if (a.type !== "AnimateParameter" || at < t.start) continue;
      values[a.parameter] = mix(
        a.from ?? values[a.parameter],
        a.to,
        progress(at, t.start, t.duration, a.easing),
      );
    }
    Object.assign(values, parameterOverrides);
    parameterCache.set(at, values);
    return values;
  };
  const cache = new Map<string, State>(),
    worldCache = new Map<string, ObjectFrame>();
  const diagnostics: DocumentFrame["diagnostics"] = [];
  const theme = (space: string) => ({
    ...documentDefaultTheme,
    ...compiled.document.theme,
    ...compiled.document.spaces.find((s) => s.name === space)!.theme,
  });
  const state = (
    id: string,
    at: number,
    limit = compiled.tracks.length,
  ): State => {
    const key = `${id}|${at}|${limit}`;
    if (cache.has(key)) return cache.get(key)!;
    const o = compiled.objects.get(id)!,
      d = o.definition,
      values: Record<string, number> = { ...parametersAt(at), t: at };
    for (const ref of o.pointReferences) {
      const dot = ref.lastIndexOf("."), source = ref.slice(0, dot);
      const point = world(source, at, limit).geometry.points[0];
      const position = point && transformSpacePoint(point,
        transformsFor(compiled.objects.get(source)!.space.name, at, limit));
      values[ref] = position?.["xyz".indexOf(ref.slice(dot + 1))] ?? NaN;
    }
    const dependencyWorld =
      "curve" in d ? world(d.curve, at, limit).geometry : "target" in d ? world(d.target, at, limit).geometry : undefined;
    let dependency = dependencyWorld;
    if (dependencyWorld && o.parent) {
      const parentMatrix = world(o.parent, at, limit).matrix;
      let inverse: Matrix4;
      try {
        inverse = inverse4(parentMatrix);
      } catch {
        inverse = identity4();
      }
      dependency = {
        ...dependencyWorld,
        points: dependencyWorld.points.map((p) => transform3(p, inverse)),
      };
    }
    const traceGeometry = (): Geometry => {
      if (d.type !== "TracedPath") return geometryFor(o, values, dependency);
      const end = at, start = Math.max(d.start ?? 0, d.duration === undefined ? 0 : at - d.duration);
      if (end < start) return { kind: "path", points: [] };
      const count = end === start ? 0 : d.samples ?? 256;
      return { kind: "path", points: Array.from({ length: count + 1 }, (_, i) => {
        const sampleTime = count ? start + (end - start) * i / count : end;
        const point = world(d.point, sampleTime, limit).geometry.points[0];
        return point ? transformSpacePoint(point,
          transformsFor(compiled.objects.get(d.point)!.space.name, sampleTime, limit)) : [NaN, NaN, NaN];
      }) };
    };
    const geometry = traceGeometry(),
      native =
        o.space.type === "axis1d" ? 1 : o.space.type === "space3d" ? 3 : 2;
    const ownTracks = compiled.tracks.filter(
      (t) => "object" in t.event && t.event.object === id,
    );
    const replacementEntrance = compiled.tracks.some(
      (t) => t.event.type === "ReplacementTransform" && t.event.to === id,
    );
    const s: State = {
      geometry,
      position: nativeToCartesian(
        Array.from(
          { length: native },
          (_, i) => o.expressions.get(`position.${i}`)?.evaluate(values) ?? 0,
        ),
        o.space.type,
      ),
      rotation: identity4(),
      scale: identity4(),
      matrix: identity4(),
      color:
        d.style?.color ??
        theme(o.space.name).objectColors[
          o.space.objects.indexOf(d) % theme(o.space.name).objectColors.length
        ],
      opacity: d.style?.opacity ?? 1,
      reveal: 1,
      visible:
        !ownTracks.some((t) => entrances.includes(t.event.type)) &&
        !replacementEntrance,
    };
    cache.set(key, s);
    for (const t of compiled.tracks) {
      if (t.index >= limit || t.start > at) continue;
      const a = t.event;
      if (
        a.type === "ReplacementTransform" &&
        a.to === id &&
        at >= t.start + t.duration
      ) {
        s.visible = true;
        continue;
      }
      if (!("object" in a)) continue;
      if (a.object !== id) {
        let parent = o.parent;
        while (parent && parent !== a.object)
          parent = compiled.objects.get(parent)?.parent;
        if (parent && (a.type === "ShowIncreasingSubsets" || a.type === "ShowSubmobjectsOneByOne")) {
          const group = compiled.objects.get(parent)!.definition;
          if (group.type === "Group") {
            let child = id;
            while (compiled.objects.get(child)?.parent !== parent) child = compiled.objects.get(child)!.parent!;
            const index = group.children.indexOf(child), p = progress(at,t.start,t.duration,a.easing);
            const count = Math.min(group.children.length, Math.floor(p*group.children.length + 1e-10));
            s.visible = a.type === "ShowIncreasingSubsets" ? index < count : count > 0 && index === count-1;
          }
        }
        if (parent && (a.type === "FadeToColor" || a.type === "Indicate")) {
          const p = progress(at, t.start, t.duration, a.easing);
          s.color = colorMix(
            state(id, t.start, t.index).color,
            a.color ?? "#ffff66",
            a.type === "Indicate" ? Math.sin(Math.PI * p) : p,
          );
        }
        continue;
      }
      const p = progress(at, t.start, t.duration, a.easing),
        before = () => state(id, t.start, t.index);
      if (["Add", "Create", "FadeIn", "GrowFromCenter", "GrowArrow", "GrowFromPoint", "GrowFromEdge", "SpinInFromNothing", "DrawBorderThenFill"].includes(a.type)) {
        delete s.fillReveal;
        delete s.strokeRange;
        delete s.arrowScale;
      }
      switch (a.type) {
        case "Restore": {
          const b=before(), target=state(id,a.at ?? 0,t.index);
          s.position=lerp3(b.position,target.position,p);
          for(const key of ["rotation","scale","matrix"] as const) s[key]=b[key].map((v,i)=>mix(v,target[key][i],p));
          s.color=colorMix(b.color,target.color,p);s.opacity=mix(b.opacity,target.opacity,p);s.reveal=mix(b.reveal,target.reveal,p);
          if(b.geometry.kind==="path" && target.geometry.kind==="path" && !b.geometry.breaks && !target.geometry.breaks) s.geometry=p===1?target.geometry:morphGeometry(b.geometry,target.geometry,p);
          else if(p===1)s.geometry=target.geometry;
          if(p===1){s.visible=target.visible;s.fillReveal=target.fillReveal;s.strokeRange=target.strokeRange;s.arrowScale=target.arrowScale;}
          break;
        }
        case "Homotopy":
        case "ApplyPointwiseFunction":
        case "PhaseFlow": {
          const b=before(), original=b.geometry.kind==="point"?b.geometry.points:resampleGeometry(b.geometry,128);
          const map=(v:Vec3,alpha:number,clock:number):Vec3 => [0,1,2].map(i=>t.expressions?.[i]?.evaluate({...parametersAt(t.start),x:v[0],y:v[1],z:v[2],alpha,t:clock}) ?? 0) as Vec3;
          const points=original.map(v=>{
            if(a.type==="Homotopy")return map(v,p,t.start+p*t.duration);
            if(a.type==="ApplyPointwiseFunction")return lerp3(v,map(v,1,t.start),p);
            let point=v;const steps=a.steps??128,dt=(a.virtualTime??t.duration)*p/steps;
            for(let i=0;i<steps;i++){
              const clock=t.start+i*dt,k1=map(point,p,clock),k2=map(add3(point,mul3(k1,dt/2)),p,clock+dt/2),k3=map(add3(point,mul3(k2,dt/2)),p,clock+dt/2),k4=map(add3(point,mul3(k3,dt)),p,clock+dt);
              point=add3(point,mul3(add3(add3(k1,mul3(k2,2)),add3(mul3(k3,2),k4)),dt/6));
              if(!point.every(Number.isFinite))break;
            }
            return point;
          });
          s.geometry={...b.geometry,functionPlot:undefined,indices:undefined,points};
          break;
        }
        case "ShowIncreasingSubsets":
        case "ShowSubmobjectsOneByOne": s.visible = true; break;
        case "AddTextLetterByLetter":
        case "AddTextWordByWord":
        case "RemoveTextLetterByLetter": {
          const text = before().geometry.text ?? "";
          const segments = a.type === "AddTextWordByWord" ? (text.match(/\s*\S+\s*/gu) ?? [])
            : [...new Intl.Segmenter(undefined, {granularity:"grapheme"}).segment(text)].map(s=>s.segment);
          const count = Math.floor(segments.length * (a.type === "RemoveTextLetterByLetter" ? 1-p : p) + 1e-10);
          s.geometry = {...s.geometry, text: segments.slice(0,count).join("")};
          s.visible = a.type !== "RemoveTextLetterByLetter" || p<1;
          s.opacity = d.style?.opacity ?? 1;
          s.reveal = 1;
          break;
        }
        case "Blink":
          s.opacity = before().opacity * (1 - Math.sin(Math.PI*p*(a.count ?? 1))**2);
          break;
        case "ApplyWave": {
          if (p===0 || p===1) break;
          const b=before(), points=resampleGeometry(b.geometry,256), direction=unit3(a.direction ?? (native===1?[1,0,0]:[0,1,0]));
          s.geometry={...b.geometry, functionPlot:undefined, indices:undefined, points:points.map((v,i)=>add3(v,mul3(direction,(a.amplitude ?? .3)*Math.sin(Math.PI*p)*Math.sin(2*Math.PI*((a.waves ?? 1)*i/(points.length-1)-p)))))};
          break;
        }
        case "DrawBorderThenFill":
          s.visible = true;
          s.opacity = d.style?.opacity ?? 1;
          s.reveal = Math.min(1, 2 * p);
          s.fillReveal = Math.max(0, 2 * p - 1);
          break;
        case "ShowPassingFlash": {
          const width = a.timeWidth ?? 0.2, head = p * (1 + width);
          s.visible = p > 0 && p < 1;
          s.opacity = d.style?.opacity ?? 1;
          s.reveal = 1;
          s.fillReveal = 0;
          s.strokeRange = [Math.max(0, head - width), Math.min(1, head)];
          break;
        }
        case "GrowArrow":
        case "GrowFromPoint":
        case "GrowFromEdge":
        case "SpinInFromNothing": {
          const b = before(), points = b.geometry.points.map(v => transform3(v, localMatrix(b)));
          let anchor = centerOf(points);
          if (a.type === "GrowArrow") anchor = points[0] ?? anchor;
          if (a.type === "GrowFromPoint") anchor = nativeToCartesian(a.point as number[], o.space.type);
          if (a.type === "GrowFromEdge" && points.length) {
            const axis = ["left", "right"].includes(a.edge) ? 0 : ["top", "bottom"].includes(a.edge) ? 1 : 2;
            anchor[axis] = ["left", "bottom", "back"].includes(a.edge)
              ? Math.min(...points.map(v => v[axis])) : Math.max(...points.map(v => v[axis]));
          }
          s.visible = true;
          s.reveal = 1;
          s.opacity = (d.style?.opacity ?? 1) * (p === 0 ? 0 : 1);
          s.scale = multiply4(scaling(p), b.scale);
          s.arrowScale = p;
          s.position = add3(anchor, mul3(sub3(b.position, anchor), p));
          if (a.type === "SpinInFromNothing") {
            const spin = rotation((a.angle ?? 2 * Math.PI) * (1 - p));
            s.rotation = multiply4(spin, b.rotation);
            s.position = add3(anchor, transform3(sub3(s.position, anchor), spin));
          }
          break;
        }
        case "Add":
          s.visible = true;
          s.opacity = d.style?.opacity ?? 1;
          s.reveal = 1;
          break;
        case "Create":
          s.visible = true;
          s.opacity = d.style?.opacity ?? 1;
          s.reveal = p;
          break;
        case "Uncreate":
          s.reveal = before().reveal * (1 - p);
          if (s.fillReveal !== undefined) s.fillReveal = (before().fillReveal ?? before().reveal) * (1 - p);
          s.visible = p < 1;
          break;
        case "FadeIn":
          s.visible = true;
          s.reveal = 1;
          s.opacity = (d.style?.opacity ?? 1) * p;
          break;
        case "FadeOut":
          s.opacity = before().opacity * (1 - p);
          s.visible = p < 1;
          break;
        case "MoveTo": {
          const b = before(),
            center = centerOf(
              b.geometry.points.map((v) =>
                transform3(v, localMatrix({ ...b, position: [0, 0, 0] })),
              ),
            );
          s.position = lerp3(
            a.from
              ? sub3(
                  nativeToCartesian(a.from as number[], o.space.type),
                  center,
                )
              : b.position,
            sub3(nativeToCartesian(a.to as number[], o.space.type), center),
            p,
          );
          break;
        }
        case "Shift":
          s.position = add3(
            before().position,
            mul3(nativeToCartesian(a.by as number[], o.space.type), p),
          );
          break;
        case "Rotate":
          s.rotation = multiply4(
            rotation(a.angle * p, a.axis),
            before().rotation,
          );
          break;
        case "Scale":
          s.scale = scaled(before(), mix(1, a.factor, p));
          break;
        case "FadeToColor":
          s.color = colorMix(before().color, a.color, p);
          break;
        case "ApplyMatrix": {
          const m = identity4();
          a.matrix.forEach((r, i) =>
            r.forEach((v, j) => (m[i * 4 + j] = mix(i === j ? 1 : 0, v, p))),
          );
          s.matrix = multiply4(m, before().matrix);
          break;
        }
        case "MoveAlongPath": {
          const path = world(a.path, t.start, t.index).geometry;
          s.position = sub3(
            along(path.points, p),
            centerOf(
              before().geometry.points.map((v) =>
                transform3(
                  v,
                  localMatrix({ ...before(), position: [0, 0, 0] }),
                ),
              ),
            ),
          );
          break;
        }
        case "Indicate": {
          const q = Math.sin(Math.PI * p);
          s.scale = scaled(before(), mix(1, a.factor ?? 1.2, q));
          s.color = colorMix(before().color, a.color ?? "#ffff66", q);
          break;
        }
        case "Wiggle":
          s.rotation = multiply4(
            rotation(
              Math.sin(p * Math.PI * 6) *
                Math.sin(p * Math.PI) *
                (a.angle ?? 0.15),
            ),
            before().rotation,
          );
          break;
        case "GrowFromCenter":
          s.visible = true;
          s.opacity = d.style?.opacity ?? 1;
          s.reveal = 1;
          s.scale = scaled(before(), p);
          break;
        case "Transform":
        case "ReplacementTransform": {
          const source = before(),
            from = source.geometry,
            target = state(a.to, t.start, t.index);
          const relative = multiply4(
            inverse4(localMatrix(source)),
            localMatrix(target),
          );
          const to = {
            ...target.geometry,
            points: target.geometry.points.map((v) => transform3(v, relative)),
          };
          s.geometry = morphGeometry(from, to, p);
          if (a.type === "ReplacementTransform" && p === 1) s.visible = false;
          break;
        }
      }
    }
    return s;
  };
  function scaled(s: State, factor: number): Matrix4 {
    const center = centerOf(
      s.geometry.points.map((p) => transform3(p, multiply4(s.scale, s.matrix))),
    );
    return multiply4(
      translation(center),
      multiply4(
        scaling(factor),
        multiply4(translation(mul3(center, -1)), s.scale),
      ),
    );
  }
  function localMatrix(s: State) {
    return multiply4(
      translation(s.position),
      multiply4(s.rotation, multiply4(s.scale, s.matrix)),
    );
  }
  const world = (
    id: string,
    at: number,
    limit = compiled.tracks.length,
  ): ObjectFrame => {
    const key = `${id}|${at}|${limit}`;
    if (worldCache.has(key)) return worldCache.get(key)!;
    const o = compiled.objects.get(id)!,
      s = state(id, at, limit),
      parent = o.parent ? world(o.parent, at, limit) : undefined;
    const matrix = multiply4(parent?.matrix ?? identity4(), localMatrix(s));
    const result: ObjectFrame = {
      id,
      ...((o.definition.caption ?? parent?.caption) !== undefined
        ? { caption: o.definition.caption ?? parent?.caption }
        : {}),
      ...("drag" in o.definition && o.definition.drag
        ? { draggable: true }
        : {}),
      type: o.definition.type,
      matrix,
      geometry: {
        ...s.geometry,
        points: s.geometry.points.map((p) => transform3(p, matrix)),
      },
      visible: s.visible && (parent?.visible ?? true),
      opacity: s.opacity * (parent?.opacity ?? 1),
      reveal: s.reveal * (parent?.reveal ?? 1),
      ...(s.fillReveal !== undefined || parent?.fillReveal !== undefined
        ? { fillReveal: (s.fillReveal ?? s.reveal) * (parent?.fillReveal ?? parent?.reveal ?? 1) } : {}),
      ...(s.strokeRange ? { strokeRange: s.strokeRange } : {}),
      ...(s.arrowScale !== undefined ? { arrowScale: s.arrowScale } : {}),
      color: s.color,
      style: o.definition.style ?? {},
      selected: false,
    };
    worldCache.set(key, result);
    return result;
  };
  let activeSpace = compiled.document.spaces[0].name,
    layers = [{ space: activeSpace, opacity: 1 }];
  for (const track of compiled.tracks) {
    const a = track.event;
    if (a.type !== "SwitchSpace" || time < track.start) continue;
    const previous = activeSpace;
    activeSpace = a.space;
    const p = progress(time, track.start, track.duration);
    layers =
      a.transition === "fade" && p < 1 && previous !== activeSpace
        ? [
            { space: previous, opacity: 1 - p },
            { space: activeSpace, opacity: p },
          ]
        : [{ space: activeSpace, opacity: 1 }];
  }
  const transformsFor = (space: string, at = time, limit = compiled.tracks.length): SpaceTransform[] =>
    compiled.tracks.slice(0, limit)
      .filter(
        (t) =>
          "space" in t.event &&
          t.event.space === space &&
          [
            "ApplySpaceMatrix",
            "ApplyComplexFunction",
          ].includes(t.event.type) &&
          at >= t.start,
      )
      .map((t) => {
        const a = t.event,
          p = progress(
            at,
            t.start,
            t.duration,
            "easing" in a ? a.easing : undefined,
          );
        if (a.type === "ApplyComplexFunction")
          return {
            expression: a.expression,
            values: { ...parametersAt(at), t: at },
            progress: p,
          };
        const m = identity4();
        if (a.type === "ApplySpaceMatrix")
          a.matrix.forEach((r, i) => r.forEach((v, j) => (m[i * 4 + j] = v)));
        return { matrix: m, progress: p };
      });
  const spaces = compiled.document.spaces.filter(space => !onlyObject || compiled.objects.get(onlyObject)?.space.name === space.name).map((space) => ({
    camera: compiled.tracks.flatMap((track) => {
      const e = track.event;
      return (e.type === "CameraZoom" || e.type === "CameraWindow" || e.type === "CameraMove" || e.type === "CameraOrbit") &&
        e.space === space.name &&
        track.start <= time
        ? [
            {
              event: e,
              progress: progress(time, track.start, track.duration, e.easing),
            },
          ]
        : [];
    }),
    name: space.name,
    type: space.type,
    theme: theme(space.name),
    transforms: transformsFor(space.name),
    objects: space.objects.filter(d => !onlyObject || `${space.name}.${d.id}` === onlyObject).map((d) => {
      const id = `${space.name}.${d.id}`,
        original = world(id, time);
      const transforms = transformsFor(space.name),
        points =
          original.geometry.kind === "path" &&
          !original.geometry.breaks &&
          original.geometry.points.length < 128 &&
          transforms.some((t) => t.expression)
            ? resampleGeometry(original.geometry)
            : original.geometry.points;
      const frame = {
        ...original,
        geometry: {
          ...original.geometry,
          points: points.map((p) => transformSpacePoint(p, transforms)),
        },
      };
      if (
        frame.geometry.points.some((p) => p.some((v) => !Number.isFinite(v))) ||
        frame.matrix.some((v) => !Number.isFinite(v))
      ) {
        diagnostics.push({
          path: compiled.objects.get(id)!.path,
          message: "Non-finite geometry sample; object omitted for this frame",
        });
        return {
          ...frame,
          visible: false,
          geometry: { ...frame.geometry, points: [], indices: [] },
        };
      }
      return frame;
    }),
  }));
  return {
    time,
    duration: compiled.duration,
    parameters: parametersAt(time),
    spaces,
    activeSpace,
    pictureInPictures: (onlyObject ? [] : [...compiled.objects.values()]).flatMap((o) => {
      const d = o.definition;
      if (d.type !== "PictureInPicture") return [];
      const ownerLayer = layers.find((l) => l.space === o.space.name);
      const object = world(o.id, time);
      if (!ownerLayer || !object.visible || object.opacity <= 0) return [];
      return [
        {
          id: o.id,
          owner: o.space.name,
          space: d.space,
          x: d.x,
          y: d.y,
          width: d.width,
          height: d.height,
          opacity: object.opacity * ownerLayer.opacity,
        },
      ];
    }),
    layers,
    diagnostics,
  };
}

export function evaluateDocument(compiled: CompiledScene, time: number, overrides: Record<string, number> = {}): DocumentFrame {
  return evaluateFrame(compiled, time, overrides);
}
/** Internal interaction evaluator: world() resolves the target's dependencies lazily. */
export function evaluateDragTarget(compiled: CompiledScene, time: number, overrides: Record<string, number>, id: string) {
  const frame = evaluateFrame(compiled, time, overrides, id);
  return { object: frame.spaces[0]?.objects[0], parameters: frame.parameters };
}
