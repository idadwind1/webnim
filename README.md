# Axiom Engine

## Declarative JSON scenes

The engine now has a document API: `compileScene`, `evaluateDocument`, and the browser-only `createPlayer`. Define spaces, geometry, live parameters and event tracks in one JSON document. Includes all four space types, Canvas/Three.js interaction, matrix/complex whole-space transformations, and simultaneous picture-in-picture spaces.

See [the document API guide](docs/DECLARATIVE-SCENES.md), [Manim coverage](docs/MANIM-COVERAGE.md), and the engine-owned [fixtures](fixtures/). Existing authoring, shell and React APIs below remain compatible.

A TypeScript library for interactive 2D mathematical scenes. It includes scene factories, deterministic animation tracks, expression evaluation, Canvas rendering, hit testing, and camera utilities. An optional React adapter supplies pan/zoom, object hover and KaTeX labels.

## Build and install

Requires Node.js 22+ for the development tests and a modern browser for Canvas rendering.

```sh
npm install
npm test
npm pack
# In another project, install the generated archive:
npm install /path/to/axiom-math-engine-0.1.0.tgz
# Or install this repository directory while developing:
npm install /path/to/axiom-engine
```

The archive contains compiled ESM, TypeScript declarations, and React adapter CSS. Rebuild after editing library source. This package does not import the example application or its lessons.

## Framework-independent API

```ts
import {Engine, SceneBuilder, Circle, Create, Shift} from '@axiom-math/engine';

const scene = new SceneBuilder()
  .add(Circle('circle', 1, {color: '#4aa3ff'}))
  .play(Create('circle', 1))
  .play(Shift('circle', 2, 0, 2))
  .build();
const engine = new Engine(scene);

// Call from your animation loop. Time is in seconds; seeking is deterministic.
engine.render(canvas.getContext('2d')!, 1.5, {
  camera: {x: 0, y: 0, scale: 80},
  viewport: {width: canvas.width, height: canvas.height},
  grid: true,
  highlight: ['circle'],
  theme: {background: '#ffffff', axes: '#888888', objectColors: {circle: '#0077cc'}},
});
```

The host owns the canvas size, device pixel ratio, clock, camera, and event handlers. `render` returns hit targets; use exported `hitTest`, `screenToWorld`, `panBy`, and `zoomAt` to build your own interaction layer. Canvas-only rendering does not draw MathTex labels; use the React adapter or supply a text overlay for those nodes.

## Optional React view

Install `react` and `katex` in the host app. React and KaTeX are optional peer dependencies; core consumers do not need them.

```tsx
import {Stage} from '@axiom-math/engine/react';
import '@axiom-math/engine/react/style.css';

<div style={{height: 500}}>
  <Stage
    frame={engine.frame(time)} lessonId="my-scene"
    highlight={highlight} onHover={id => setHighlight(id ? [id] : [])}
    onSelect={() => {}} onDragPoint={() => {}} onCamera={() => {}}
    resetToken={0} focusToken={0} grid
    initialCamera={{x: 0, y: 0, scale: 80}}
    theme={{background: '#101820', objectColors: {circle: '#ffcc00'}}}
  />
</div>
```

The example expects host-owned `time`, `highlight`, and `setHighlight` state. Change `resetToken` to reset navigation. `initialCamera` is applied on mount and reset; it does not overwrite the user's view every frame. Legacy `onDragPoint` and focus behavior target a point named P and the shared parameter a.

## Colors

- Set a factory's `color` to author an object's color.
- Pass `theme.objectColors` to override specific IDs without modifying scene data.
- Pass `theme.palette` to map authored colors to replacement colors for a view.
- Customize `background`, `gridMinor`, `gridMajor`, `axes`, `tickLabels`, `axisLabels`, and `foreground` independently.
- `defaultTheme` and `lightTheme` provide starting points. Overrides apply per render/view, with no global mutable theme.
- Object ID overrides take precedence over palette remapping; the original scene remains unchanged.

## Exports and scope

Root exports include `Engine`, `SceneBuilder`, factories, animation helpers, scene evaluation, renderer, themes and camera utilities. Module entry points such as `@axiom-math/engine/shell`, `/parser`, `/vector` and `/timeline` expose lower-level APIs. `executeCommand` interprets local mathematical commands. The host application owns demo selection.
