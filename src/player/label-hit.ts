const contains = (r: DOMRect, x: number, y: number) =>
  r.width > 0 &&
  r.height > 0 &&
  x >= r.left &&
  x <= r.right &&
  y >= r.top &&
  y <= r.bottom;

/** Labels are overlays: only their rendered content should mask scene picking. */
export function pickLabel(
  labels: HTMLElement,
  x: number,
  y: number,
): string | null {
  for (const label of [...labels.children].reverse() as HTMLElement[]) {
    if (!contains(label.getBoundingClientRect(), x, y)) continue;
    if (label.dataset.source !== undefined) {
      // Preserve native hit testing of affine image rectangles, including rotation.
      if (label.contains(labels.ownerDocument.elementFromPoint(x, y)))
        return label.dataset.object ?? null;
      continue;
    }
    const walker = labels.ownerDocument.createTreeWalker(
      label,
      NodeFilter.SHOW_TEXT,
    );
    const range = labels.ownerDocument.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // KaTeX's accessible MathML duplicates the visible HTML and has hidden boxes.
      if (node.parentElement?.closest(".katex-mathml")) continue;
      for (const run of (node.textContent ?? "").matchAll(/\S+/gu)) {
        range.setStart(node, run.index!);
        range.setEnd(node, run.index! + run[0].length);
        if ([...range.getClientRects()].some((r) => contains(r, x, y)))
          return label.dataset.object ?? null;
      }
    }
    // Fraction rules and stretchy math symbols contain no text nodes.
    for (const element of label.querySelectorAll(
      ".frac-line, .overline-line, .underline-line, .sqrt > .vlist-t svg, .stretchy svg",
    )) {
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement!.getBoundingClientRect();
      if (contains(rect, x, y) && contains(parent, x, y))
        return label.dataset.object ?? null;
    }
  }
  return null;
}
