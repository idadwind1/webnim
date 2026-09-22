import { createPlayer } from "webnim/browser";

/** Exercise actual DOM targeting as well as the player's scene picking. */
export async function checkLabelHits(
  assert: (ok: boolean, message: string) => void,
) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;left:0;top:0;width:640px;height:400px;z-index:999999";
  document.body.append(host);
  let picked: string | null | undefined;
  const player = await createPlayer(host, {
    document: {
      version: 1,
      spaces: [{ name: "s", type: "plane2d", objects: [] }],
    },
    onEvent: (event) => {
      if (event.type === "click") picked = event.object;
    },
  });
  const click = (x: number, y: number) => {
    picked = undefined;
    const target = document.elementFromPoint(x, y)!;
    for (const type of ["pointermove", "pointerdown", "pointerup"])
      target.dispatchEvent(
        new PointerEvent(type, { clientX: x, clientY: y, bubbles: true }),
      );
    return picked;
  };
  try {
    for (const type of ["plane2d", "space3d"] as const) {
      for (const scale of [1, 2]) {
        const scene = {
          version: 1,
          spaces: [
            {
              name: "s",
              type,
              objects: [
                {
                  id: "p",
                  type: "Point",
                  at: type === "plane2d" ? [0, 0] : [0, 0, 0],
                  caption: "Point underneath",
                  style: { pointSize: 10 },
                },
                {
                  id: "label",
                  type: "Text",
                  text: "A                 B",
                  caption: "Visible label",
                  style: { fontSize: 20 },
                },
              ],
            },
          ],
          events: [
            { type: "Scale", object: "s.label", factor: scale, duration: 1 },
          ],
        };
        await player.load(scene);
        player.seek(1);
        const bounds = host.getBoundingClientRect();
        const x = bounds.left + bounds.width / 2,
          y = bounds.top + bounds.height / 2;
        assert(
          click(x, y) === "s.p",
          `${type}, scale ${scale}: whitespace passes through to point`,
        );
        const label = host.querySelector<HTMLElement>(
          '[data-object="s.label"]',
        )!;
        const range = document.createRange();
        range.setStart(label.firstChild!, 0);
        range.setEnd(label.firstChild!, 1);
        const glyph = range.getBoundingClientRect();
        assert(
          click(glyph.left + glyph.width / 2, glyph.top + glyph.height / 2) ===
            "s.label",
          `${type}, scale ${scale}: visible text remains selectable`,
        );
        assert(
          host.querySelector('[role="tooltip"]')?.textContent ===
            "Visible label",
          `${type}: text caption remains available`,
        );
        const transparent = structuredClone(scene);
        await player.load({
          ...transparent,
          spaces: transparent.spaces.map((space) => ({
            ...space,
            objects: space.objects.map((object) =>
              object.id === "label"
                ? {
                    ...object,
                    text: "MMMM",
                    style: { fontSize: 20, opacity: 0 },
                  }
                : object,
            ),
          })),
        });
        assert(
          click(x, y) === "s.p",
          `${type}: transparent label passes through to point`,
        );
      }
    }
    for (const text of ["LONG LABEL\nX", "\\frac{a}{b}\\qquad c"]) {
      const math = text.startsWith("\\");
      await player.load({
        version: 1,
        spaces: [
          {
            name: "s",
            type: "plane2d",
            objects: [
              {
                id: "p",
                type: "Point",
                at: [0, 0],
                style: { pointSize: 12 },
              },
              {
                id: "label",
                type: math ? "MathTex" : "Text",
                text,
                caption: "Label caption",
              },
            ],
          },
        ],
      });
      const label = host.querySelector<HTMLElement>('[data-object="s.label"]')!;
      const bounds = label.getBoundingClientRect();
      const blank = math
        ? label.querySelector(".mspace")!.getBoundingClientRect()
        : bounds;
      const x = math ? blank.left + blank.width / 2 : bounds.right - 2;
      const y = math ? bounds.top + bounds.height / 2 : bounds.bottom - 3;
      const hostBounds = host.getBoundingClientRect();
      // Put a horizontal line through the blank area, then click its intersection.
      const doc = {
        version: 1,
        spaces: [
          {
            name: "s",
            type: "plane2d",
            objects: [
              {
                id: "line",
                type: "Line",
                from: [-5, -(y - hostBounds.top - 200) / 60],
                to: [5, -(y - hostBounds.top - 200) / 60],
              },
              {
                id: "label",
                type: math ? "MathTex" : "Text",
                text,
                caption: "Label caption",
              },
            ],
          },
        ],
      };
      await player.load(doc);
      assert(
        click(x, y) === "s.line",
        `${math ? "MathTex spacing" : "multiline blank area"}: underlying line is selectable`,
      );
      if (math) {
        const rule = host.querySelector(".frac-line")!.getBoundingClientRect();
        assert(
          click(rule.left + rule.width / 2, rule.top + rule.height / 2) ===
            "s.label",
          "MathTex fraction rule remains selectable",
        );
      }
    }
  } finally {
    player.dispose();
    host.remove();
  }
}
