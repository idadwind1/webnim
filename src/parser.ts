import { call, type Expr } from "./math.ts";
// Small mathematical language, not a JavaScript or operating-system shell.
export function parseExpression(source: string): Expr {
  if (source.length > 500)
    throw new Error("Expression is too long (500 characters maximum).");
  const tokens: string[] = [];
  const pattern =
    /\s*(?:(\d*\.\d+(?:e[+-]?\d+)?|\d+(?:\.\d*)?(?:e[+-]?\d+)?)|([a-zA-Z_][a-zA-Z_0-9]*)|([+\-*/^(),]))/gy;
  let offset = 0;
  while (offset < source.length) {
    if (!source.slice(offset).trim()) break;
    pattern.lastIndex = offset;
    const match = pattern.exec(source);
    if (!match)
      throw new Error(
        `Unexpected character near “${source.slice(offset, offset + 12)}”.`,
      );
    tokens.push(match[1] ?? match[2] ?? match[3]);
    offset = pattern.lastIndex;
  }
  let position = 0,
    depth = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const expect = (token: string) => {
    if (take() !== token) throw new Error(`Expected “${token}”.`);
  };
  const primary = (): Expr => {
    if (++depth > 30) throw new Error("Expression is nested too deeply.");
    try {
      const token = take();
      if (!token) throw new Error("Expected a number, variable, or function.");
      if (token === "(") {
        const expr = sum();
        expect(")");
        return expr;
      }
      if (/^\d|^\./.test(token)) {
        const n = Number(token);
        if (!Number.isFinite(n)) throw new Error("Numbers must be finite.");
        return n;
      }
      if (token === "pi") return Math.PI;
      if (token === "e") return Math.E;
      if (["x", "a", "h", "t"].includes(token) && peek() !== "(") return token;
      if (
        ["sin", "cos", "tan", "sqrt", "log", "exp", "abs", "f", "df"].includes(
          token,
        )
      ) {
        expect("(");
        const arg = sum();
        expect(")");
        return call(
          token as
            "sin" | "cos" | "tan" | "sqrt" | "log" | "exp" | "abs" | "f" | "df",
          arg,
        );
      }
      throw new Error(
        `Unknown name “${token}”. Use x, a, h, pi, sin(), cos(), f(), or df().`,
      );
    } finally {
      depth--;
    }
  };
  const power = (): Expr => {
    const left = primary();
    if (peek() === "^") {
      take();
      return call("pow", left, unary());
    }
    return left;
  };
  const unary = (): Expr => {
    if (peek() === "-") {
      take();
      return call("*", -1, unary());
    }
    if (peek() === "+") {
      take();
      return unary();
    }
    return power();
  };
  const product = (): Expr => {
    let left = unary();
    while (peek() === "*" || peek() === "/") {
      const op = take() as "*" | "/";
      left = call(op, left, unary());
    }
    return left;
  };
  const sum = (): Expr => {
    let left = product();
    while (peek() === "+" || peek() === "-") {
      const op = take() as "+" | "-";
      left = call(op, left, product());
    }
    return left;
  };
  const result = sum();
  if (position !== tokens.length)
    throw new Error(`Unexpected token “${peek()}”. Use * for multiplication.`);
  return result;
}
export function derivativeOf(expr: Expr): Expr {
  if (typeof expr === "number") return 0;
  if (typeof expr === "string") return expr === "x" ? 1 : 0;
  const [u, v] = expr.args;
  const du = derivativeOf(u);
  switch (expr.op) {
    case "+":
    case "-":
      return call(expr.op, du, derivativeOf(v));
    case "*":
      return call("+", call("*", du, v), call("*", u, derivativeOf(v)));
    case "/":
      return call(
        "/",
        call("-", call("*", du, v), call("*", u, derivativeOf(v))),
        call("pow", v, 2),
      );
    case "pow":
      if (typeof v !== "number")
        throw new Error(
          "Primary curves currently support constant exponents only.",
        );
      return v === 0 ? 0 : call("*", call("*", v, call("pow", u, v - 1)), du);
    case "sin":
      return call("*", call("cos", u), du);
    case "cos":
      return call("*", call("*", -1, call("sin", u)), du);
    case "tan":
      return call("/", du, call("pow", call("cos", u), 2));
    case "sqrt":
      return call("/", du, call("*", 2, call("sqrt", u)));
    case "log":
      return call("/", du, u);
    case "exp":
      return call("*", call("exp", u), du);
    default:
      throw new Error(
        "Define the primary curve directly in x, rather than using f() or df().",
      );
  }
}
