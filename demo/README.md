# Webnim demo

A separate app inside the engine repository. It owns the page, chapter buttons, subtitles, timeline, browser checks and local server. It imports only the public `webnim` APIs. The engine's published package excludes this directory.

## Start from the repository root

```sh
npm install
npm run demo
```

This builds the engine, installs demo dependencies, builds the site and serves it at http://localhost:1431. Stop with Ctrl+C. Rerun after editing engine or demo code; the server does not watch files.

## Work on just the demo

Once the engine is built, from `demo/`:

```sh
npm install
npm run build
npm start
```

The local engine dependency is `file:..`. Build copies reusable scene fixtures and fonts from the installed engine package. `demo/dist` is the standalone static site output. Use **Run browser checks** for interactive acceptance checks.
