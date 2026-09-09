import type { ShellState, CommandResult } from "./shell.ts";
import type { SceneNode } from "./scene.ts";
import { evaluateScene } from "./scene.ts";
import { evaluate } from "./math.ts";
import { parseExpression } from "./parser.ts";
import { evaluateTracks, type Easing } from "./timeline.ts";
import {
  arc,
  ellipse,
  polygon,
  color,
  resamplePath,
  transform,
  transformPath,
  multiply,
  inverse,
  type VectorPath,
} from "./vector.ts";
export const extendedCommands = new Set([
  "circle",
  "ellipse",
  "square",
  "rectangle",
  "triangle",
  "polygon",
  "regular",
  "star",
  "arc",
  "sector",
  "segment",
  "arrow",
  "vector",
  "bezier",
  "text",
  "math",
  "number",
  "group",
  "ungroup",
  "copy",
  "move",
  "shift",
  "rotate",
  "scale",
  "style",
  "fadein",
  "fadeout",
  "write",
  "unwrite",
  "grow",
  "indicate",
  "wiggle",
  "transform",
  "sequence",
  "parallel",
  "stagger",
  "wait",
  "save",
  "restore",
  "color",
  "follow",
  "matrix",
]);
const animatable = new Set([
  "animate",
  "draw",
  "move",
  "shift",
  "rotate",
  "scale",
  "fadein",
  "fadeout",
  "write",
  "unwrite",
  "grow",
  "indicate",
  "wiggle",
  "transform",
  "color",
  "follow",
  "matrix",
  "wait",
]);
const easings = new Set<Easing>([
  "linear",
  "smooth",
  "ease-in",
  "ease-out",
  "sine",
  "there-and-back",
  "bounce",
]);
function splitStatements(source: string): string[] {
  const result: string[] = [];
  let quote = "",
    start = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if ((ch === '"' || ch === "'") && source[i - 1] !== "\\")
      quote = quote === ch ? "" : quote || ch;
    if (ch === ";" && !quote) {
      result.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quote) throw new Error("Unclosed quote.");
  result.push(source.slice(start).trim());
  return result.filter(Boolean);
}
export function executeExtended(
  state: ShellState,
  source: string,
  execute: (state: ShellState, command: string) => CommandResult,
): CommandResult {
  const words = source.match(/"[^"\n]*"|'[^'\n]*'|[^\s]+/g) ?? [];
  const [verb, ...args] = words.map((w) =>
    /^['"]/.test(w) ? w.slice(1, -1) : w,
  );
  const next: ShellState = {
    ...state,
    lesson: {
      ...state.lesson,
      nodes: [...state.lesson.nodes],
      tracks: [...state.lesson.tracks],
    },
  };
  const ctx = evaluateScene(state.lesson, state.time, state.a).context;
  const num = (s: string | undefined) => {
    if (s === undefined) throw new Error("Missing numeric argument.");
    const n = evaluate(parseExpression(s), ctx);
    if (!Number.isFinite(n)) throw new Error(`“${s}” is not a finite number.`);
    return n;
  };
  const positive = (s: string) => {
    const v = num(s);
    if (v <= 0 || v > 10000)
      throw new Error("Size must be between 0 and 10000.");
    return v;
  };
  const arity = (n: number, syntax: string) => {
    if (args.length !== n) throw new Error(`Usage: ${syntax}`);
  };
  const get = (id: string) => {
    const node = next.lesson.nodes.find((n) => n.id === id);
    if (!node) throw new Error(`Unknown object “${id}”.`);
    return node;
  };
  const validId = (id: string) => {
    if (
      !/^[A-Za-z][\w-]{0,63}$/.test(id) ||
      ["parameters", "constructor", "prototype", "__proto__"].includes(id)
    )
      throw new Error("Invalid or reserved object ID.");
    return id;
  };
  const upsert = (node: SceneNode) => {
    validId(node.id);
    next.lesson.nodes = next.lesson.nodes
      .filter((n) => n.id !== node.id)
      .concat(node);
    next.lesson.tracks = next.lesson.tracks.filter((t) => t.target !== node.id);
    next.selection = [node.id];
  };
  const done = (output: string, ids = next.selection): CommandResult => {
    if (next.lesson.nodes.length > 100)
      throw new Error("Scene limit: 100 objects.");
    evaluateScene(next.lesson, next.time, next.a);
    return { state: next, output, objectIds: ids };
  };
  const pathNode = (
    id: string,
    path: VectorPath,
    x = 0,
    y = 0,
    arrow = false,
  ) =>
    upsert({
      id,
      name: `${verb} ${id}`,
      type: "path",
      path,
      color: "#b6cfa2",
      fillOpacity: path.closed ? 0.12 : 0,
      tx: x,
      ty: y,
      arrow,
    });
  const values = evaluateTracks(state.lesson.tracks, state.time);
  const own = (id: string, property: string) =>
    values[id]?.[property] ??
    (get(id) as unknown as Record<string, number>)[property] ??
    (["opacity", "reveal", "scaleX", "scaleY", "m00", "m11"].includes(property)
      ? 1
      : 0);
  const duration = (s: string | undefined) => {
    const v = s === undefined ? 1 : num(s);
    if (v <= 0 || v > 120)
      throw new Error("Duration must be in (0, 120] seconds.");
    return v;
  };
  const track = (
    id: string,
    property: string,
    to: number,
    seconds: number,
    from = own(id, property),
    easing: Easing = "smooth",
  ) => {
    next.lesson.tracks = next.lesson.tracks.filter(
      (t) =>
        !(t.target === id && t.property === property && t.start >= state.time),
    );
    next.lesson.tracks.push({
      target: id,
      property,
      from,
      to,
      start: state.time,
      duration: seconds,
      easing,
    });
    next.lesson.duration = Math.max(next.lesson.duration, state.time + seconds);
    next.playing = true;
  };
  if (verb === "sequence" || verb === "parallel" || verb === "stagger") {
    let tail = source.slice(verb.length).trim(),
      lag = 0;
    if (verb === "stagger") {
      const token = tail.split(/\s+/)[0];
      lag = num(token);
      if (lag < 0 || lag > 60)
        throw new Error("Stagger delay must be between 0 and 60 seconds.");
      tail = tail.slice(token.length).trim();
    }
    const commands = splitStatements(tail);
    if (!commands.length || commands.length > 30)
      throw new Error(
        "Provide 1–30 animation commands separated by semicolons.",
      );
    let composed = next,
      cursor = state.time;
    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (!animatable.has(command.split(/\s+/)[0]))
        throw new Error(
          "Composition accepts animation commands only. Create objects first.",
        );
      const start =
        verb === "parallel"
          ? state.time
          : verb === "stagger"
            ? state.time + i * lag
            : cursor;
      const before = new Set(composed.lesson.tracks);
      const result = execute({ ...composed, time: start }, command);
      composed = result.state;
      const added = composed.lesson.tracks.filter((t) => !before.has(t));
      cursor = Math.max(start, ...added.map((t) => t.start + t.duration));
    }
    return {
      state: { ...composed, time: state.time, playing: true },
      output: `Scheduled ${commands.length} animations in ${verb}.`,
      objectIds: composed.selection,
    };
  }
  switch (verb) {
    case "circle":
      arity(4, "circle id x y radius");
      pathNode(
        args[0],
        ellipse(positive(args[3]), positive(args[3])),
        num(args[1]),
        num(args[2]),
      );
      break;
    case "ellipse":
      arity(5, "ellipse id x y radiusX radiusY");
      pathNode(
        args[0],
        ellipse(positive(args[3]), positive(args[4])),
        num(args[1]),
        num(args[2]),
      );
      break;
    case "square":
    case "rectangle": {
      arity(
        verb === "square" ? 4 : 5,
        `${verb} id x y width${verb === "rectangle" ? " height" : ""}`,
      );
      const w = positive(args[3]),
        h = verb === "square" ? w : positive(args[4]);
      pathNode(
        args[0],
        polygon([
          { x: -w / 2, y: -h / 2 },
          { x: w / 2, y: -h / 2 },
          { x: w / 2, y: h / 2 },
          { x: -w / 2, y: h / 2 },
        ]),
        num(args[1]),
        num(args[2]),
      );
      break;
    }
    case "triangle":
    case "regular":
    case "star": {
      const isStar = verb === "star";
      arity(
        verb === "triangle" ? 4 : isStar ? 6 : 5,
        `${verb} id x y radius${verb === "triangle" ? "" : isStar ? " innerRadius points" : " sides"}`,
      );
      const r = positive(args[3]),
        sides = verb === "triangle" ? 3 : num(args[isStar ? 5 : 4]);
      if (!Number.isInteger(sides) || sides < 3 || sides > 64)
        throw new Error("Sides/points must be an integer between 3 and 64.");
      const inner = isStar ? positive(args[4]) : r,
        count = isStar ? sides * 2 : sides;
      pathNode(
        args[0],
        polygon(
          Array.from({ length: count }, (_, i) => {
            const angle = Math.PI / 2 + (i * Math.PI * 2) / count,
              rad = isStar && i % 2 ? inner : r;
            return { x: Math.cos(angle) * rad, y: Math.sin(angle) * rad };
          }),
        ),
        num(args[1]),
        num(args[2]),
      );
      break;
    }
    case "polygon": {
      if (args.length < 7 || args.length % 2 !== 1)
        throw new Error("Usage: polygon id x1 y1 x2 y2 x3 y3 ...");
      pathNode(
        args[0],
        polygon(
          Array.from({ length: (args.length - 1) / 2 }, (_, i) => ({
            x: num(args[i * 2 + 1]),
            y: num(args[i * 2 + 2]),
          })),
        ),
      );
      break;
    }
    case "arc":
    case "sector":
      arity(6, `${verb} id x y radius startRadians endRadians`);
      if (Math.abs(num(args[5]) - num(args[4])) > Math.PI * 8)
        throw new Error("Arc span is limited to four turns.");
      pathNode(
        args[0],
        arc(positive(args[3]), num(args[4]), num(args[5]), verb === "sector"),
        num(args[1]),
        num(args[2]),
      );
      break;
    case "segment":
    case "arrow":
      arity(5, `${verb} id x1 y1 x2 y2`);
      pathNode(
        args[0],
        polygon(
          [
            { x: num(args[1]), y: num(args[2]) },
            { x: num(args[3]), y: num(args[4]) },
          ],
          false,
        ),
        0,
        0,
        verb === "arrow",
      );
      break;
    case "vector":
      arity(3, "vector id x y");
      pathNode(
        args[0],
        polygon(
          [
            { x: 0, y: 0 },
            { x: num(args[1]), y: num(args[2]) },
          ],
          false,
        ),
        0,
        0,
        true,
      );
      break;
    case "bezier":
      arity(9, "bezier id x0 y0 x1 y1 x2 y2 x3 y3");
      pathNode(args[0], {
        closed: false,
        commands: [
          { op: "M", x: num(args[1]), y: num(args[2]) },
          {
            op: "C",
            x1: num(args[3]),
            y1: num(args[4]),
            x2: num(args[5]),
            y2: num(args[6]),
            x: num(args[7]),
            y: num(args[8]),
          },
        ],
      });
      break;
    case "text":
    case "math": {
      if (args.length < 4) throw new Error(`Usage: ${verb} id x y "content"`);
      upsert({
        id: args[0],
        name: `${verb} ${args[0]}`,
        type: "text",
        x: parseExpression(args[1]),
        y: parseExpression(args[2]),
        text: args.slice(3).join(" "),
        math: verb === "math",
        fontSize: 24,
        color: "#d5dfc9",
      });
      break;
    }
    case "number":
      arity(4, "number id x y expression");
      upsert({
        id: args[0],
        name: `Number ${args[0]}`,
        type: "text",
        x: parseExpression(args[1]),
        y: parseExpression(args[2]),
        value: parseExpression(args[3]),
        text: "",
        fontSize: 26,
        color: "#d5dfc9",
      });
      break;
    case "group": {
      if (args.length < 2) throw new Error("Usage: group id child1 child2 ...");
      args.slice(1).forEach(get);
      upsert({
        id: args[0],
        name: `Group ${args[0]}`,
        type: "group",
        children: [...new Set(args.slice(1))],
        color: "#b6cfa2",
      });
      break;
    }
    case "ungroup":
      if (
        next.lesson.nodes.some(
          (n) => n.type === "group" && n.children.includes(args[0]),
        )
      )
        throw new Error("Ungroup the parent first.");
      arity(1, "ungroup id");
      if (get(args[0]).type !== "group")
        throw new Error("Object is not a group.");
      if (
        Object.keys(values[args[0]] ?? {}).length ||
        ["tx", "ty", "rotation", "m01", "m10"].some(
          (k) => own(args[0], k) !== 0,
        ) ||
        own(args[0], "scaleX") !== 1 ||
        own(args[0], "scaleY") !== 1 ||
        own(args[0], "m00") !== 1 ||
        own(args[0], "m11") !== 1 ||
        own(args[0], "opacity") !== 1 ||
        own(args[0], "reveal") !== 1
      )
        throw new Error("Ungroup currently requires an untransformed group.");
      next.lesson.nodes = next.lesson.nodes.filter((n) => n.id !== args[0]);
      next.selection = [];
      break;
    case "copy": {
      arity(2, "copy source newId");
      const clone = (sourceId: string, newId: string) => {
        const source = get(sourceId);
        const copy = structuredClone({
          ...source,
          ...values[sourceId],
          id: newId,
          name: newId,
        });
        if (source.type === "group" && copy.type === "group") {
          copy.children = source.children.map((child) => {
            const id = `${newId}_${child}`;
            clone(child, id);
            return id;
          });
        }
        upsert(copy);
      };
      clone(args[0], validId(args[1]));
      break;
    }
    case "move":
    case "shift": {
      arity(4, `${verb} id x y seconds`);
      get(args[0]);
      const seconds = duration(args[3]);
      for (const [index, prop] of [
        [1, "tx"],
        [2, "ty"],
      ] as const)
        track(
          args[0],
          prop,
          num(args[index]) + (verb === "shift" ? own(args[0], prop) : 0),
          seconds,
        );
      next.selection = [args[0]];
      break;
    }
    case "rotate":
    case "scale": {
      if (args.length < 3 || args.length > 4)
        throw new Error(
          `Usage: ${verb} id ${verb === "rotate" ? "radians" : "factor"} seconds [easing]`,
        );
      get(args[0]);
      const value = num(args[1]);
      if (verb === "scale" && (value < 0 || value > 1000))
        throw new Error("Scale must be between 0 and 1000.");
      const easing = (args[3] ?? "smooth") as Easing;
      if (!easings.has(easing)) throw new Error("Unknown easing.");
      for (const prop of verb === "rotate"
        ? ["rotation"]
        : ["scaleX", "scaleY"])
        track(
          args[0],
          prop,
          value,
          duration(args[2]),
          own(args[0], prop),
          easing,
        );
      next.selection = [args[0]];
      break;
    }
    case "style": {
      arity(3, "style id <color|fill|stroke|font> value");
      const source = get(args[0]);
      const ids = new Set<string>();
      const collect = (node: SceneNode) => {
        ids.add(node.id);
        if (node.type === "group")
          node.children.forEach((id) => collect(get(id)));
      };
      collect(source);
      if (args[1] === "color") {
        const value = color(args[2]);
        next.lesson.nodes = next.lesson.nodes.map((n) =>
          ids.has(n.id) ? { ...n, color: value } : n,
        );
        next.lesson.tracks = next.lesson.tracks.filter(
          (t) =>
            !(
              ids.has(t.target) && ["red", "green", "blue"].includes(t.property)
            ),
        );
      } else {
        const map: Record<string, string> = {
            fill: "fillOpacity",
            stroke: "strokeWidth",
            font: "fontSize",
          },
          prop = map[args[1]];
        if (!prop)
          throw new Error("Style properties: color, fill, stroke, font.");
        const value = num(args[2]);
        if (value < 0 || value > (prop === "fillOpacity" ? 1 : 200))
          throw new Error("Style value out of range.");
        next.lesson.nodes = next.lesson.nodes.map((n) =>
          ids.has(n.id) ? { ...n, [prop]: value } : n,
        );
        next.lesson.tracks = next.lesson.tracks.filter(
          (t) => !(ids.has(t.target) && t.property === prop),
        );
      }
      next.selection = [source.id];
      break;
    }
    case "fadein":
    case "fadeout":
    case "write":
    case "unwrite":
    case "grow":
    case "indicate":
    case "wiggle": {
      arity(2, `${verb} id seconds`);
      const source = get(args[0]),
        seconds = duration(args[1]);
      next.selection = [source.id];
      if (verb === "fadein") track(source.id, "opacity", 1, seconds, 0);
      if (verb === "fadeout") track(source.id, "opacity", 0, seconds);
      if (verb === "write") track(source.id, "reveal", 1, seconds, 0);
      if (verb === "unwrite") track(source.id, "reveal", 0, seconds);
      if (verb === "grow")
        for (const p of ["scaleX", "scaleY"])
          track(source.id, p, own(source.id, p), seconds, 0);
      if (verb === "indicate")
        for (const p of ["scaleX", "scaleY"])
          track(
            source.id,
            p,
            own(source.id, p) * 1.2,
            seconds,
            own(source.id, p),
            "there-and-back",
          );
      if (verb === "wiggle")
        track(
          source.id,
          "rotation",
          own(source.id, "rotation") + 0.2,
          seconds,
          own(source.id, "rotation"),
          "there-and-back",
        );
      break;
    }
    case "transform": {
      arity(3, "transform source target seconds");
      const source = get(args[0]),
        target = get(args[1]);
      if (source.type !== "path" || target.type !== "path")
        throw new Error(
          "Transform currently supports vector paths (shapes, arrows, Bézier curves).",
        );
      const seconds = duration(args[2]),
        frame = evaluateScene(next.lesson, state.time, state.a),
        a = frame.nodes.find((n) => n.id === source.id)!,
        b = frame.nodes.find((n) => n.id === target.id)!;
      if (a.type !== "path" || b.type !== "path")
        throw new Error("Invalid path.");
      if (source.morphTarget)
        throw new Error(
          "A second morph on the same source is not yet supported. Copy it to a new object first.",
        );
      const targetPath = transformPath(
        b.path,
        multiply(inverse(a.matrix), b.matrix),
      );
      const from = resamplePath(a.path),
        to = resamplePath(targetPath);
      next.lesson.nodes = next.lesson.nodes.map((n) =>
        n.id === source.id
          ? {
              ...n,
              morphTarget: {
                from,
                to,
                closed: target.path.closed,
                fromPath: a.path,
                toPath: targetPath,
              },
            }
          : n,
      );
      track(source.id, "morph", 1, seconds, 0);
      track(target.id, "opacity", 0, seconds);
      next.selection = [source.id];
      break;
    }
    case "color": {
      arity(3, "color id name-or-hex seconds");
      const source = get(args[0]);
      const target = color(args[1]);
      const actual = evaluateScene(
        state.lesson,
        state.time,
        state.a,
      ).nodes.find((n) => n.id === source.id)!.color;
      ["red", "green", "blue"].forEach((prop, i) =>
        track(
          source.id,
          prop,
          parseInt(target.slice(1 + i * 2, 3 + i * 2), 16),
          duration(args[2]),
          parseInt(actual.slice(1 + i * 2, 3 + i * 2), 16),
        ),
      );
      next.selection = [source.id];
      break;
    }
    case "matrix": {
      arity(6, "matrix id a b c d seconds");
      get(args[0]);
      ["m00", "m01", "m10", "m11"].forEach((prop, i) =>
        track(args[0], prop, num(args[i + 1]), duration(args[5])),
      );
      next.selection = [args[0]];
      break;
    }
    case "follow": {
      arity(3, "follow id pathId seconds");
      const source = get(args[0]),
        frame = evaluateScene(state.lesson, state.time, state.a),
        path = frame.nodes.find((n) => n.id === args[1]),
        target = frame.nodes.find((n) => n.id === source.id)!;
      if (path?.type !== "path")
        throw new Error("follow needs a vector path as its second argument.");
      const parent = target.ancestors.length
        ? frame.nodes.find((n) => n.id === target.ancestors[0])
        : undefined;
      const mapping = parent
        ? multiply(inverse(parent.matrix), path.matrix)
        : path.matrix;
      const points = resamplePath(path.path, 512).map((p) =>
        transform(p, mapping),
      );
      next.lesson.nodes = next.lesson.nodes.map((n) =>
        n.id === source.id ? { ...n, motionPath: points } : n,
      );
      track(source.id, "motion", 1, duration(args[2]), 0);
      next.selection = [source.id];
      break;
    }
    case "wait":
      arity(1, "wait seconds");
      track("$clock", "progress", 1, duration(args[0]), 0);
      break;
    case "save":
      arity(1, "save id");
      next.saved = { ...state.saved, [args[0]]: structuredClone(get(args[0])) };
      break;
    case "restore":
      arity(1, "restore id");
      if (!state.saved?.[args[0]])
        throw new Error("No saved state for this object.");
      upsert(structuredClone(state.saved[args[0]]));
      break;
  }
  return done(
    `${verb}: ${args[0] ?? "scene"}${next.playing ? " · animation scheduled." : "."}`,
  );
}
