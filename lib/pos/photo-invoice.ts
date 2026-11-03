import type { ImportedLine } from "./invoice-parser";
export interface OCRWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
}
export function readTSV(tsv: string): OCRWord[] {
  return tsv
    .replace(/\t/g, "\t")
    .split(/\r?\n/)
    .slice(1)
    .flatMap((line) => {
      const c = line.split("\t");
      return c[0] === "5" &&
        c.length >= 12 &&
        c[11].trim() &&
        Number(c[10]) >= 0
        ? [
            {
              text: c.slice(11).join("\t"),
              left: Number(c[6]),
              top: Number(c[7]),
              width: Number(c[8]),
              height: Number(c[9]),
            },
          ]
        : [];
    });
}
const numeric = (s: string) =>
  /^\d+(?:\.\d+)?$/.test(s.replace(/[,₹|\[\]]/g, ""))
    ? s.replace(/[,₹|\[\]]/g, "")
    : null;
export function parsePhotoInvoice(words: OCRWord[], text: string) {
  const grouped: { y: number; words: OCRWord[] }[] = [];
  for (const word of [...words].sort(
    (a, b) => a.top + a.height / 2 - (b.top + b.height / 2),
  )) {
    const y = word.top + word.height / 2;
    let row = grouped.find(
      (r) => Math.abs(r.y - y) < Math.max(8, word.height * 0.6),
    );
    if (!row) {
      row = { y, words: [] };
      grouped.push(row);
    }
    row.words.push(word);
  }
  grouped.sort((a, b) => a.y - b.y);
  for (const row of grouped) row.words.sort((a, b) => a.left - b.left);
  const quantityWord = words.find((w) => /^qty\.?$/i.test(w.text));
  const priceWord = quantityWord
    ? words.find(
        (w) =>
          /^price$/i.test(w.text) &&
          Math.abs(w.top - quantityWord.top) < 50 &&
          w.left > quantityWord.left,
      )
    : undefined;
  const header =
    quantityWord && priceWord
      ? {
          y: quantityWord.top + quantityWord.height / 2,
          words: [
            quantityWord,
            priceWord,
            ...words.filter(
              (w) =>
                /^uom$/i.test(w.text) &&
                Math.abs(w.top - quantityWord.top) < 50,
            ),
          ],
        }
      : undefined;
  const items: ImportedLine[] = [];
  if (header) {
    const qty = header.words.find((w) => /^qty\.?$/i.test(w.text))!;
    const price = header.words.find((w) => /^price$/i.test(w.text))!;
    const uom = header.words.find((w) => /^uom$/i.test(w.text));
    const qx = qty.left + qty.width / 2,
      rx = price.left + price.width / 2,
      split = (qx + rx) / 2,
      right = uom ? (rx + uom.left + uom.width / 2) / 2 : rx + (rx - qx) / 2;
    const end =
      grouped.find(
        (r) =>
          r.y > header.y &&
          /other charges|amount chargeable/i.test(
            r.words.map((w) => w.text).join(" "),
          ),
      )?.y || Infinity;
    const quantities = words
      .filter(
        (w) =>
          w.top > header.y &&
          w.top < end &&
          w.left + w.width / 2 > qty.left - qty.width &&
          w.left + w.width / 2 < split &&
          numeric(w.text) !== null,
      )
      .sort((a, b) => a.top - b.top);
    for (let i = 0; i < quantities.length; i++) {
      const q = quantities[i],
        y = q.top + q.height / 2;
      const rate = words
        .filter(
          (w) =>
            Math.abs(w.top + w.height / 2 - y) < 27 &&
            w.left + w.width / 2 >= split &&
            w.left + w.width / 2 < right &&
            numeric(w.text) !== null,
        )
        .sort(
          (a, b) =>
            Math.abs(a.top + a.height / 2 - y) -
            Math.abs(b.top + b.height / 2 - y),
        )[0];
      if (!rate) continue;
      const top = i
          ? (quantities[i - 1].top + quantities[i - 1].height / 2 + y) / 2
          : header.y + 15,
        bottom =
          i < quantities.length - 1
            ? (quantities[i + 1].top + quantities[i + 1].height / 2 + y) / 2
            : end;
      const candidates = grouped
        .filter((r) => r.y > top && r.y < bottom)
        .flatMap((r) => r.words)
        .filter((w) => w.left + w.width / 2 < qty.left - qty.width);
      const nameLeft = Math.min(
        ...candidates.filter((w) => /[A-Za-z]/.test(w.text)).map((w) => w.left),
      );
      const description = candidates
        .filter((w) => w.left >= nameLeft - 4)
        .map((w) => w.text)
        .join(" ")
        .trim();
      if (!description || !/[a-z]/i.test(description)) continue;
      items.push({
        description,
        qty: numeric(q.text)!,
        unitCost: numeric(rate.text)!,
      });
      if (items.length >= 100) break;
    }
  }
  const invoice =
    text.match(/Invoice\s+numbers?\s*[:\-]?\s*([A-Z0-9]+-[0-9]{7,})/i)?.[1] ||
    "";
  const dateMatch = text.match(
    /Invoice\s+date\s*[:\-]?\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})/i,
  );
  let date = "";
  if (dateMatch) {
    const m = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].indexOf(dateMatch[2].slice(0, 3).toLowerCase());
    if (m >= 0)
      date = `${dateMatch[3]}-${String(m + 1).padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
  }
  const summary = grouped
    .filter((r) => /^total\s/i.test(r.words.map((w) => w.text).join(" ")))
    .at(-1);
  const totals =
    summary?.words
      .map((w) => numeric(w.text))
      .filter((n): n is string => n !== null) || [];
  const fees = grouped
    .filter((r) =>
      /delivery charge|transaction charge/i.test(
        r.words.map((w) => w.text).join(" "),
      ),
    )
    .reduce((sum, r) => {
      const values = r.words
        .map((w) => numeric(w.text))
        .filter((n): n is string => n !== null);
      return sum + (values.length >= 3 ? Number(values[2]) : 0);
    }, 0);
  return {
    items,
    invoice,
    date,
    fees: fees ? fees.toFixed(2) : "",
    tax: totals.length >= 3 ? totals.at(-2)! : "",
    invoiceTotal: totals.length >= 1 ? totals.at(-1)! : "",
    text,
  };
}
