// Serializable expressions. Lessons never eval arbitrary JavaScript or Python.
export type Expr =
  | number
  | string
  | {
      op:
        | "+"
        | "-"
        | "*"
        | "/"
        | "pow"
        | "sin"
        | "cos"
        | "f"
        | "df"
        | "secant"
        | "tan"
        | "sqrt"
        | "log"
        | "exp"
        | "abs";
      args: Expr[];
    };
export interface MathContext {
  vars: Record<string, number>;
  fn: Expr;
  derivative: Expr;
}
export function evaluate(expr: Expr, context: MathContext, depth = 0): number {
  if (depth > 40) throw new Error("Expression nesting limit exceeded");
  if (typeof expr === "number") return expr;
  if (typeof expr === "string") {
    if (!Object.hasOwn(context.vars, expr))
      throw new Error(`Unknown variable: ${expr}`);
    return context.vars[expr];
  }
  const args = expr.args.map((arg) => evaluate(arg, context, depth + 1));
  const apply = (expression: Expr, x: number) =>
    evaluate(
      expression,
      { ...context, vars: { ...context.vars, x } },
      depth + 1,
    );
  switch (expr.op) {
    case "+":
      return args[0] + args[1];
    case "-":
      return args[0] - args[1];
    case "*":
      return args[0] * args[1];
    case "/":
      return args[0] / args[1];
    case "pow":
      return args[0] ** args[1];
    case "sin":
      return Math.sin(args[0]);
    case "cos":
      return Math.cos(args[0]);
    case "tan":
      return Math.tan(args[0]);
    case "sqrt":
      return Math.sqrt(args[0]);
    case "log":
      return Math.log(args[0]);
    case "exp":
      return Math.exp(args[0]);
    case "abs":
      return Math.abs(args[0]);
    case "f":
      return apply(context.fn, args[0]);
    case "df":
      return apply(context.derivative, args[0]);
    case "secant":
      return Math.abs(args[1]) < 1e-7
        ? apply(context.derivative, args[0])
        : (apply(context.fn, args[0] + args[1]) - apply(context.fn, args[0])) /
            args[1];
  }
}
export const call = (
  op: Exclude<Expr, number | string>["op"],
  ...args: Expr[]
): Expr => ({ op, args });
export function formatNumber(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "undefined";
  if (Math.abs(n) < 1e-10) return "0";
  if (Math.abs(n) >= 1e5 || Math.abs(n) < 0.001)
    return n.toExponential(2).replace("e+", "e");
  return Number(n.toFixed(digits)).toString();
}
