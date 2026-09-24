# Webnim Engine

[![npm version](https://img.shields.io/npm/v/webnim.svg)](https://www.npmjs.com/package/webnim)

```sh
npm install webnim
```

Licensed under [MIT](LICENSE). The GitHub Packages mirror is `@idadwind1/webnim`.

## Declarative JSON scenes

The engine now has a document API: `compileScene`, `evaluateDocument`, and the browser-only `createPlayer`. Define spaces, geometry, live parameters and event tracks in one JSON document. Includes all four space types, Canvas/Three.js interaction, matrix/complex whole-space transformations, and simultaneous picture-in-picture spaces.

See [the document API guide](https://github.com/idadwind1/webnim/wiki/DECLARATIVE-SCENES), [Manim coverage](https://github.com/idadwind1/webnim/wiki/Features-and-Limitations), and the engine-owned [fixtures](fixtures/). Existing authoring, shell and React APIs below remain compatible.

A TypeScript library for interactive 2D mathematical scenes. It includes scene factories, deterministic animation tracks, expression evaluation, Canvas rendering, hit testing, and camera utilities. An optional React adapter supplies pan/zoom, object hover and KaTeX labels.

## Smooth camera zoom

With a player returned by `createPlayer`, zoom the active view around its camera center:

```ts
player.zoomCamera(1.25, { durationMs: 200 }); // zoom in
player.zoomCamera(0.8, { durationMs: 200 });  // zoom out
player.zoomCamera(2, { space: 'solid', durationMs: 0 }); // immediate
player.setCameraZoom(120, { durationMs: 200 }); // absolute camera scale
player.setCameraZoom(60, { space: 'solid', durationMs: 200 });
```

`setCameraZoom` sets the same absolute scale returned by `getCamera().scale` (initial default: 60), rather than multiplying it. Its finite, positive target replaces any pending zoom destination without jumping. Both methods support `axis1d`, `plane2d`, `polar2d`, and `space3d` with perspective or orthographic projection, and accept the same options and cancellation behavior. The optional `space` names a main-view space; inset cameras remain independent.

The factor must be finite and positive. Duration defaults to 200 milliseconds and must be finite and nonnegative. Repeated calls accumulate into a target zoom without changing the currently displayed scale abruptly. The animation uses eased logarithmic interpolation and works with Canvas views and both 3D projections. Zoom is an interactive camera offset and does not advance the scene clock; authored camera animation continues to compose with it.

Wheel input, pointer presses (including object dragging), either camera-reset method, scene loading/replacement, and disposal cancel pending programmatic zoom at its current scale. Switching the requested space starts a new target. Calls during object dragging are ignored. Numerical viewport limits can stop zoom before the requested target.

## Build and install

Requires Node.js 22+ for the development tests and a modern browser for Canvas rendering.

```sh
npm install
npm test
npm pack
# In another project, install the generated archive:
npm install /path/to/webnim-0.2.0.tgz
# Or install this repository directory while developing:
npm install /path/to/webnim-engine
```

The archive contains compiled ESM, TypeScript declarations, and React adapter CSS. Rebuild after editing library source. This package does not import the example application or its lessons.

## Framework-independent API

```ts
import {Engine, SceneBuilder, Circle, Create, Shift} from 'webnim';

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

Install React 19 in the host app to use this adapter. React is an optional peer dependency; KaTeX is included as an engine dependency.

```tsx
import {Stage} from 'webnim/react';
import 'webnim/react/style.css';

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

Root exports include `Engine`, `SceneBuilder`, factories, animation helpers, scene evaluation, renderer, themes and camera utilities. Module entry points such as `webnim/shell`, `/parser`, `/vector` and `/timeline` expose lower-level APIs. `executeCommand` interprets local mathematical commands. The host application owns demo selection.

## Separate demo app and app integration

The demo site lives in [`demo/`](demo/README.md) in this repository, with its own dependencies, build and server. It imports the public engine APIs and is excluded from the published engine package.

From the repository root, run `npm install` once, then **`npm run demo`** to build the engine, install demo dependencies, build the demo and serve it at http://localhost:1431. Stop it with Ctrl+C. The `fixtures` directory contains reusable scene documents used by engine tests and the demo.

For a new browser app, install this package and use its public entry points:

```ts
import { createPlayer } from 'webnim/browser';
import 'webnim/browser/style.css';
import type { SceneDocument } from 'webnim/document';

const scene: SceneDocument = {
  version: 1,
  spaces: [{ name: 'main', type: 'plane2d', objects: [
    { id: 'point', type: 'Point', at: [0, 0] }
  ] }]
};
const player = await createPlayer(container, { document: scene });
// Give container a nonzero width and height. On app teardown:
player.dispose();
```

Your app owns controls, routing and lesson content. The engine supplies rendering, interaction and deterministic scene evaluation. Headless consumers can import `webnim/document` without mounting a browser player.

## Publishing

See [Publishing Webnim](https://github.com/idadwind1/webnim/wiki/PUBLISHING) for npm and GitHub Packages release commands, authentication and versioning.
