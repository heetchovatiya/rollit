import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { InvoiceRow } from "./invoice-parser";
export async function readInvoicePdf(file: File): Promise<InvoiceRow[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    enableXfa: false,
  });
  try {
    const document = await task.promise;
    if (document.numPages > 20)
      throw new Error(
        "This bill has more than 20 pages. Attach it and enter the delivery manually.",
      );
    const rows: InvoiceRow[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const groups = new Map<number, { text: string; x: number }[]>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        const row = groups.get(y) || [];
        row.push({ text: item.str, x: item.transform[4] });
        groups.set(y, row);
      }
      for (const [, cells] of Array.from(groups.entries()).sort(
        (a, b) => b[0] - a[0],
      ))
        rows.push({ cells: cells.sort((a, b) => a.x - b.x) });
    }
    return rows;
  } finally {
    await task.destroy();
  }
}
