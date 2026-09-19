import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const engineDocument = import.meta.resolve("@webnim-math/engine/document");
const engineRoot = new URL("../../", engineDocument);
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("index.html", "dist/index.html");
await cp(new URL("fixtures/", engineRoot), "dist/fixtures", { recursive: true });
await cp(fileURLToPath(import.meta.resolve("@webnim-math/engine/browser/style.css")), "dist/engine/style.css");
await cp(new URL("dist/player/fonts/", engineRoot), "dist/engine/fonts", { recursive: true });
await build({
  entryPoints: ["src/main.ts"], bundle: true, format: "esm",
  outdir: "dist/assets", splitting: true, sourcemap: true,
  loader: { ".woff2": "file", ".woff": "file", ".ttf": "file" },
  logLevel: "info"
});
