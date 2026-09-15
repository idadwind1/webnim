import { build } from "esbuild";
await build({
  entryPoints: ["tests/browser/harness.ts"],
  bundle: true,
  format: "esm",
  outdir: "tests/browser/build",
  splitting: true,
  sourcemap: true,
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
  logLevel: "info",
});
