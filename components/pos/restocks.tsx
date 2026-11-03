"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Truck, FileText, X } from "lucide-react";
import type { Product, Restock, StoreState } from "@/lib/pos/types";
import { actionSchema, type StoreAction } from "@/lib/pos/validation";
import { money, dateTime, downloadCsv } from "@/lib/pos/format";
import { parseInvoiceRows } from "@/lib/pos/invoice-parser";
import { BillUpload, type UploadedBill } from "./bill-upload";
import { Dialog } from "./dialog";
type DraftLine = {
  key: string;
  description: string;
  productId: string;
  qty: string;
  unitCost: string;
};
const newLine = (): DraftLine => ({
  key: crypto.randomUUID(),
  description: "",
  productId: "",
  qty: "1",
  unitCost: "",
});
export function Restocks({
  products,
  restocks,
  onSave,
  busy,
  onRefresh,
  onIngredientBill,
}: {
  products: Product[];
  onIngredientBill?:()=>void;
  restocks: Restock[];
  onSave: (
    action: StoreAction,
  ) => Promise<{ state: StoreState | null; error?: string; status?: number }>;
  busy: boolean;
  onRefresh: () => Promise<StoreState | null>;
}) {
  const [tax, setTax] = useState("0"),
    [fees, setFees] = useState("0"),
    [invoiceTotal, setInvoiceTotal] = useState("");
  const [open, O] = useState(false),
    [source, S] = useState<"Manual" | "Hyperpure">("Manual"),
    [supplier, V] = useState(""),
    [invoice, I] = useState(""),
    [date, D] = useState(() => new Date().toLocaleDateString("en-CA")),
    [note, N] = useState(""),
    [lines, L] = useState<DraftLine[]>([]),
    [bill, B] = useState<UploadedBill | null>(null),
    [uploading, U] = useState(false),
    [error, E] = useState(""),
    [message, M] = useState(""),
    [detail, F] = useState<Restock | null>(null),
    [pending, P] = useState(false);
  const actionId = useRef(""),
    submitted = useRef<Extract<StoreAction, { type: "restock" }> | null>(null);
  const active = products.filter((p) => !p.archived&&!p.recipeEnabled);
  const locked = busy || uploading || pending;
  function start(mode: "Manual" | "Hyperpure") {
    setTax("0");
    setFees("0");
    setInvoiceTotal("");
    S(mode);
    V(mode === "Hyperpure" ? "Hyperpure" : "");
    I("");
    D(new Date().toLocaleDateString("en-CA"));
    N("");
    L([newLine()]);
    B(null);
    E("");
    M("");
    P(false);
    submitted.current = null;
    actionId.current = crypto.randomUUID();
    O(true);
  }
  function update(key: string, patch: Partial<DraftLine>) {
    L((old) => old.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  async function extract(file: File) {
    if (source !== "Hyperpure") return;
    try {
      let imported;
      if (
        file.name.toLowerCase().endsWith(".pdf") ||
        file.type === "application/pdf"
      ) {
        const { readInvoicePdf } = await import("@/lib/pos/pdf-reader");
        imported = parseInvoiceRows(await readInvoicePdf(file));
      } else {
        const { readInvoiceImage } = await import("@/lib/pos/image-reader");
        const result = await readInvoiceImage(file, M);
        imported = result.items;
        I(result.invoice);
        D(result.date);
        if (result.tax) setTax(result.tax);
        if (result.fees) setFees(result.fees);
        if (result.invoiceTotal) setInvoiceTotal(result.invoiceTotal);
      }
      if (!imported.length) {
        M(
          "Bill attached. No reliable quantity table was found. Keep the attachment and enter the items below manually.",
        );
        return;
      }
      L(
        imported.map((line) => {
          const normalized = line.description
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          const match = active.find(
            (p) =>
              p.name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized ||
              p.sku.toLowerCase() === line.description.toLowerCase(),
          );
          return {
            key: crypto.randomUUID(),
            description: line.description,
            productId: match?.id || "",
            qty: line.qty,
            unitCost: line.unitCost,
          };
        }),
      );
      M(
        `${imported.length} draft lines extracted. Map every line to a product and verify quantities, pack sizes and unit costs. Stock has not changed.`,
      );
    } catch (error) {
      M(
        "Bill attached. " +
          (error instanceof Error
            ? error.message
            : "Unable to extract this bill. Enter its items manually."),
      );
    }
  }
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("roll-it-pending-restock");
      if (!raw) return;
      const parsed = actionSchema.safeParse(JSON.parse(raw));
      if (!parsed.success || parsed.data.type !== "restock") return;
      const a = parsed.data;
      submitted.current = a;
      actionId.current = a.id;
      setTax(String((a.tax || 0) / 100));
      setFees(String((a.fees || 0) / 100));
      setInvoiceTotal(
        a.invoiceTotal === undefined ? "" : String(a.invoiceTotal / 100),
      );
      S(a.source);
      V(a.supplier);
      I(a.invoiceNumber);
      D(a.invoiceDate);
      N(a.note);
      L(
        a.items.map((i) => ({
          key: crypto.randomUUID(),
          description: "",
          productId: i.productId,
          qty: String(i.qty),
          unitCost: String(i.unitCost / 100),
        })),
      );
      if (a.billId)
        B({
          id: a.billId,
          name: "Previously uploaded bill",
          size: 0,
          type: "application/pdf",
          driveStatus: "not-connected",
        });
      P(true);
      O(true);
      M(
        "An unconfirmed delivery was recovered. Check history or retry the same restock safely.",
      );
    } catch {}
  }, []);
  async function submit() {
    E("");
    let action = submitted.current;
    if (!action) {
      const parsed = actionSchema.safeParse({
        type: "restock",
        tax: Math.round(Number(tax) * 100),
        fees: Math.round(Number(fees) * 100),
        invoiceTotal: invoiceTotal.trim()
          ? Math.round(Number(invoiceTotal) * 100)
          : undefined,
        id: actionId.current,
        source,
        supplier,
        invoiceNumber: invoice,
        invoiceDate: date,
        note,
        billId: bill?.id,
        items: lines.map((l) => ({
          productId: l.productId,
          qty: l.qty.trim() ? Number(l.qty) : NaN,
          unitCost: l.unitCost.trim()
            ? Math.round(Number(l.unitCost) * 100)
            : NaN,
        })),
      });
      if (!parsed.success) {
        E(
          "Check each product, whole-unit quantity, unit cost, supplier and date. " +
            parsed.error.issues[0].message,
        );
        return;
      }
      if (parsed.data.type !== "restock") return;
      action = parsed.data;
      if (source === "Hyperpure" && !bill) {
        E("Upload the Hyperpure bill before saving.");
        return;
      }
      submitted.current = action;
    }
    P(true);
    try {
      sessionStorage.setItem("roll-it-pending-restock", JSON.stringify(action));
    } catch {}
    const result = await onSave(action);
    if (result.state) {
      O(false);
      P(false);
      submitted.current = null;
      try {
        sessionStorage.removeItem("roll-it-pending-restock");
      } catch {}
    } else if ([400, 409, 413, 415].includes(result.status || 0)) {
      P(false);
      submitted.current = null;
      try {
        sessionStorage.removeItem("roll-it-pending-restock");
      } catch {}
      E(result.error || "Review the delivery details.");
    } else
      E(
        result.error ||
          "Restock was not confirmed. Retry the same delivery to check or safely record it once. Your draft is locked to prevent a duplicate entry.",
      );
  }
  const total = lines.reduce(
    (n, l) =>
      n + (Number(l.qty) || 0) * Math.round((Number(l.unitCost) || 0) * 100),
    0,
  );
  return (
    <>
      <section className="panel">
        <div className="sectionheading">
          <div>
            <h2>Restock inventory</h2>
            <p className="panel-description">
              Record a delivery manually or start from a Hyperpure bill.
            </p>
          </div>
          <div className="row-actions">
            <button disabled={busy} onClick={() => start("Manual")}>
              <Plus size={16} />
              Manual restock
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => onIngredientBill?onIngredientBill():start("Hyperpure")}
            >
              <FileText size={16} />
              Upload Hyperpure bill
            </button>
          </div>
        </div>
        <div className="restock-intro">
          <Truck size={24} />
          <div>
            <strong>Goods in, paperwork together.</strong>
            <p>
              Received units are added to current stock. Attach a bill to any
              delivery and keep it linked to every product and stock entry.
            </p>
          </div>
        </div>
        <div className="sectionheading">
          <h2>Recorded deliveries</h2>
          <button
            onClick={() =>
              downloadCsv("roll-it-restocks.csv", [
                [
                  "Delivery ID",
                  "Date",
                  "Supplier",
                  "Invoice",
                  "Product",
                  "Quantity",
                  "Unit cost",
                  "Line total",
                  "Bill attached",
                ],
                ...restocks.flatMap((r) =>
                  r.items.map((i) => [
                    r.id,
                    r.date,
                    r.supplier,
                    r.invoiceNumber,
                    i.productName,
                    i.qty,
                    i.unitCost / 100,
                    (i.qty * i.unitCost) / 100,
                    r.billId ? "Yes" : "No",
                  ]),
                ),
              ])
            }
          >
            Export CSV ↗
          </button>
        </div>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {[
                  "Date",
                  "Supplier",
                  "Invoice",
                  "Items",
                  "Goods cost",
                  "Bill",
                  "",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {restocks.map((r) => (
                <tr key={r.id}>
                  <td>{dateTime(r.date)}</td>
                  <td>
                    <strong>{r.supplier}</strong>
                    <small className="table-small">{r.source}</small>
                  </td>
                  <td>{r.invoiceNumber || "—"}</td>
                  <td>{r.items.reduce((n, i) => n + i.qty, 0)} units</td>
                  <td>{money(r.total)}</td>
                  <td>
                    {r.billId ? (
                      <a
                        href={"/api/bills/" + r.billId}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download ↗
                      </a>
                    ) : (
                      "No attachment"
                    )}
                  </td>
                  <td>
                    <button onClick={() => F(r)}>Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!restocks.length && (
          <div className="empty">
            <Truck size={35} />
            <h3>Your next delivery starts here.</h3>
            <p>Choose manual restock or upload a Hyperpure bill.</p>
          </div>
        )}
      </section>
      {open && (
        <Dialog
          label="Record restock"
          onClose={() => {
            if (!locked) O(false);
          }}
        >
          <form
            className="modal restock-modal"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="sectionheading">
              <h2>
                {source === "Manual"
                  ? "Manual restock"
                  : "Hyperpure bill restock"}
              </h2>
              <button
                type="button"
                aria-label="Close restock"
                disabled={locked}
                onClick={() => O(false)}
              >
                <X />
              </button>
            </div>
            <div className="fields">
              <label>
                Supplier
                <input
                  required
                  maxLength={120}
                  value={supplier}
                  disabled={locked}
                  onChange={(e) => V(e.target.value)}
                />
              </label>
              <label>
                Invoice number
                <input
                  maxLength={100}
                  value={invoice}
                  disabled={locked}
                  onChange={(e) => I(e.target.value)}
                />
              </label>
              <label>
                Invoice date
                <input
                  type="date"
                  required
                  value={date}
                  disabled={locked}
                  onInput={(e) => D(e.currentTarget.value)}
                />
              </label>
            </div>
            <BillUpload
              value={bill}
              onChange={B}
              disabled={locked}
              onBusy={U}
              onFile={extract}
            />
            {message && (
              <div className="import-message" role="status">
                {message}
              </div>
            )}
            <div className="delivery-lines">
              <div className="sectionheading">
                <h2>Review delivery items</h2>
                <button
                  type="button"
                  disabled={locked || lines.length >= 100}
                  onClick={() => L((old) => [...old, newLine()])}
                >
                  <Plus size={15} />
                  Add line
                </button>
              </div>
              <p className="panel-description">
                Use your product’s stock unit. Convert bill weights or packs
                yourself; decimal quantities must be converted to whole
                inventory units. Unit cost updates the product’s latest cost.
                Check the separate tax and delivery-charge fields against the
                printed bill.
              </p>
              {lines.map((line, index) => (
                <div className="delivery-line" key={line.key}>
                  {line.description && (
                    <p className="bill-description">Bill: {line.description}</p>
                  )}
                  <label>
                    Product {index + 1}
                    <select
                      required
                      disabled={locked}
                      value={line.productId}
                      onChange={(e) => {
                        const p = active.find((p) => p.id === e.target.value);
                        update(line.key, {
                          productId: e.target.value,
                          unitCost:
                            line.unitCost || (p ? String(p.cost / 100) : ""),
                        });
                      }}
                    >
                      <option value="">Select inventory product…</option>
                      {active.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.sku}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Units received
                    <input
                      required
                      type="number"
                      min="1"
                      max="9999999"
                      step="1"
                      disabled={locked}
                      value={line.qty}
                      onChange={(e) =>
                        update(line.key, { qty: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Cost per unit (₹)
                    <input
                      required
                      type="number"
                      min="0"
                      max="9999999.99"
                      step="0.01"
                      disabled={locked}
                      value={line.unitCost}
                      onChange={(e) =>
                        update(line.key, { unitCost: e.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    aria-label={"Remove delivery line " + (index + 1)}
                    disabled={locked || lines.length === 1}
                    onClick={() =>
                      L((old) => old.filter((l) => l.key !== line.key))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {!active.length && (
              <p className="upload-error">
                Create inventory products before recording a delivery.
              </p>
            )}
            <label className="adjustment-note">
              Delivery note
              <input
                maxLength={240}
                value={note}
                disabled={locked}
                onChange={(e) => N(e.target.value)}
                placeholder="Optional delivery or stock note"
              />
            </label>
            <div className="settings-fields">
              <label>
                Tax total (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={tax}
                  disabled={locked}
                  onChange={(e) => setTax(e.target.value)}
                />
              </label>
              <label>
                Delivery / transaction charges before tax (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={fees}
                  disabled={locked}
                  onChange={(e) => setFees(e.target.value)}
                />
              </label>
              <label>
                Full bill total (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoiceTotal}
                  disabled={locked}
                  placeholder={String(
                    (total +
                      Math.round(Number(tax) * 100) +
                      Math.round(Number(fees) * 100)) /
                      100,
                  )}
                  onChange={(e) => setInvoiceTotal(e.target.value)}
                />
              </label>
            </div>
            <p className="panel-description">
              Verify the printed bill's totals. Tax and charges are tracked
              separately and never create stock items.
            </p>
            {invoiceTotal &&
              Math.round(Number(invoiceTotal) * 100) !==
                total +
                  Math.round(Number(tax) * 100) +
                  Math.round(Number(fees) * 100) && (
                <p className="upload-error">
                  The entered bill total differs from goods + tax + charges.
                  Check discounts, rounding and missing lines before confirming.
                </p>
              )}
            <div className="metric">
              <span>Goods cost from reviewed lines</span>
              <strong>{money(total)}</strong>
            </div>
            {error && (
              <p className="upload-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="primary pay"
              disabled={busy || uploading || !active.length}
            >
              {busy
                ? "Recording delivery…"
                : pending
                  ? "Retry same restock"
                  : "Confirm restock & add units"}
            </button>
            {pending && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const state = await onRefresh();
                  if (
                    state?.restocks.some((r) => r.id === submitted.current?.id)
                  ) {
                    O(false);
                    P(false);
                    submitted.current = null;
                    try {
                      sessionStorage.removeItem("roll-it-pending-restock");
                    } catch {}
                  } else
                    E(
                      "This delivery has not been confirmed yet. Retry the same restock to resolve it safely.",
                    );
                }}
              >
                Check delivery status
              </button>
            )}
          </form>
        </Dialog>
      )}
      {detail && (
        <Dialog label="Delivery details" onClose={() => F(null)}>
          <div className="modal">
            <div className="sectionheading">
              <h2>{detail.supplier} delivery</h2>
              <button
                aria-label="Close delivery details"
                onClick={() => F(null)}
              >
                <X />
              </button>
            </div>
            <p className="panel-description">
              {detail.invoiceNumber || "No invoice number"} ·{" "}
              {detail.invoiceDate} · {detail.source}
            </p>
            {detail.items.map((i) => (
              <div className="metric" key={i.productId}>
                <span>
                  {i.productName}
                  <small>
                    {i.qty} units × {money(i.unitCost)}
                  </small>
                </span>
                <strong>{money(i.qty * i.unitCost)}</strong>
              </div>
            ))}
            <div className="metric">
              <span>Goods cost</span>
              <strong>{money(detail.total)}</strong>
            </div>
            <div className="metric">
              <span>Tax</span>
              <strong>{money(detail.tax || 0)}</strong>
            </div>
            <div className="metric">
              <span>Charges before tax</span>
              <strong>{money(detail.fees || 0)}</strong>
            </div>
            <div className="metric">
              <strong>Invoice total</strong>
              <strong>{money(detail.invoiceTotal ?? detail.total)}</strong>
            </div>
            <p className="panel-description">{detail.note}</p>
            {detail.billId && (
              <a
                className="bill-link"
                href={"/api/bills/" + detail.billId}
                target="_blank"
                rel="noreferrer"
              >
                Download attached bill ↗
              </a>
            )}
            <p className="drive-placeholder">
              Google Drive: not connected. Original bill is in private app
              storage.
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
