import type { SceneDocument } from "../document/types.ts";
/** Finish resource loading before replacing a working scene. No executable URL schemes or inline SVG. */
export async function preloadImages(
  document: SceneDocument,
  create: () => HTMLImageElement = () => new Image(),
): Promise<void> {
  const sources = [
    ...new Set(
      document.spaces.flatMap((s) =>
        s.objects.flatMap((o) =>
          o.type === "ImageMobject"
            ? [o.source]
            : o.type === "ImageSequence"
              ? o.sources
              : [],
        ),
      ),
    ),
  ];
  if (sources.length > 256)
    throw new Error("Scene exceeds 256 raster image resources");
  let pixels = 0;
  for (const source of sources) {
    const image = create();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        image.onload = null;
        image.onerror = null;
        image.src = "";
        reject(new Error("Image resource timed out"));
      }, 15000);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        image.onload = null;
        image.onerror = null;
        error ? reject(error) : resolve();
      };
      image.onload = () => finish();
      image.onerror = () =>
        finish(new Error("Unable to load raster image resource"));
      image.src = source;
    });
    pixels += image.naturalWidth * image.naturalHeight;
    if (pixels > 64_000_000)
      throw new Error("Decoded image resources exceed 64 million pixels");
  }
}
