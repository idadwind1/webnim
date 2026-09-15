import { SceneValidationError } from "./types.ts";
export interface MathExpression {
  dependencies: readonly string[];
  evaluate(values: Record<string, number>): number;
}
const functions: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  log: Math.log,
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  atan2: Math.atan2,
};
export const reservedNames = [
  "z",
  "i",
  "t",
  "x",
  "theta",
  "u",
  "v",
  "pi",
  "e",
  ...Object.keys(functions),
];
export function compileMath(
  source: string | number,
  variables: string[],
  path: string,
): MathExpression {
  if (typeof source === "number")
    return { dependencies: [], evaluate: () => source };
  type Node = (v: Record<string, number>) => number;
  const fail = (message: string): never => {
    throw new SceneValidationError([{ path, message }]);
  };
  if (source.length > 2000) fail("Expression exceeds 2000 characters");
  const tokens: string[] = [];
  const re =
    /\s*(?:(\d*\.\d+(?:e[+-]?\d+)?|\d+(?:\.\d*)?(?:e[+-]?\d+)?)|([A-Za-z_]\w*(?:\.[A-Za-z_]\w*\.[A-Za-z_]\w*)?)|([+\-*/^(),]))/gy;
  let offset = 0;
  while (offset < source.length && source.slice(offset).trim()) {
    re.lastIndex = offset;
    const m = re.exec(source);
    if (!m)
      fail("Expected mathematical expression (JavaScript is not allowed)");
    tokens.push(m![1] ?? m![2] ?? m![3]);
    offset = re.lastIndex;
  }
  let i = 0,
    depth = 0;
  const dependencies = new Set<string>();
  const expect = (t: string) => {
    if (tokens[i++] !== t) fail(`Expected ${t}`);
  };
  const primary = (): Node => {
    if (++depth > 40) fail("Expression nested too deeply");
    try {
      const token = tokens[i++];
      if (!token) return fail("Expected expression");
      if (token === "(") {
        const n = sum();
        expect(")");
        return n;
      }
      if (/^[\d.]/.test(token)) {
        const n = Number(token);
        if (!Number.isFinite(n)) fail("Non-finite number");
        return () => n;
      }
      if (token === "pi" || token === "e")
        return () => (token === "pi" ? Math.PI : Math.E);
      if (Object.hasOwn(functions, token)) {
        expect("(");
        const args = [sum()];
        while (tokens[i] === ",") {
          i++;
          args.push(sum());
        }
        expect(")");
        const arity = ["min", "max", "atan2"].includes(token) ? 2 : 1;
        if (args.length !== arity) fail(`${token} expects ${arity} arguments`);
        return (v) => functions[token](...args.map((a) => a(v)));
      }
      if (!variables.includes(token)) fail(`Unknown variable ${token}`);
      dependencies.add(token);
      return (v) => v[token];
    } finally {
      depth--;
    }
  };
  const power = (): Node => {
    const a = primary();
    if (tokens[i] !== "^") return a;
    i++;
    if (++depth > 40) fail("Expression nested too deeply");
    const b = unary();
    depth--;
    return (v) => a(v) ** b(v);
  };
  const unary = (): Node => {
    if (tokens[i] === "-" || tokens[i] === "+") {
      const negative = tokens[i++] === "-";
      if (++depth > 40) fail("Expression nested too deeply");
      const n = unary();
      depth--;
      return (v) => (negative ? -1 : 1) * n(v);
    }
    return power();
  };
  const product = (): Node => {
    let a = unary();
    while (tokens[i] === "*" || tokens[i] === "/") {
      const op = tokens[i++],
        left = a,
        b = unary();
      a = (v) => (op === "*" ? left(v) * b(v) : left(v) / b(v));
    }
    return a;
  };
  const sum = (): Node => {
    let a = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++],
        left = a,
        b = product();
      a = (v) => (op === "+" ? left(v) + b(v) : left(v) - b(v));
    }
    return a;
  };
  const evaluate = sum();
  if (i !== tokens.length) fail(`Unexpected token ${tokens[i]}`);
  return { dependencies: [...dependencies], evaluate };
}
