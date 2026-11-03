/** Remove long receipt table rules from a thresholded copy; the original bill is never changed. */
export function cleanReceiptPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < pixels.length; i++) {
    const p = i * 4;
    pixels[i] =
      rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114 < 155
        ? 0
        : 255;
  }
  const mask = new Uint8Array(pixels.length);
  function mark(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const a = x + dx,
          b = y + dy;
        if (a >= 0 && a < width && b >= 0 && b < height)
          mask[b * width + a] = 1;
      }
  }
  for (let y = 0; y < height; y++) {
    let start = 0;
    for (let x = 0; x <= width; x++)
      if (x === width || pixels[y * width + x] !== 0) {
        if (x - start >= 80) for (let a = start; a < x; a++) mark(a, y);
        start = x + 1;
      }
  }
  for (let x = 0; x < width; x++) {
    let start = 0;
    for (let y = 0; y <= height; y++)
      if (y === height || pixels[y * width + x] !== 0) {
        if (y - start >= 50) for (let a = start; a < y; a++) mark(x, a);
        start = y + 1;
      }
  }
  for (let i = 0; i < pixels.length; i++) {
    const value = mask[i] ? 255 : pixels[i];
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = value;
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
export function receiptBounds(
  words: { text: string; left: number; top: number }[],
  width: number,
  height: number,
) {
  const qty = words.find((w) => /^qty\.?$/i.test(w.text));
  const logo = words
    .filter((w) => /^hyperpure$/i.test(w.text))
    .sort((a, b) => a.top - b.top)[0];
  if (!qty) return { left: 0, top: 0, width, height };
  const left = Math.max(
    0,
    Math.round(logo ? logo.left - width * 0.02 : width * 0.08),
  );
  const top = Math.max(
    0,
    Math.round(logo ? logo.top - height * 0.018 : qty.top - height * 0.14),
  );
  const bottom = Math.min(height, Math.round(qty.top + height * 0.16));
  return { left, top, width: width - left, height: bottom - top };
}
