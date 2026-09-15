import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { compileScene, evaluateDocument } from "../dist/document/index.js";

test("3D camera redraws retain resources; animation and hover update in place", async () => {
  const dir = await mkdtemp(join(tmpdir(), "axiom-cache-")),
    output = join(dir, "adapter.mjs");
  const three = JSON.stringify(import.meta.resolve("three"));
  await build({
    entryPoints: [new URL("../src/player/three.ts", import.meta.url).pathname],
    bundle: true,
    format: "esm",
    outfile: output,
    plugins: [
      {
        name: "gpu-boundary",
        setup(b) {
          b.onResolve({ filter: /^three$/ }, () => ({
            path: "three",
            namespace: "boundary",
          }));
          b.onLoad({ filter: /.*/, namespace: "boundary" }, () => ({
            contents: `export * from ${three}; export class WebGLRenderer {domElement={addEventListener(){},removeEventListener(){},remove(){}};setPixelRatio(){}setSize(){}dispose(){}forceContextLoss(){}render(scene){globalThis.__axiomTestScene=scene;}}`,
            loader: "js",
          }));
          b.onResolve({ filter: /^file:/ }, (args) => ({
            path: args.path,
            external: true,
          }));
          b.onResolve(
            { filter: /three\/addons\/controls\/OrbitControls/ },
            () => ({ path: "controls", namespace: "controls" }),
          );
          b.onLoad({ filter: /.*/, namespace: "controls" }, () => ({
            contents: `import {Vector3} from ${three};export class OrbitControls {target=new Vector3();constructor(camera){this.camera=camera;}addEventListener(){}removeEventListener(){}dispose(){}update(){this.camera.lookAt(this.target);}}`,
            loader: "js",
          }));
        },
      },
    ],
  });
  const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { devicePixelRatio: 1 },
  });
  let adapter;
  try {
    const { createThreeAdapter } = await import(pathToFileURL(output));
    const doc = JSON.parse(
      await readFile(
        new URL("../fixtures/four-spaces.json", import.meta.url),
        "utf8",
      ),
    );
    const compiled = compileScene(doc),
      at = (t) =>
        evaluateDocument(compiled, t).spaces.find((s) => s.name === "solid");
    adapter = createThreeAdapter(
      doc.spaces.find((s) => s.name === "solid"),
      () => {},
      (e) => {
        throw e;
      },
    );
    adapter.resize(800, 600);
    const frame = at(8);
    adapter.draw(frame, null);
    const nodes = () => {
      const result = [];
      globalThis.__axiomTestScene.traverse((o) => {
        if (o.geometry) result.push(o);
      });
      return result;
    };
    const original = nodes(),
      surface = original.find((o) => o.userData.id === "solid.surface"),
      geometry = surface.geometry;
    assert.equal(
      original.filter((o) => !o.userData.id).length,
      4,
      "grid and axes use four batched draws for independent axis fading",
    );
    const positions = geometry.getAttribute("position"),
      version = positions.version;
    let disposals = 0;
    for (const o of original)
      o.geometry.addEventListener("dispose", () => disposals++);
    const start = performance.now();
    for (let i = 0; i < 60; i++) adapter.draw(frame, null);
    console.log(
      `60 camera redraws: ${(performance.now() - start).toFixed(1)}ms CPU; ${disposals} original geometry disposals`,
    );
    assert.equal(disposals, 0, "camera redraw must not destroy GPU buffers");
    assert.deepEqual(nodes(), original);
    adapter.draw(at(8), "solid.surface");
    assert.equal(
      nodes().find((o) => o.userData.id === "solid.surface"),
      surface,
    );
    assert.equal(surface.material.color.getHexString(), "ffffff");
    assert.equal(positions.version, version);
    const before = Array.from(positions.array);
    adapter.draw(at(9), null);
    assert.equal(surface.geometry, geometry);
    assert.notDeepEqual(
      Array.from(geometry.getAttribute("position").array),
      before,
    );
    assert.equal(surface.material.color.getHexString(), "58a6ff");
    adapter.draw(at(8), null);
    assert.deepEqual(
      Array.from(geometry.getAttribute("position").array),
      before,
    );
    adapter.dispose();
    adapter = null;
    assert.equal(disposals, original.length);
    const moving = compileScene({
      version: 1,
      spaces: [
        {
          name: "s",
          type: "space3d",
          grid: false,
          axes: false,
          camera: { position: [0, -8, 4] },
          objects: [{ id: "ball", type: "Sphere", radius: 1 }],
        },
      ],
      events: [{ type: "Shift", object: "s.ball", by: [4, 0, 0], duration: 1 }],
    });
    adapter = createThreeAdapter(
      moving.document.spaces[0],
      () => {},
      (e) => {
        throw e;
      },
    );
    adapter.resize(800, 600);
    adapter.draw(evaluateDocument(moving, 0).spaces[0], null);
    assert.equal(adapter.pick(400, 300), "s.ball");
    adapter.draw(evaluateDocument(moving, 1).spaces[0], null);
    assert.equal(
      adapter.pick(400, 300),
      null,
      "updated bounds remove old picking location",
    );
    const projected = adapter.project([4, 0, 0]);
    assert.equal(
      adapter.pick(projected[0], projected[1]),
      "s.ball",
      "moving cached mesh remains pickable",
    );
    const smaller = structuredClone(evaluateDocument(moving, 1).spaces[0]);
    smaller.objects[0].geometry.points = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ];
    smaller.objects[0].geometry.indices = [0, 1, 2];
    adapter.draw(smaller, null);
    const resized = nodes()[0].geometry;
    assert.equal(resized.getAttribute("position").count, 3);
    assert.equal(
      resized.getAttribute("normal").count,
      3,
      "topology changes resize normals too",
    );
    adapter.draw({ ...smaller, objects: [] }, null);
    assert.equal(nodes().length, 0, "removed objects release cached nodes");
    const fillDoc = compileScene({
      version: 1,
      spaces: [
        {
          name: "solid",
          type: "space3d",
          objects: [
            {
              id: "square",
              type: "Square",
              size: 2,
              style: { opacity: 0.8, fillOpacity: 0.5 },
            },
          ],
        },
      ],
      events: [
        { type: "Create", object: "solid.square", duration: 1 },
        { type: "Uncreate", object: "solid.square", start: 2, duration: 1 },
      ],
    });
    let fillGeometry;
    for (const time of [0.25, 0.5, 0.999, 1, 2.5, 2.999]) {
      const frame = evaluateDocument(fillDoc, time).spaces[0];
      adapter.draw(frame, null);
      const fill = nodes().find(
        (n) => n.userData.id === "solid.square" && n.isMesh,
      );
      assert.ok(fill, "partial Create has a fill mesh");
      assert.ok(
        Math.abs(fill.material.opacity - 0.4 * frame.objects[0].reveal) < 1e-9,
      );
      if (fillGeometry)
        assert.equal(
          fill.geometry,
          fillGeometry,
          "reveal reuses the fill buffer",
        );
      fillGeometry = fill.geometry;
    }
    const border = compileScene({
      version: 1,
      spaces: fillDoc.document.spaces,
      events: [
        { type: "DrawBorderThenFill", object: "solid.square", duration: 2 },
      ],
    });
    for (const [time, alpha] of [
      [0.5, 0],
      [1, 0],
      [1.5, 0.2],
      [2, 0.4],
    ]) {
      adapter.draw(evaluateDocument(border, time).spaces[0], null);
      const fill = nodes().find(
        (n) => n.userData.id === "solid.square" && n.isMesh,
      );
      assert.ok(
        Math.abs((fill?.material.opacity ?? 0) - alpha) < 1e-9,
        "3D border completes before filling",
      );
    }
    const flash = compileScene({
      version: 1,
      spaces: fillDoc.document.spaces,
      events: [
        { type: "ShowPassingFlash", object: "solid.square", duration: 2 },
      ],
    });
    adapter.draw(evaluateDocument(flash, 1).spaces[0], null);
    assert.ok(
      !nodes().some((n) => n.userData.id === "solid.square" && n.isMesh),
      "3D flash has no fill mesh",
    );
    const growingArrow = compileScene({
      version: 1,
      spaces: [
        {
          name: "s",
          type: "space3d",
          objects: [
            { id: "arrow", type: "Arrow", from: [0, 0, 0], to: [2, 0, 0] },
          ],
        },
      ],
      events: [{ type: "GrowArrow", object: "s.arrow", duration: 1 }],
    });
    adapter.draw(evaluateDocument(growingArrow, 0.5).spaces[0], null);
    const head = nodes().find((n) => n.userData.id === "s.arrow" && n.isMesh);
    assert.equal(head.scale.x, 0.5, "3D arrowhead grows with its shaft");
    assert.ok(
      Math.abs(head.position.x - 0.95) < 1e-9,
      "growing arrowhead stays attached to its tip",
    );
    const helpers = compileScene({
      version: 1,
      parameters: { a: 1 },
      spaces: [
        {
          name: "s",
          type: "space3d",
          objects: [
            {
              id: "field",
              type: "ArrowVectorField",
              expressions: ["-a*y", "a*x", 0],
              xRange: [-2, 2],
              yRange: [-2, 2],
            },
            {
              id: "double",
              type: "CurvedDoubleArrow",
              from: [-2, 0, 1],
              to: [2, 0, 1],
            },
            {
              id: "dash",
              type: "DashedLine",
              from: [-2, 0, -1],
              to: [2, 0, -1],
            },
            {
              id: "flow",
              type: "StreamLines",
              expressions: [1, 0, 0],
              seeds: [
                [0, -1, 0],
                [0, 1, 0],
              ],
              step: 1,
              steps: 1,
            },
          ],
        },
      ],
    });
    const helpersFrame = evaluateDocument(helpers, 0).spaces[0];
    adapter.draw(helpersFrame, null);
    const fieldNodes = nodes().filter((n) => n.userData.id === "s.field");
    assert.equal(
      fieldNodes.length,
      2,
      "3D vector field batches shafts and heads in two draw nodes",
    );
    assert.ok(fieldNodes.every((n) => n.isLineSegments));
    assert.equal(
      nodes().filter((n) => n.userData.id === "s.double" && n.isMesh).length,
      2,
      "both arrowheads are rendered",
    );
    const flow = nodes().find((n) => n.userData.id === "s.flow");
    assert.equal(
      flow.geometry.getAttribute("position").count,
      4,
      "two separate segments without a bridge",
    );
    assert.ok(flow.isLineSegments);
    adapter.draw(evaluateDocument(helpers, 0, { a: 0.2 }).spaces[0], null);
    assert.deepEqual(
      nodes().filter((n) => n.userData.id === "s.field"),
      fieldNodes,
      "live field updates retain resources",
    );
    adapter.draw({ ...helpersFrame, objects: [] }, null);
    assert.equal(
      nodes().length,
      0,
      "compound path nodes are released when removed",
    );
    const copy = compileScene({
      version: 1,
      spaces: [
        {
          name: "s",
          type: "space3d",
          objects: [
            { id: "a", type: "Square", position: [-2, 0, 0] },
            { id: "b", type: "Square", position: [2, 0, 0] },
          ],
        },
      ],
      events: [
        {
          type: "TransformFromCopy",
          object: "s.a",
          to: "s.b",
          start: 1,
          duration: 2,
        },
      ],
    });
    const copyFrame = (t) => evaluateDocument(copy, t).spaces[0];
    adapter.draw(copyFrame(1.5), null);
    const overlayNodes = nodes().filter((n) =>
      n.userData.id?.includes(":overlay:"),
    );
    assert.ok(overlayNodes.length > 0, "copy renders temporary 3D geometry");
    const resources = new Set(
      overlayNodes.flatMap((n) => [n.geometry, ...[n.material].flat()]),
    );
    const disposed = new Map([...resources].map((r) => [r, 0]));
    for (const r of resources)
      r.addEventListener("dispose", () => disposed.set(r, disposed.get(r) + 1));
    adapter.draw(copyFrame(2), null);
    adapter.draw(copyFrame(2), null);
    assert.deepEqual(
      nodes().filter((n) => n.userData.id?.includes(":overlay:")),
      overlayNodes,
      "copy updates retain draw nodes",
    );
    assert.ok(
      [...disposed.values()].every((n) => n === 0),
      "copy updates retain GPU resources",
    );
    adapter.draw(copyFrame(3), null);
    assert.ok(
      !nodes().some((n) => n.userData.id?.includes(":overlay:")),
      "completed copy removes overlay",
    );
    assert.ok(
      [...disposed.values()].every((n) => n === 1),
      "completed copy disposes each resource once",
    );
    adapter.draw(copyFrame(2), null);
    const sought = nodes().filter((n) => n.userData.id?.includes(":overlay:"));
    assert.ok(sought.length > 0, "seeking recreates copy overlay");
    adapter.draw(copyFrame(0), null);
    assert.ok(
      !nodes().some((n) => n.userData.id?.includes(":overlay:")),
      "seeking before copy removes overlay",
    );
  } finally {
    adapter?.dispose();
    if (saved) Object.defineProperty(globalThis, "window", saved);
    else delete globalThis.window;
    delete globalThis.__axiomTestScene;
    await rm(dir, { recursive: true, force: true });
  }
});
