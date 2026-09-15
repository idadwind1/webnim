import { copyFile } from "node:fs/promises";
await copyFile(
  new URL("../src/react/style.css", import.meta.url),
  new URL("../dist/react/style.css", import.meta.url),
);

import { writeFile, cp } from "node:fs/promises";
import { sceneSchemaV1 } from "../dist/document/schema.js";
await writeFile(
  new URL("../dist/document/scene-v1.schema.json", import.meta.url),
  JSON.stringify(sceneSchemaV1, null, 2) + "\n",
);
await copyFile(
  new URL("../node_modules/katex/dist/katex.min.css", import.meta.url),
  new URL("../dist/player/style.css", import.meta.url),
);
await cp(
  new URL("../node_modules/katex/dist/fonts/", import.meta.url),
  new URL("../dist/player/fonts/", import.meta.url),
  { recursive: true },
);
