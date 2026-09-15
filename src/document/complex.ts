import { SceneValidationError } from "./types.ts";
export type Complex = [number, number];
const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const exp = (a: Complex): Complex => [
  Math.exp(a[0]) * Math.cos(a[1]),
  Math.exp(a[0]) * Math.sin(a[1]),
];
const log = (a: Complex): Complex => [
  Math.log(Math.hypot(...a)),
  Math.atan2(a[1], a[0]),
];
const pow = (a: Complex, b: Complex): Complex =>
  a[0] === 0 && a[1] === 0 && b[1] === 0 && b[0] > 0
    ? [0, 0]
    : exp(mul(log(a), b));
const functions: Record<string, (z: Complex) => Complex> = {
  exp,
  log,
  sqrt: (z) => pow(z, [0.5, 0]),
  sin: (z) => [
    Math.sin(z[0]) * Math.cosh(z[1]),
    Math.cos(z[0]) * Math.sinh(z[1]),
  ],
  cos: (z) => [
    Math.cos(z[0]) * Math.cosh(z[1]),
    -Math.sin(z[0]) * Math.sinh(z[1]),
  ],
  conj: (z) => [z[0], -z[1]],
  abs: (z) => [Math.hypot(...z), 0],
  re: (z) => [z[0], 0],
  im: (z) => [z[1], 0],
};
/** Principal complex branches; this parser intentionally shares no JavaScript evaluation mechanism. */
export function compileComplex(
  source: string,
  path: string,
  variables: string[] = [],
): (z: Complex, values?: Record<string, number>) => Complex {
  const fail = (message: string): never => {
    throw new SceneValidationError([{ path, message }]);
  };
  if (source.length > 2000) fail("Complex expression exceeds 2000 characters");
  const tokens: string[] = [],
    re =
      /\s*(?:(\d*\.\d+(?:e[+-]?\d+)?|\d+(?:\.\d*)?(?:e[+-]?\d+)?)|([A-Za-z_]\w*)|([+\-*/^()]))/gy;
  let offset = 0,
    i = 0,
    depth = 0;
  while (offset < source.length && source.slice(offset).trim()) {
    re.lastIndex = offset;
    const m = re.exec(source);
    if (!m) fail("Expected a mathematical complex expression");
    tokens.push(m![1] ?? m![2] ?? m![3]);
    offset = re.lastIndex;
  }
  let environment: Record<string, number> = {};
  type Node = (z: Complex) => Complex;
  const expect = (token: string) => {
    if (tokens[i++] !== token) fail(`Expected ${token}`);
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
        if (!Number.isFinite(n)) fail("Non-finite literal");
        return () => [n, 0];
      }
      if (token === "z") return (z) => z;
      if (variables.includes(token)) return () => [environment[token], 0];
      if (token === "i") return () => [0, 1];
      if (token === "pi" || token === "e")
        return () => [token === "pi" ? Math.PI : Math.E, 0];
      if (Object.hasOwn(functions, token)) {
        expect("(");
        const n = sum();
        expect(")");
        return (z) => functions[token](n(z));
      }
      return fail(`Unknown complex name ${token}`);
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
    return (z) => pow(a(z), b(z));
  };
  const unary = (): Node => {
    if (tokens[i] === "-" || tokens[i] === "+") {
      if (++depth > 40) fail("Expression nested too deeply");
      const sign = tokens[i++] === "-" ? -1 : 1,
        n = unary();
      depth--;
      return (z) => mul([sign, 0], n(z));
    }
    return power();
  };
  const product = (): Node => {
    let a = unary();
    while (tokens[i] === "*" || tokens[i] === "/") {
      const op = tokens[i++],
        left = a,
        b = unary();
      a = (z) => {
        const y = b(z);
        return mul(
          left(z),
          op === "*"
            ? y
            : [y[0] / (y[0] ** 2 + y[1] ** 2), -y[1] / (y[0] ** 2 + y[1] ** 2)],
        );
      };
    }
    return a;
  };
  const sum = (): Node => {
    let a = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const op = tokens[i++],
        left = a,
        b = product();
      a = (z) => add(left(z), mul([op === "+" ? 1 : -1, 0], b(z)));
    }
    return a;
  };
  const result = sum();
  if (i !== tokens.length) fail(`Unexpected token ${tokens[i]}`);
  return (z, values = {}) => {
    environment = values;
    return result(z);
  };
}
