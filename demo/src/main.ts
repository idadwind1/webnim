import { createPlayer, type ScenePlayer, type PlayerEvent } from "webnim/browser";
import { supportedObjects } from "webnim/document";
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = $<HTMLTextAreaElement>("input"),
  status = $("status"),
  container = $("engine");
const fixtures = await Promise.all(
  ["four-spaces", "plane-transformations", "picture-in-picture", "greens-theorem", "all-animations", "manim-additions"].map(
    async (name) => (await fetch(`/fixtures/${name}.json`)).json(),
  ),
);
const animationChapters: { name: string; description: string; start: number; end: number; space: string }[] = await (await fetch("/fixtures/all-animations.chapters.json")).json();
let player: ScenePlayer;
const playbackButtons = ["play", "pause", "seek", "reset", "tests"].map((id) =>
  $<HTMLButtonElement>(id),
);
playbackButtons.forEach((button) => {
  button.disabled = true;
});
type DemoChapter = { name: string; start: number; description: string };
const demoChapters: Record<string, DemoChapter[]> = {
  four: [
    {name: "Number line", start: 0, description: "A point moves along the number line as its position changes."},
    {name: "Cartesian plane", start: 2.5, description: "The curve changes amplitude while a point travels along it. Insets show the other spaces."},
    {name: "Polar plane", start: 5.5, description: "The rose curve uses radius and angle to trace its petals."},
    {name: "3D space", start: 8, description: "The surface rotates in three dimensions. Drag to explore it from another angle."},
    {name: "Return to plane", start: 12, description: "The Cartesian view returns with its number-line and 3D insets."},
  ],
  mapping: [
    {name: "Original plane", start: 0, description: "Start with the original grid and geometry before applying either transformation."},
    {name: "Shear", start: 1, description: "The matrix maps (x, y) to (x + 0.5y, y), shearing the grid and its objects together."},
    {name: "Complex transformation", start: 4, description: "The mapping z² / 3 bends the sheared plane into a nonlinear grid. Press Play to watch the transformation."},
  ],
  pip: [
    {name: "Linked views", start: 0, description: "The main view and insets share live parameters. Drag a point to explore their connection."},
    {name: "All insets", start: 2.5, description: "Each inset has its own camera while the views share one animation clock."},
  ],
};
let lesson = "";
let animationStop: number | null = null;
const timeline = $<HTMLInputElement>("timeline");
const describe = () => {
  if (!player) return;
  const f = player.getFrame();
  timeline.value = String(f.time);
  $<HTMLInputElement>("time").value = String(Number(f.time.toFixed(2)));
  $("view-state").textContent = `${f.time.toFixed(1)} s`;
  const stages = demoChapters[lesson];
  if (stages) {
    const chapter = stages.findLast(c => c.start <= f.time) ?? stages[0];
    $("explanation").textContent = chapter.description;
  }
  if (lesson === "animations") {
    const index = Math.max(0, animationChapters.findLastIndex(c => c.start <= f.time));
    const chapter = animationChapters[index];
    $("explanation").textContent = `${index + 1}/${animationChapters.length} · ${chapter.name}: ${chapter.description} Each chapter has a short setup, the effect, then a brief hold. Select an animation to replay it, or press Play for the full sequence.`;
    const select = document.getElementById("animation-choice") as HTMLSelectElement | null;
    if (select) select.value = String(index);
  }
  if (lesson === "additions") {
    $("explanation").textContent = "Drag the inset point to move the curved arrow. Choose Fields for vector arrows, streamlines and an implicit circle, or Tracing to explore the point’s recent path by playing or seeking. The 3D vector field fills a volume with F(x,y,z) = (−y, x, 0.6 + 0.2z); drag empty space to orbit and scroll to zoom. Later chapters show matrices, probability partitions, charts, directed graphs, polyhedra and bounds helpers.";
  }
  if (lesson === "greens") {
    const a = f.parameters.a;
    const stage = f.time < 4 ? "The blue square is D; drag its blue handle to resize it." : f.time < 10 ? "The gold point traces the boundary counterclockwise. Each side contributes a² to circulation." : f.time < 18 ? "Split D into four cells. Each small boundary also runs counterclockwise." : f.time < 24 ? "Shared edges run in opposite directions, so their contributions cancel." : "Only the outer boundary remains: total local curl equals boundary circulation.";
    $("explanation").textContent = `Green’s theorem: ∮∂D (P dx + Q dy) = ∬D (∂Q/∂x − ∂P/∂y) dA. Here F = (−y/2, x/2), curl = 1, D = [−a,a]². a = ${a.toFixed(2)}; circulation = area = 4a² = ${(4*a*a).toFixed(2)}. The field is continuously differentiable and the boundary is positively oriented. ${stage}`;

  }
};
const events = (event: PlayerEvent) => {
  $("events").textContent = JSON.stringify(event);
  if (event.type === "time" || event.type === "parameter") describe();
  if (event.type === "time" && animationStop !== null && (event.time ?? 0) >= animationStop) {
    const end = animationStop; animationStop = null; player.pause(); player.seek(end);
  }
};
const load = async (doc: unknown, demo = "") => {
  input.value = JSON.stringify(doc, null, 2);
  if (player) await player.load(doc);
  else
    player = await createPlayer(container, { document: doc, onEvent: events });
  lesson = demo;
  animationStop = null;
  $("lesson").hidden = false;
  $("explanation").textContent = "";
  timeline.max = String(player.getFrame().duration);
  const chapters = $("chapters");
  chapters.replaceChildren();
  if (demo === "animations") {
    const label = document.createElement("label"); label.textContent = "Animation ";
    const select = document.createElement("select"); select.id = "animation-choice";
    animationChapters.forEach((c, i) => { const option = document.createElement("option"); option.value = String(i); option.textContent = `${i + 1}. ${c.name}`; select.append(option); });
    const replay = () => { const chapter = animationChapters[Number(select.value)]; player.pause(); player.seek(chapter.start); animationStop = chapter.end - .3; player.play(); describe(); };
    select.onchange = replay;
    label.append(select); chapters.append(label);
    const button = document.createElement("button"); button.textContent = "Replay animation"; button.onclick = replay; chapters.append(button);
  }
  const steps: [string, number][] = demo === "greens" ? [["Region",0],["Boundary circulation",4],["Four cells",12],["Cancel shared edges",18],["Green’s theorem",24]] : demo === "additions" ? [["Geometry",0],["Fields",7],["Tracing",16],["3D vector field",21],["Matrices",29],["Charts and graphs",38],["Polyhedra",47],["More geometry",56],["Boolean paths",65]] : (demoChapters[demo] ?? []).map(c => [c.name, c.start]);
  for (const [label,time] of steps) {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => { player.pause(); player.seek(time); describe(); };
    chapters.append(button);
  }
  describe();
  playbackButtons.forEach((button) => {
    button.disabled = false;
  });
  status.textContent = `Loaded. ${supportedObjects.length} supported object types. Active space: ${player.getFrame().activeSpace}`;
};
const safely = (fn: () => unknown) => async () => {
  try {
    await fn();
  } catch (e) {
    status.textContent = String(e);
    if (String(e).includes("WebGL2 context")) {
      status.textContent +=
        "\nThis browser could not enable WebGL2, which the 3D example requires. In Firefox, open about:support and check Graphics / WebGL 2 for the reason. You can still open Plane transformations to try the 2D engine.";
    }
  }
};
$("four").onclick = safely(() => load(fixtures[0], "four"));
$("mapping").onclick = safely(() => load(fixtures[1], "mapping"));
$("pip").onclick = safely(() => load(fixtures[2], "pip"));
$("animations").onclick = safely(() => load(fixtures[4], "animations"));
$("greens").onclick = safely(() => load(fixtures[3], "greens"));
$("additions").onclick = safely(() => load(fixtures[5], "additions"));
timeline.oninput = () => { if (player) { animationStop = null; player.pause(); player.seek(Number(timeline.value)); describe(); } };
$("load").onclick = safely(() => load(JSON.parse(input.value)));
$("play").onclick = () => { animationStop = null; player.play(); };
$("pause").onclick = () => player.pause();
$("seek").onclick = () => {
  player.seek(Number($<HTMLInputElement>("time").value));
  status.textContent = `Time ${player.getFrame().time}; active space ${player.getFrame().activeSpace}`;
};
$("reset").onclick = () => player.resetCamera();
$("tests").onclick = safely(async () => {
  const settleZoom = () =>
    new Promise<void>((resolve) => {
      const start = performance.now();
      const tick = (stamp: number) =>
        stamp - start >= 600 ? resolve() : requestAnimationFrame(tick);
      requestAnimationFrame(tick);
    });
  const passed: string[] = [];
  const assert = (condition: unknown, message: string) => {
    if (!condition) throw new Error("FAIL: " + message);
    passed.push(message);
    status.textContent = passed.join("\n");
  };
  await player.load(fixtures[0]);
  player.pause();
  assert(player.getFrame().activeSpace === "line", "first space is default");
  assert(
    player
      .getFrame()
      .spaces.flatMap((s) => s.objects)
      .every((o) => !o.selected),
    "all objects unselected",
  );
  const original = player.getFrame();
  let rejected = false;
  try {
    await player.load({
      version: 1,
      spaces: [{ name: "bad", type: "oops", objects: [] }],
    });
  } catch {
    rejected = true;
  }
  assert(
    rejected && JSON.stringify(original) === JSON.stringify(player.getFrame()),
    "invalid load preserves current frame",
  );
  let invalidMath = false;
  try {
    await player.load({
      version: 1,
      spaces: [
        {
          name: "bad",
          type: "plane2d",
          objects: [{ id: "m", type: "MathTex", text: "\\notARealTexCommand" }],
        },
      ],
    });
  } catch {
    invalidMath = true;
  }
  assert(
    invalidMath &&
      JSON.stringify(original) === JSON.stringify(player.getFrame()),
    "invalid math resource leaves player intact",
  );
  const canvas = container.querySelector("canvas")!,
    rect = canvas.getBoundingClientRect();
  const before = player.getCamera();
  const wheel = new WheelEvent("wheel", {
    clientX: rect.left + 100,
    clientY: rect.top + 100,
    deltaY: -100,
    bubbles: true,
    cancelable: true,
  });
  canvas.dispatchEvent(wheel);
  await settleZoom();
  const explored = player.getCamera();
  assert(explored.scale > before.scale, "Canvas pointer-anchored wheel zoom");
  const xBefore =
      (wheel.clientX - rect.left - parseFloat(canvas.style.width) / 2) /
        before.scale +
      before.center[0],
    xAfter =
      (wheel.clientX - rect.left - parseFloat(canvas.style.width) / 2) /
        explored.scale +
      explored.center[0];
  assert(
    Math.abs(xBefore - xAfter) < 1e-8,
    `zoom keeps pointer world position (${xBefore}, ${xAfter}; width ${rect.width}; ${JSON.stringify(before)} -> ${JSON.stringify(explored)})`,
  );
  player.seek(7.5);
  assert(
    player.getFrame().layers.length === 2 &&
      player.getFrame().activeSpace === "solid",
    "2D-to-3D fade with destination interaction",
  );
  const fadeLayers = [
    ...container.querySelector(".webnim-document-player")!.children,
  ] as HTMLElement[];
  const visibleLayers = fadeLayers.filter(
    (layer) => layer.style.display !== "none",
  );
  assert(
    visibleLayers.some((layer) => layer.style.opacity === "1") &&
      visibleLayers.some((layer) => layer.style.opacity === "0.5"),
    "fade compositing avoids transparent-background bleed",
  );
  player.seek(0);
  assert(
    JSON.stringify(player.getCamera()) === JSON.stringify(explored),
    "camera survives space switches and seeks",
  );
  const oldWidth = container.clientWidth;
  container.style.width = "510px";
  await new Promise((r) =>
    requestAnimationFrame(() => requestAnimationFrame(r)),
  );
  assert(
    parseFloat(container.querySelector("canvas")!.style.width) ===
      container.clientWidth,
    "ResizeObserver resizes rendering surfaces",
  );
  container.style.width = oldWidth + "px";
  player.setParameter("position", 3);
  player.seek(1);
  assert(
    player.getFrame().parameters.position === 3,
    "parameter overrides persist through seek",
  );
  player.clearParameterOverrides();
  assert(
    player.getFrame().parameters.position !== 3,
    "overrides can be cleared",
  );
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    ...args: unknown[]
  ) {
    if (type === "webgl2") return null;
    return Reflect.apply(getContext, this, [type, ...args]);
  } as typeof getContext;
  const intact = JSON.stringify(player.getFrame());
  let unavailable = "";
  try {
    await player.load(fixtures[0]);
  } catch (e) {
    unavailable = String(e);
  } finally {
    HTMLCanvasElement.prototype.getContext = getContext;
  }
  assert(
    unavailable.includes("3D rendering is unavailable") &&
      JSON.stringify(player.getFrame()) === intact,
    "unavailable WebGL reported; existing player retained",
  );
  await player.load(fixtures[1]);
  player.seek(6);
  assert(
    player.getFrame().spaces[0].transforms.length === 2,
    "matrix and complex plane transformations render",
  );
  for (const type of ["plane2d", "space3d"] as const) {
    const caption = "<b>Origin</b>\nA plain-text caption.";
    await player.load({
      version: 1,
      spaces: [
        {
          name: "s",
          type,
          objects: [
            type === "space3d"
              ? { id: "p", type: "Sphere", radius: 1, caption }
              : { id: "p", type: "Point", at: [0, 0], caption },
          ],
        },
      ],
      events: [{ type: "FadeOut", object: "s.p", start: 1, duration: 1 }],
    });
    const canvas = container.querySelector("canvas")!,
      rect = canvas.getBoundingClientRect();
    const move = () =>
      canvas.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
        }),
      );
    move();
    const tooltip = container.querySelector('[role="tooltip"]') as HTMLElement;
    assert(
      tooltip.style.display !== "none" &&
        tooltip.textContent === caption &&
        !tooltip.querySelector("b"),
      `${type}: hover caption is visible and treats markup as literal text`,
    );
    const bounds = tooltip.getBoundingClientRect();
    assert(
      bounds.left >= rect.left - 1 && bounds.right <= rect.right + 1,
      `${type}: caption stays inside panel`,
    );
    assert(
      player.getFrame().spaces[0].objects[0].selected === false,
      `${type}: caption hover does not select object`,
    );
    canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: rect.left + 8,
        clientY: rect.top + 8,
        bubbles: true,
      }),
    );
    assert(
      tooltip.style.display === "none",
      `${type}: empty-space hover hides caption`,
    );
    move();
    player.seek(2);
    assert(
      tooltip.style.display === "none",
      `${type}: exiting object hides caption`,
    );
  }
  for (const type of ["plane2d", "space3d"] as const) {
    await player.load({
      version: 1,
      spaces: [{ name: "s", type, objects: [] }],
      events: [
        { type: "CameraZoom", space: "s", factor: 100, duration: 2 },
        ...(type === "plane2d"
          ? [
              {
                type: "CameraWindow",
                space: "s",
                x: [2, 6],
                y: [-1, 1],
                start: 2,
                duration: 1,
              },
            ]
          : []),
      ],
    });
    player.seek(1);
    assert(
      Math.abs(player.getCamera().scale - 600) < 1e-6,
      `${type}: camera zoom interpolates geometrically`,
    );
    player.seek(2);
    assert(
      Math.abs(player.getCamera().scale - 6000) < 1e-6,
      `${type}: 100x camera zoom`,
    );
    player.seek(0);
    assert(
      Math.abs(player.getCamera().scale - 60) < 1e-6,
      `${type}: camera seek reconstructs initial framing`,
    );
    if (type === "plane2d") {
      player.seek(3);
      const rect = container.getBoundingClientRect();
      assert(
        Math.abs(
          player.getCamera().scale -
            Math.min(container.clientWidth / 4, container.clientHeight / 2),
        ) < 1e-6 && Math.abs(player.getCamera().center[0] - 4) < 1e-6,
        "window fits bounds without stretching",
      );
      const canvas = container.querySelector("canvas")!;
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 100,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          bubbles: true,
          cancelable: true,
        }),
      );
      await settleZoom();
      const explored = player.getCamera().scale;
      player.seek(0);
      player.seek(3);
      assert(
        Math.abs(player.getCamera().scale - explored) < 1e-6,
        "camera exploration persists across seeks",
      );
      player.resetCamera();
      assert(
        Math.abs(
          player.getCamera().scale -
            Math.min(container.clientWidth / 4, container.clientHeight / 2),
        ) < 1e-6,
        "camera reset restores current authored window",
      );
    }
  }
  {
    await player.load({
      version: 1,
      parameters: { a: 0 },
      spaces: [
        {
          name: "main",
          type: "plane2d",
          objects: [
            {
              type: "PictureInPicture",
              id: "a",
              space: "detail",
              x: 10,
              y: 10,
              width: 200,
              height: 140,
            },
            {
              type: "PictureInPicture",
              id: "b",
              space: "detail",
              x: 220,
              y: 10,
              width: 200,
              height: 140,
            },
            {
              type: "PictureInPicture",
              id: "c",
              space: "solid",
              x: 10,
              y: 160,
              width: 200,
              height: 140,
            },
          ],
        },
        {
          name: "detail",
          type: "plane2d",
          objects: [
            {
              id: "p",
              type: "Point",
              at: ["a", 0],
              caption: "PiP caption",
              drag: { parameter: "a", coordinate: 0 },
            },
          ],
        },
        {
          name: "solid",
          type: "space3d",
          objects: [{ id: "cube", type: "Cube" }],
        },
      ],
      events: [
        ...["a", "b", "c"].flatMap((id) => [
          { type: "FadeIn", object: `main.${id}`, start: 1, duration: 1 },
          { type: "FadeOut", object: `main.${id}`, start: 4, duration: 1 },
        ]),
        { type: "AnimateParameter", parameter: "a", to: 1, duration: 5 },
        {
          type: "SwitchSpace",
          space: "detail",
          start: 5,
          duration: 1,
          transition: "fade",
        },
      ],
      duration: 6,
    });
    const pip = (id: string) =>
      container.querySelector<HTMLElement>(`[data-pip="main.${id}"]`)!;
    assert(pip("a").style.display === "none", "PiP hidden before entrance");
    player.seek(1.5);
    assert(
      Math.abs(Number(pip("a").style.opacity) - 0.5) < 1e-8,
      "PiP object FadeIn controls panel opacity",
    );
    player.seek(2.5);
    assert(
      ["a", "b", "c"].every((id) => pip(id).style.display !== "none"),
      "three PiP objects coexist, including 3D and repeated spaces",
    );
    const rect = pip("a").getBoundingClientRect(),
      parentRect = container
        .querySelector(".webnim-document-player")!
        .getBoundingClientRect();
    assert(
      rect.width === 200 &&
        rect.height === 140 &&
        rect.left - parentRect.left === 10 &&
        rect.top - parentRect.top === 10,
      "PiP uses absolute panel-local pixel bounds",
    );
    const canvas = pip("a").querySelector("canvas")!;
    let pipHover:
      { object?: string | null; pictureInPicture?: string } | undefined;
    const stop = player.on((e) => {
      if (e.type === "hover") pipHover = e;
    });
    canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: rect.left + 130,
        clientY: rect.top + 70,
        bubbles: true,
      }),
    );
    assert(
      pipHover?.object === "detail.p" && pipHover.pictureInPicture === "main.a",
      "PiP picking reports qualified object and instance IDs",
    );
    assert(
      container.querySelector<HTMLElement>('[role="tooltip"]')!.textContent ===
        "PiP caption" &&
        container.querySelector<HTMLElement>('[role="tooltip"]')!.style
          .display !== "none",
      "PiP hover shows captions",
    );
    const mainScale = player.getCamera("detail").scale,
      otherScale = player.getPictureInPictureCamera("main.b").scale;
    canvas.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: 100,
        clientX: rect.left + 100,
        clientY: rect.top + 70,
        bubbles: true,
        cancelable: true,
      }),
    );
    await settleZoom();
    assert(
      player.getPictureInPictureCamera("main.a").scale !== otherScale &&
        player.getPictureInPictureCamera("main.b").scale === otherScale &&
        player.getCamera("detail").scale === mainScale,
      "PiP navigation leaves main and sibling cameras independent",
    );
    const explored = player.getPictureInPictureCamera("main.a").scale;
    player.seek(0);
    player.seek(3);
    assert(
      player.getPictureInPictureCamera("main.a").scale === explored,
      "PiP camera survives disappearance and reverse seeking",
    );
    player.resetPictureInPictureCamera("main.a");
    assert(
      player.getPictureInPictureCamera("main.a").scale === 60,
      "PiP camera can reset independently",
    );
    player.seek(4.5);
    assert(
      Math.abs(Number(pip("a").style.opacity) - 0.5) < 1e-8,
      "PiP object FadeOut controls panel opacity",
    );
    player.seek(5);
    assert(
      ["a", "b", "c"].every((id) => pip(id).style.display === "none"),
      "PiPs disappear exactly at their endpoints",
    );
    stop();
  }
  await load(fixtures[3], "greens");
  player.seek(24);
  assert($("explanation").textContent!.includes("total local curl equals boundary circulation"), "Green lesson follows its timeline on this viewer");
  player.setParameter("a", 2);
  assert($("explanation").textContent!.includes("16.00"), "Green lesson recomputes area and circulation after resizing");
  player.dispose();
  assert(container.children.length === 0, "dispose removes all owned surfaces");
  player = await createPlayer(container, {
    document: fixtures[0],
    onEvent: events,
  });
  lesson = "four";
  $("lesson").hidden = false;
  timeline.max = String(player.getFrame().duration);
  describe();
  status.textContent =
    `PASS: ${passed.length} browser checks\n` + passed.join("\n");
});
const initial = location.hash === "#additions" ? 5 : location.hash === "#animations" ? 4 : location.hash === "#greens" ? 3 : location.hash === "#mapping" ? 1 : location.hash === "#pip" ? 2 : 0;
await safely(() => load(fixtures[initial], initial === 5 ? "additions" : initial === 4 ? "animations" : initial === 3 ? "greens" : initial === 1 ? "mapping" : initial === 2 ? "pip" : "four"))();
