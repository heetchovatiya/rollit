export interface InvoiceCell {
  text: string;
  x: number;
}
export interface InvoiceRow {
  cells: InvoiceCell[];
}
export interface ImportedLine {
  description: string;
  qty: string;
  unitCost: string;
}
const number = (text: string) => {
  const s = text.replace(/[₹,]/g, "").trim();
  return /^\d+(?:\.\d+)?$/.test(s) ? Number(s) : null;
};
/** Conservative table extraction: quantities come only from an explicit quantity column. */
export function parseInvoiceRows(rows: InvoiceRow[]): ImportedLine[] {
  let quantityX: number | undefined, rateX: number | undefined;
  const results: ImportedLine[] = [];
  for (const row of rows) {
    const cells = row.cells
      .filter((c) => c.text.trim())
      .sort((a, b) => a.x - b.x);
    if (cells.some((c) => /other charges|amount chargeable/i.test(c.text)))
      break;
    const quantity = cells.find((c) =>
      /^(?:qty\.?|quantity|delivered qty|received qty)$/i.test(c.text.trim()),
    );
    if (quantity) {
      quantityX = quantity.x;
      rateX = cells.find((c) =>
        /^(?:rate|unit price|unit rate|price|basic rate)$/i.test(c.text.trim()),
      )?.x;
      continue;
    }
    if (quantityX === undefined) continue;
    const qtyCell = cells.find(
      (c) => Math.abs(c.x - quantityX!) <= 24 && number(c.text) !== null,
    );
    if (!qtyCell) continue;
    const qty = number(qtyCell.text);
    if (qty === null || qty <= 0) continue;
    const description = cells
      .filter((c) => c.x < quantityX! - 28)
      .map((c) => c.text.trim())
      .join(" ")
      .replace(/^\d+\s+/, "")
      .trim();
    if (
      !description ||
      !/[a-z]/i.test(description) ||
      /^(?:sub\s*total|grand total|total|cgst|sgst|igst|tax|round off|shipping|delivery charge|transaction charge|discount)\b/i.test(
        description,
      )
    )
      continue;
    const rateCell =
      rateX === undefined
        ? undefined
        : cells.find(
            (c) => Math.abs(c.x - rateX!) <= 24 && number(c.text) !== null,
          );
    results.push({
      description,
      qty: String(qty),
      unitCost: rateCell ? String(number(rateCell.text)) : "",
    });
    if (results.length === 100) break;
  }
  return results;
}
