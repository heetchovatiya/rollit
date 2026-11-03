import { parsePhotoInvoice, readTSV } from "./photo-invoice";
import { cleanReceiptPixels, receiptBounds } from "./ocr-preprocess";
export async function readInvoiceImage(
  file: File,
  onProgress: (message: string) => void,
) {
  const { createWorker } = await import("tesseract.js");
  const base = new URL("/ocr/", window.location.origin).href;
  onProgress("Loading private image reader…");
  const worker = await createWorker("eng", 1, {
    workerPath: base + "worker.min.js",
    corePath: base,
    langPath: base,
    gzip: true,
    workerBlobURL: false,
    logger: (m) => onProgress(`${m.status} · ${Math.round(m.progress * 100)}%`),
  });
  try {
    const first = await worker.recognize(file, {}, { tsv: true, text: true });
    const words = readTSV(first.data.tsv || "");
    let parsed = parsePhotoInvoice(words, first.data.text);
    const bitmap = await createImageBitmap(file);
    try {
      if (bitmap.width * bitmap.height > 20000000) return parsed;
      const bounds = receiptBounds(words, bitmap.width, bitmap.height),
        canvas = document.createElement("canvas");
      canvas.width = bounds.width;
      canvas.height = bounds.height;
      const context = canvas.getContext("2d");
      if (!context) return parsed;
      context.drawImage(
        bitmap,
        bounds.left,
        bounds.top,
        bounds.width,
        bounds.height,
        0,
        0,
        bounds.width,
        bounds.height,
      );
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      cleanReceiptPixels(image.data, canvas.width, canvas.height);
      context.putImageData(image, 0, 0);
      onProgress("Reading item columns and totals…");
      const second = await worker.recognize(
        canvas,
        {},
        { tsv: true, text: true },
      );
      const cleaned = parsePhotoInvoice(
        readTSV(second.data.tsv || ""),
        second.data.text,
      );
      if (cleaned.items.length >= parsed.items.length)
        parsed = {
          ...cleaned,
          invoice: cleaned.invoice || parsed.invoice,
          date: cleaned.date || parsed.date,
        };
    } finally {
      bitmap.close();
    }
    return parsed;
  } finally {
    await worker.terminate();
  }
}
