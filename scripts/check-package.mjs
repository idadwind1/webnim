import { mkdtemp, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
const root = resolve("."),
  directory = await mkdtemp(join(tmpdir(), "webnim-consumer-"));
const output = execFileSync(
  "npm",
  [
    "pack",
    "--pack-destination",
    directory,
    "--json",
    "--cache",
    "/tmp/webnim-npm-cache",
  ],
  { cwd: root, encoding: "utf8" },
);
const packed = JSON.parse(output.slice(output.indexOf("[\n")))[0];
await writeFile(
  join(directory, "package.json"),
  JSON.stringify({
    name: "fresh-webnim-consumer",
    private: true,
    type: "module",
  }),
);
execFileSync(
  "npm",
  [
    "install",
    "--prefer-offline",
    "--ignore-scripts",
    "--omit=optional",
    "--cache",
    "/tmp/webnim-npm-cache",
    join(directory, packed.filename),
  ],
  { cwd: directory, stdio: "inherit" },
);
await writeFile(
  join(directory, "verify.mjs"),
  `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { compileScene, evaluateDocument } from '@webnim-math/engine/document';
import { createPlayer } from '@webnim-math/engine/browser';
import { readFile } from 'node:fs/promises';
assert.equal(typeof window, 'undefined');
assert.equal(typeof document, 'undefined');
assert.throws(() => createRequire(import.meta.url).resolve('react'));
const scene=JSON.parse(await readFile('./node_modules/@webnim-math/engine/fixtures/four-spaces.json','utf8'));
assert.equal(evaluateDocument(compileScene(scene),7.5).activeSpace,'solid');
assert.equal(typeof createPlayer,'function');
const schema=JSON.parse(await readFile('./node_modules/@webnim-math/engine/dist/document/scene-v1.schema.json','utf8'));
assert.equal(schema.properties.version.const,1);
console.log('PASS: packed consumer, JSON fixture, schema, no React/browser globals');
`,
);
execFileSync(process.execPath, ["verify.mjs"], {
  cwd: directory,
  stdio: "inherit",
});
await writeFile(
  join(directory, "consumer.ts"),
  `import { compileScene, evaluateDocument, type SceneDocument } from '@webnim-math/engine/document';\nimport { createPlayer } from '@webnim-math/engine/browser';\nimport '@webnim-math/engine/browser/style.css';\nconst doc: SceneDocument={version:1,spaces:[{name:'s',type:'plane2d',objects:[]}]};\nconsole.log(evaluateDocument(compileScene(doc),0));\nvoid createPlayer(document.body,{document:doc});\n`,
);
execFileSync(
  process.execPath,
  [
    join(root, "node_modules/typescript/bin/tsc"),
    "--noEmit",
    "--strict",
    "--skipLibCheck",
    "--target",
    "ES2022",
    "--module",
    "ESNext",
    "--moduleResolution",
    "bundler",
    "consumer.ts",
  ],
  { cwd: directory, stdio: "inherit" },
);
execFileSync(
  join(root, "node_modules/.bin/esbuild"),
  [
    "consumer.ts",
    "--bundle",
    "--format=esm",
    "--outdir=build",
    "--loader:.woff2=file",
    "--loader:.woff=file",
    "--loader:.ttf=file",
  ],
  { cwd: directory, stdio: "inherit" },
);
console.log(
  `PASS: fresh consumer TypeScript and browser bundle. Artifacts: ${directory}`,
);
