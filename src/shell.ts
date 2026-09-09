import { executeExtended, extendedCommands } from "./extended-shell.ts";
import { evaluate, call, type Expr } from "./math.ts";
import { parseExpression, derivativeOf } from "./parser.ts";
import { evaluateScene, type Lesson, type SceneNode } from "./scene.ts";
export interface ShellState {
  saved?: Record<string, SceneNode>;
  lesson: Lesson;
  time: number;
  a: number;
  playing: boolean;
  selection: string[];
}
export interface CommandResult {
  state: ShellState;
  output: string;
  objectIds?: string[];
  action?: "reset-view" | "focus";
}
export const HELP = `SCENE
  plot <id> <expression>        plot curve x^2
  point <id> <x> <y>            point P a f(a)
  line <id> <x> <y> <slope>     line L 0 0 1
  tangent <id> <x>              tangent T a
  remove <id>                  remove T
  clear                        empty the scene

ANIMATION
  set <a|h> <value>            set a -1
  draw <id> <seconds>           draw curve 3
  animate <a|h> <to> <seconds>  animate a 2 4
  animate <id> <opacity|reveal> <to> <seconds>
  play · pause · seek <seconds>

EXPLORE
  objects · inspect [id] · select <id>
  focus · reset-view
  help

SHAPES & TEXT
  circle id x y radius · square id x y size
  ellipse id x y rx ry · rectangle id x y width height
  triangle id x y radius · regular id x y radius sides
  star id x y outer inner points · polygon id x1 y1 x2 y2 x3 y3 ...
  arc|sector id x y radius startRadians endRadians
  segment|arrow id x1 y1 x2 y2 · vector id x y
  bezier id x0 y0 x1 y1 x2 y2 x3 y3
  text|math id x y "content" · number id x y expression
  group id child1 child2 ... · ungroup id · copy source newId
  style id color|fill|stroke|font value · save id · restore id

MOTION & COMPOSITION
  move|shift id x y seconds · rotate id radians seconds [easing]
  scale id factor seconds [easing] · color id color seconds
  write|unwrite|fadein|fadeout|grow|indicate|wiggle id seconds
  transform source target seconds · follow id pathId seconds
  matrix id a b c d seconds · wait seconds
  sequence command; command · parallel command; command
  stagger delay command; command

Expressions: + - * / ^, sin, cos, tan, sqrt, log, exp, abs, pi, x, a, h, t.
f() and df() refer to the primary plot named curve.
Point/line coordinates use expressions without spaces.
Enter runs your command. ↑ / ↓ recall command history.`;
export function emptyLesson(): Lesson {
  return {
    subtitle: "", equation: "", derivativeLabel: "", fn: 0, derivative: 0, initialA: 0, initialH: 1.5,
    id: "shell",
    title: "Engine playground",
    nodes: [],
    tracks: [],
    duration: 0,
    steps: [
      {
        id: "shell",
        title: "Interactive session",
        body: "",
        start: 0,
        end: Infinity,
        objectIds: [],
        formula: "",
      },
    ],
  };
}
export function initialShell(): ShellState {
  return {
    lesson: emptyLesson(),
    time: 0,
    a: 1,
    playing: false,
    selection: [],
  };
}
export function executeCommand(
  state: ShellState,
  source: string,
): CommandResult {
  const command = source.trim();
  if (extendedCommands.has(command.split(/\s+/)[0]))
    return executeExtended(state, command, executeCommand);
  const [verb, ...args] = command.split(/\s+/);
  let next: ShellState = {
    ...state,
    lesson: {
      ...state.lesson,
      nodes: [...state.lesson.nodes],
      tracks: [...state.lesson.tracks],
    },
  };
  const result = (output: string, objectIds?: string[]): CommandResult => ({
    state: next,
    output,
    objectIds,
  });
  const count = (n: number, usage: string) => {
    if (args.length !== n) throw new Error(`Usage: ${usage}`);
  };
  const finite = (text: string) => {
    const n = Number(text);
    if (!text || !Number.isFinite(n))
      throw new Error(`Expected a finite number, received “${text}”.`);
    return n;
  };
  const id = (value: string) => {
    if (
      !/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(value) ||
      ["parameters", "__proto__", "constructor", "prototype"].includes(value)
    )
      throw new Error(
        "Object IDs must start with a letter and use letters, digits, - or _.",
      );
    return value;
  };
  const find = (name: string) => {
    const node = state.lesson.nodes.find((n) => n.id === name);
    if (!node)
      throw new Error(
        `No object named “${name}”. Type objects to list the scene.`,
      );
    return node;
  };
  const ctx = evaluateScene(state.lesson, state.time, state.a).context;
  const expr = (text: string): Expr => {
    const value = parseExpression(text);
    return value;
  };
  const coordinate = (text: string): Expr => {
    const value = expr(text);
    const evaluated = evaluate(value, ctx);
    if (!Number.isFinite(evaluated))
      throw new Error(
        `Coordinate “${text}” is not finite at the current parameters.`,
      );
    return value;
  };
  const add = (node: SceneNode) => {
    if (
      next.lesson.nodes.length >= 100 &&
      !next.lesson.nodes.some((n) => n.id === node.id)
    )
      throw new Error("This demo supports up to 100 scene objects.");
    next.lesson.nodes = next.lesson.nodes
      .filter((n) => n.id !== node.id)
      .concat(node);
    next.lesson.tracks = next.lesson.tracks.filter((t) => t.target !== node.id);
    next.selection = [node.id];
  };
  switch (verb) {
    case "help":
      count(0, "help");
      return result(HELP);
    case "clear":
      count(0, "clear");
      next = initialShell();
      return result("Scene cleared. Camera preserved. Try plot curve x^2.");
    case "plot": {
      if (args.length < 2) throw new Error("Usage: plot <id> <expression>");
      const name = id(args[0]);
      const formula = args.slice(1).join(" "),
        expression = expr(formula);
      if (name === "curve") {
        next.lesson.fn = expression;
        next.lesson.derivative = derivativeOf(expression);
        next.lesson.equation = `f(x) = ${formula}`;
      } else evaluate(expression, { ...ctx, vars: { ...ctx.vars, x: 1 } });
      add({
        id: name,
        type: "curve",
        name: formula,
        expression,
        domain: [-5, 5],
        color: "#bed6af",
      });
      return result(
        `Plotted ${name}: y = ${formula}${name === "curve" ? " · f() and df() updated." : ""}`,
        [name],
      );
    }
    case "point": {
      count(3, "point <id> <x-expression> <y-expression>");
      const name = id(args[0]);
      add({
        id: name,
        name: `Point ${name}`,
        type: "point",
        x: coordinate(args[1]),
        y: coordinate(args[2]),
        label: name,
        color: "#d9e4ce",
        draggable: name === "P" && args[1] === "a" && args[2] === "f(a)",
      });
      return result(
        `Created ${name} at (${args[1]}, ${args[2]}).${name === "P" && args[1] === "a" && args[2] === "f(a)" ? " Drag P or animate a to move it." : ""}`,
        [name],
      );
    }
    case "line": {
      count(4, "line <id> <x> <y> <slope>");
      const name = id(args[0]);
      add({
        id: name,
        name: `Line ${name}`,
        type: "line",
        x: coordinate(args[1]),
        y: coordinate(args[2]),
        slope: coordinate(args[3]),
        color: "#d7b082",
      });
      return result(`Created line ${name}.`, [name]);
    }
    case "tangent": {
      count(2, "tangent <id> <x-expression>");
      const name = id(args[0]),
        at = coordinate(args[1]);
      add({
        id: name,
        name: `Tangent ${name}`,
        type: "line",
        x: at,
        y: call("f", at),
        slope: call("df", at),
        color: "#b6a5e4",
      });
      return result(
        `Created tangent ${name} at x = ${args[1]}, bound to the primary curve.`,
        [name],
      );
    }
    case "remove": {
      count(1, "remove <id>");
      find(args[0]);
      const removed = new Set<string>();
      const collect = (id: string) => {
        removed.add(id);
        const node = find(id);
        if (node.type === "group") node.children.forEach(collect);
      };
      collect(args[0]);
      next.lesson.nodes = next.lesson.nodes
        .filter((n) => !removed.has(n.id))
        .map((n) =>
          n.type === "group"
            ? { ...n, children: n.children.filter((id) => !removed.has(id)) }
            : n,
        );
      next.lesson.tracks = next.lesson.tracks.filter(
        (t) => !removed.has(t.target),
      );
      next.selection = [];
      return result(`Removed ${args[0]}.`);
    }
    case "set": {
      count(2, "set <a|h> <value>");
      if (!["a", "h"].includes(args[0]))
        throw new Error("Available parameters: a, h.");
      const value = finite(args[1]);
      if (args[0] === "a") next.a = value;
      else next.lesson.initialH = value;
      next.lesson.tracks = next.lesson.tracks.filter(
        (t) => !(t.target === "parameters" && t.property === args[0]),
      );
      next.playing = false;
      return result(`${args[0]} = ${value}. Its animation track was cleared.`);
    }
    case "draw": {
      count(2, "draw <id> <seconds>");
      find(args[0]);
      next.lesson.nodes = next.lesson.nodes.map((n) =>
        n.id === args[0] ? { ...n, reveal: 0 } : n,
      );
      next.lesson.tracks = next.lesson.tracks.filter(
        (t) => !(t.target === args[0] && t.property === "reveal"),
      );
      return executeCommand(next, `animate ${args[0]} reveal 1 ${args[1]}`);
    }
    case "animate": {
      if (args.length !== 3 && args.length !== 4)
        throw new Error(
          "Usage: animate a <to> <seconds> OR animate <id> <opacity|reveal> <to> <seconds>",
        );
      const parameter = args.length === 3;
      const target = parameter ? "parameters" : args[0],
        property = parameter ? args[0] : args[1];
      if (parameter && !["a", "h"].includes(property))
        throw new Error(
          "Animate parameter a or h, or specify an object and property.",
        );
      if (!parameter) {
        const targetNode = find(target);
        if (
          property === "reveal" &&
          !["curve", "line", "path", "text", "polyline"].includes(
            targetNode.type,
          )
        )
          throw new Error(
            "Reveal supports paths, curves, lines, polylines and text. Use opacity for points.",
          );
        if (!["opacity", "reveal"].includes(property))
          throw new Error(
            "Object animation supports opacity and reveal. Bind coordinates to a for movement.",
          );
      }
      const to = finite(args[args.length - 2]),
        duration = finite(args[args.length - 1]);
      if (duration <= 0 || duration > 120)
        throw new Error(
          "Duration must be greater than 0 and at most 120 seconds.",
        );
      if (!parameter && (to < 0 || to > 1))
        throw new Error("Opacity and reveal must be between 0 and 1.");
      const frame = evaluateScene(state.lesson, state.time, state.a);
      const node = frame.nodes.find((n) => n.id === target);
      const from = parameter
        ? frame.vars[property]
        : property === "opacity"
          ? node!.opacity
          : node!.reveal;
      // Retain past tracks unchanged so seeking into the past remains exact.
      // The new track overrides the old one only from the current time onward.
      next.lesson.tracks = next.lesson.tracks.filter(
        (t) =>
          !(
            t.target === target &&
            t.property === property &&
            t.start >= state.time
          ),
      );
      next.lesson.tracks.push({
        target,
        property,
        start: state.time,
        duration,
        from,
        to,
      });
      next.lesson.duration = Math.max(
        next.lesson.duration,
        state.time + duration,
      );
      next.playing = true;
      return result(
        `Animating ${parameter ? property : `${target}.${property}`}: ${from.toFixed(3)} → ${to} over ${duration}s.`,
        parameter ? undefined : [target],
      );
    }
    case "play":
      count(0, "play");
      if (!state.lesson.tracks.length)
        throw new Error("No animations yet. Try animate a 2 3, or demo.");
      next.playing = true;
      if (next.time >= next.lesson.duration) next.time = 0;
      return result("Playing. Camera navigation stays independent.");
    case "pause":
      count(0, "pause");
      next.playing = false;
      return result(`Paused at ${state.time.toFixed(2)}s.`);
    case "seek": {
      count(1, "seek <seconds>");
      const time = finite(args[0]);
      if (time < 0 || time > state.lesson.duration)
        throw new Error(
          `Seek must be between 0 and ${state.lesson.duration.toFixed(2)} seconds.`,
        );
      next.time = time;
      next.playing = false;
      return result(`Seeked to ${time.toFixed(2)}s.`);
    }
    case "select":
      count(1, "select <id>");
      find(args[0]);
      next.selection = [args[0]];
      return result(`Selected ${args[0]}.`, [args[0]]);
    case "objects":
      count(0, "objects");
      return result(
        state.lesson.nodes.length
          ? state.lesson.nodes
              .map((n) => `${n.id.padEnd(14)} ${n.type.padEnd(10)} ${n.name}`)
              .join("\n")
          : "Scene is empty. Try plot curve x^2.",
      );
    case "inspect":
      if (args.length > 1) throw new Error("Usage: inspect [id]");
      if (args.length) {
        find(args[0]);
        const node = evaluateScene(
          state.lesson,
          state.time,
          state.a,
        ).nodes.find((n) => n.id === args[0]);
        return result(
          JSON.stringify(
            node,
            (_, v) => (typeof v === "function" ? "[sampled function]" : v),
            2,
          ),
          [args[0]],
        );
      }
      return result(
        JSON.stringify(
          {
            time: state.time,
            playing: state.playing,
            parameters: evaluateScene(state.lesson, state.time, state.a).vars,
            objects: state.lesson.nodes.length,
            tracks: state.lesson.tracks.length,
          },
          null,
          2,
        ),
      );
    case "reset-view":
      count(0, "reset-view");
      return { ...result("Camera reset."), action: "reset-view" };
    case "focus":
      count(0, "focus");
      if (find("P").type !== "point")
        throw new Error("focus needs a point named P.");
      if (
        evaluateScene(state.lesson, state.time, state.a).nodes.find(
          (n) => n.id === "P",
        )?.opacity === 0
      )
        throw new Error(
          "P is not visible at this time. Seek forward before focusing.",
        );
      return { ...result("Camera focused on P."), action: "focus" };
    default:
      throw new Error(
        `Unknown command “${verb}”. Type help for the command reference.`,
      );
  }
}
