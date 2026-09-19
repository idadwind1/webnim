import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
const root = resolve("dist");
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ),
      file = resolve(
        root,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
    if (!file.startsWith(root + "/")) throw new Error("Invalid path");
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ttf": "font/ttf",
      }[extname(file)] ?? "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(1431, "127.0.0.1", () =>
  console.log("Webnim demo: http://localhost:1431"),
);
