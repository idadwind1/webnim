import { createPlayer } from "webnim/browser";

export async function checkCameraZoom(
  assert: (ok: boolean, message: string) => void,
) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:640px;height:400px;z-index:99999";
  document.body.append(host);
  const scene = {
    version: 1,
    spaces: [{ name: "s", type: "plane2d", objects: [] }],
  };
  const player = await createPlayer(host, { document: scene });
  const raf = window.requestAnimationFrame,
    caf = window.cancelAnimationFrame;
  const pending = new Map<number, FrameRequestCallback>();
  let id = 0;
  window.requestAnimationFrame = (fn) => {
    pending.set(++id, fn);
    return id;
  };
  window.cancelAnimationFrame = (key) => {
    pending.delete(key);
  };
  const settle = () => {
    const jobs = [...pending.values()];
    pending.clear();
    jobs.forEach((fn) => fn(performance.now() + 1000));
  };
  try {
    player.zoomCamera(1.25);
    player.zoomCamera(1.25);
    player.zoomCamera(0.8);
    assert(pending.size === 1, "zoom clicks share one animation");
    settle();
    assert(
      Math.abs(player.getCamera().scale - 75) < 1e-9,
      "zoom clicks accumulate to the target",
    );
    assert(
      player.getFrame().time === 0,
      "camera zoom does not advance scene time",
    );
    for (const event of ["wheel", "pointerdown"]) {
      player.zoomCamera(2);
      const root = host.firstElementChild!;
      root.dispatchEvent(
        event === "wheel"
          ? new WheelEvent(event, { bubbles: true })
          : new PointerEvent(event, { bubbles: true }),
      );
      assert(pending.size === 0, event + " cancels programmatic zoom");
    }
    player.zoomCamera(2);
    player.resetCamera();
    assert(
      pending.size === 0 && player.getCamera().scale === 60,
      "reset cancels and restores camera",
    );
    player.zoomCamera(2);
    await player.load(scene);
    assert(
      pending.size === 0 && player.getCamera().scale === 60,
      "scene replacement cancels zoom",
    );
    player.zoomCamera(2, { durationMs: 0 });
    assert(
      pending.size === 0 && Math.abs(player.getCamera().scale - 120) < 1e-9,
      "zero-duration zoom is immediate",
    );
    for (const [type, projection] of [
      ["axis1d", "orthographic"],
      ["plane2d", "orthographic"],
      ["polar2d", "orthographic"],
      ["space3d", "perspective"],
      ["space3d", "orthographic"],
    ]) {
      await player.load({
        version: 1,
        spaces: [
          {
            name: "solid",
            type,
            camera: { projection },
            objects: [],
          },
        ],
      });
      const before = player.getCamera();
      player.zoomCamera(10);
      player.setCameraZoom(90, { space: "solid", durationMs: 200 });
      assert(
        player.getCamera().scale === before.scale,
        `${type}/${projection}: absolute target does not jump`,
      );
      settle();
      assert(
        Math.abs(player.getCamera().scale - 90) < 1e-9,
        `${type}/${projection}: absolute target replaces pending relative zoom`,
      );
      player.setCameraZoom(60, { durationMs: 0 });
      player.zoomCamera(2, { durationMs: 200 });
      settle();
      assert(
        Math.abs(player.getCamera().scale - before.scale * 2) < 1e-9,
        `${projection}: public API doubles camera scale`,
      );
      assert(
        JSON.stringify(player.getCamera().center) ===
          JSON.stringify(before.center),
        `${projection}: zoom preserves camera center`,
      );
    }
    player.zoomCamera(2);
    player.dispose();
    assert(pending.size === 0, "disposal cancels zoom");
    let rejected = false;
    try {
      player.zoomCamera(2);
    } catch {
      rejected = true;
    }
    assert(rejected, "disposed player rejects zoom");
  } finally {
    player.dispose();
    window.requestAnimationFrame = raf;
    window.cancelAnimationFrame = caf;
    host.remove();
  }
}
