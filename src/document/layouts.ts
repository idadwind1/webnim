import {
  SceneValidationError,
  type SceneDocument,
  type SceneObject,
  type ObjectBase,
  type MatrixSpecs,
  type SceneEvent,
} from "./types.ts";
/** Layouts compile to ordinary children so animation, picking and resource caching stay shared. */
export function expandLayouts(document: SceneDocument): SceneDocument {
  for (const [si, space] of document.spaces.entries()) {
    const occupied = new Set(space.objects.map((o) => o.id)),
      output: SceneObject[] = [];
    for (const [oi, o] of space.objects.entries()) {
      if (
        ![
          "Matrix",
          "DecimalMatrix",
          "IntegerMatrix",
          "BarChart",
          "SampleSpace",
          "Graph",
          "DiGraph",
        ].includes(o.type)
      ) {
        output.push(o);
        continue;
      }
      const path = `$.spaces[${si}].objects[${oi}]`;
      const fail = (message: string): never => {
        throw new SceneValidationError([{ path, message }]);
      };
      if (space.type !== "plane2d") fail("Layouts require plane2d");
      const children: SceneObject[] = [];
      const add = (suffix: string, object: Omit<SceneObject, "id">) => {
        const id = `${o.id}_${suffix}`;
        if (occupied.has(id)) fail(`Generated child ID ${id} already exists`);
        occupied.add(id);
        children.push({
          ...object,
          id,
          style: {
            color: o.style?.color,
            strokeWidth: o.style?.strokeWidth,
            ...object.style,
          },
        } as SceneObject);
      };
      const label = (
        suffix: string,
        text: string,
        x: number,
        y: number,
        math = false,
      ) =>
        add(suffix, {
          type: math ? "MathTex" : "Text",
          text,
          position: [x, y],
          style: { fontSize: o.style?.fontSize ?? 18, color: o.style?.color },
        } as Omit<SceneObject, "id">);
      if ("entries" in o) {
        const d = o as ObjectBase & MatrixSpecs,
          rows = d.entries.length,
          cols = d.entries[0].length,
          w = d.cellWidth ?? 1.5,
          h = d.cellHeight ?? 0.8;
        if (d.entries.some((row) => row.length !== cols))
          fail("Matrix rows must have equal lengths");
        if (rows * cols > 512) fail("Layout exceeds 512 cells");
        const decimal = ["DecimalMatrix", "IntegerMatrix"].includes(o.type);
        d.entries.forEach((row, r) =>
          row.forEach((entry, c) => {
            const x = (c - (cols - 1) / 2) * w,
              y = ((rows - 1) / 2 - r) * h;
            if (decimal)
              add(`cell_${r}_${c}`, {
                type: "DecimalNumber",
                value: entry,
                decimals: o.type === "IntegerMatrix" ? 0 : (d.decimals ?? 2),
                position: [x, y],
                style: { fontSize: o.style?.fontSize ?? 18 },
              } as Omit<SceneObject, "id">);
            else label(`cell_${r}_${c}`, String(entry), x, y, true);
          }),
        );
        for (const side of [-1, 1]) {
          const x = side * ((cols * w) / 2 + 0.15),
            y = (rows * h) / 2;
          add(side < 0 ? "left_bracket" : "right_bracket", {
            type: "Polyline",
            points: [
              [x - side * 0.2, y],
              [x, y],
              [x, -y],
              [x - side * 0.2, -y],
            ],
          } as Omit<SceneObject, "id">);
        }
      } else if (o.type === "BarChart") {
        if (o.labels && o.labels.length !== o.values.length)
          fail("Bar labels must match values");
        const w = o.barWidth ?? 0.7,
          gap = o.gap ?? 0.3;
        o.values.forEach((value, i) => {
          const x = (i - (o.values.length - 1) / 2) * (w + gap),
            v = typeof value === "number" ? String(value) : `(${value})`;
          add(`bar_${i}`, {
            type: "Rectangle",
            width: w,
            height: `max(abs(${v}),0.000000000001)`,
            position: [x, `${v}/2`],
            style: { fillOpacity: o.style?.fillOpacity ?? 0.65 },
          } as Omit<SceneObject, "id">);
          if (o.labels) label(`label_${i}`, o.labels[i], x, -0.4);
        });
      } else if (o.type === "SampleSpace") {
        if (Math.abs(o.probabilities.reduce((s, p) => s + p, 0) - 1) > 1e-8)
          fail("Probabilities must sum to one");
        if (o.labels && o.labels.length !== o.probabilities.length)
          fail("Labels must match probabilities");
        const w = o.width ?? 6,
          h = o.height ?? 2;
        let x = -w / 2;
        o.probabilities.forEach((probability, i) => {
          const width = w * probability;
          add(`part_${i}`, {
            type: "Rectangle",
            width,
            height: h,
            position: [x + width / 2, 0],
            style: { fillOpacity: o.style?.fillOpacity ?? 0.25 },
          } as Omit<SceneObject, "id">);
          if (o.labels) label(`label_${i}`, o.labels[i], x + width / 2, 0);
          x += width;
        });
      } else if (o.type === "Graph" || o.type === "DiGraph") {
        if (new Set(o.vertices).size !== o.vertices.length)
          fail("Graph vertices must be unique");
        if (
          o.positions &&
          (Object.keys(o.positions).some((k) => !o.vertices.includes(k)) ||
            o.vertices.some((k) => !o.positions![k]))
        )
          fail("Explicit positions must cover exactly the graph vertices");
        const positions = Object.fromEntries(
          o.vertices.map((v, i) => [
            v,
            o.positions?.[v] ??
              (o.layout === "line"
                ? [(i - (o.vertices.length - 1) / 2) * (o.radius ?? 2), 0]
                : [
                    (o.radius ?? 2) *
                      Math.cos((2 * Math.PI * i) / o.vertices.length),
                    (o.radius ?? 2) *
                      Math.sin((2 * Math.PI * i) / o.vertices.length),
                  ]),
          ]),
        );
        for (const [i, [from, to]] of o.edges.entries()) {
          if (
            !o.vertices.includes(from) ||
            !o.vertices.includes(to) ||
            from === to
          )
            fail("Edges require two distinct known vertices");
          add(`edge_${i}`, {
            type: o.type === "DiGraph" ? "Arrow" : "Line",
            from: positions[from],
            to: positions[to],
          } as Omit<SceneObject, "id">);
        }
        o.vertices.forEach((v) => {
          add(`vertex_${v}`, {
            type: "Point",
            at: positions[v],
            style: { pointSize: o.style?.pointSize ?? 7 },
          } as Omit<SceneObject, "id">);
          if (o.labels !== false)
            label(`label_${v}`, v, positions[v][0], positions[v][1] + 0.3);
        });
      }
      const { id, position, style, caption } = o;
      output.push(
        {
          type: "Group",
          id,
          position,
          style,
          caption,
          children: children.map((c) => `${space.name}.${c.id}`),
        },
        ...children,
      );
    }
    space.objects = output;
  }
  const expand = (events: SceneEvent[]): SceneEvent[] =>
    events.map((event) => {
      if (event.type === "LaggedStartMap")
        return {
          type: "LaggedStart",
          start: event.start,
          duration: event.duration,
          lagRatio: event.lagRatio,
          events: event.objects.map((object) => ({
            ...event.animation,
            object,
          })),
        };
      return "events" in event
        ? { ...event, events: expand(event.events) }
        : event;
    });
  if (document.events) document.events = expand(document.events);
  const stripUndefined = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      if (child === undefined) delete (value as Record<string, unknown>)[key];
      else stripUndefined(child);
    }
  };
  stripUndefined(document);
  return document;
}
