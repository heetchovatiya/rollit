"use client";
import { useState } from "react";
import { Plus, FileText, X, Search } from "lucide-react";
import type { TrackedBill, StoreState } from "@/lib/pos/types";
import { actionSchema, type StoreAction } from "@/lib/pos/validation";
import { money, downloadCsv } from "@/lib/pos/format";
import { dayKey } from "@/lib/pos/analytics";
import { BillUpload, type UploadedBill } from "./bill-upload";
import { Dialog } from "./dialog";
export function BillsPanel({
  bills,
  busy,
  onSave,
}: {
  bills: TrackedBill[];
  busy: boolean;
  onSave: (
    action: StoreAction,
  ) => Promise<{ state: StoreState | null; error?: string; status?: number }>;
}) {
  const [edit, E] = useState<TrackedBill | null>(null),
    [attachment, A] = useState<UploadedBill | null>(null),
    [uploading, U] = useState(false),
    [error, F] = useState(""),
    [query, Q] = useState(""),
    [category, C] = useState("All categories"),
    [archived, H] = useState(false),
    [from, D] = useState(""),
    [to, T] = useState("");
  const rows = bills.filter(
    (b) =>
      b.archived === archived &&
      `${b.title} ${b.description} ${b.category}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (category === "All categories" || b.category === category) &&
      (!from || b.date >= from) &&
      (!to || b.date <= to),
  );
  function open(b?: TrackedBill) {
    E(
      b
        ? { ...b }
        : {
            id: crypto.randomUUID(),
            title: "",
            description: "",
            category: "Ingredients",
            amount: 0,
            date: dayKey(new Date()),
            createdAt: "",
            revision: 0,
            archived: false,
          },
    );
    A(
      b?.billId
        ? {
            id: b.billId,
            name: "Saved bill attachment",
            type: b.attachmentType || "",
            size: 0,
            driveStatus: "not-connected",
          }
        : null,
    );
    F("");
  }
  async function save() {
    if (!edit) return;
    const parsed = actionSchema.safeParse({
      type: "trackedBill",
      id: edit.id,
      originalRevision: edit.createdAt ? edit.revision : undefined,
      bill: {
        title: edit.title,
        description: edit.description,
        category: edit.category,
        amount: edit.amount,
        date: edit.date,
        billId: attachment?.id,
        attachmentType: attachment?.type || undefined,
      },
    });
    if (!parsed.success) {
      F(parsed.error.issues[0].message);
      return;
    }
    const result = await onSave(parsed.data);
    if (result.state) E(null);
    else
      F(
        result.error ||
          "Could not confirm this bill. Retry the same form safely.",
      );
  }
  return (
    <>
      <section className="panel">
        <div className="sectionheading">
          <div>
            <h2>All your bills, together</h2>
            <p className="panel-description">
              Track purchases, gas, packaging, repairs and other costs with
              their original receipt.
            </p>
          </div>
          <button className="primary" disabled={busy} onClick={() => open()}>
            <Plus size={17} />
            Add bill
          </button>
        </div>
        <div className="analytics-metrics bill-summary">
          <div className="analytics-metric">
            <span>
              {archived ? "Archived" : "Active"} bills matching filters
            </span>
            <strong>{rows.length}</strong>
          </div>
          <div className="analytics-metric">
            <span>Total bill amount</span>
            <strong>{money(rows.reduce((n, b) => n + b.amount, 0))}</strong>
          </div>
        </div>
        <div className="search">
          <Search size={17} />
          <input
            aria-label="Search bills"
            placeholder="Search title, category or description…"
            value={query}
            onChange={(e) => Q(e.target.value)}
          />
        </div>
        <div className="filter-row">
          <label>
            Category
            <select value={category} onChange={(e) => C(e.target.value)}>
              {["All categories", ...new Set(bills.map((b) => b.category))].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </label>
          <label>
            From
            <input
              aria-label="Bills from date"
              type="date"
              value={from}
              onInput={(e) => D(e.currentTarget.value)}
            />
          </label>
          <label>
            To
            <input
              aria-label="Bills to date"
              type="date"
              value={to}
              onInput={(e) => T(e.currentTarget.value)}
            />
          </label>
          <button
            onClick={() => {
              Q("");
              C("All categories");
              D("");
              T("");
            }}
          >
            Clear filters
          </button>
          <button onClick={() => H(!archived)}>
            {archived ? "Show active" : "Show archived"}
          </button>
          <button
            onClick={() =>
              downloadCsv("roll-it-bills.csv", [
                [
                  "Date",
                  "Title",
                  "Category",
                  "Description",
                  "Amount",
                  "Attachment ID",
                ],
                ...rows.map((b) => [
                  b.date,
                  b.title,
                  b.category,
                  b.description,
                  b.amount / 100,
                  b.billId || "",
                ]),
              ])
            }
          >
            Export CSV ↗
          </button>
        </div>
        <div className="tracked-bills">
          {rows.map((b) => (
            <article className="tracked-bill" key={b.id}>
              {b.billId && b.attachmentType?.startsWith("image/") ? (
                <a
                  href={"/api/bills/" + b.billId}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    className="bill-thumbnail"
                    src={"/api/bills/" + b.billId + "?preview=1"}
                    alt={b.title + " receipt"}
                  />
                </a>
              ) : (
                <div className="tracked-bill-icon">
                  <FileText size={24} />
                </div>
              )}
              <div>
                <span className="badge">{b.category}</span>
                <h3>{b.title}</h3>
                <p>{b.description || "No description"}</p>
                <small>{b.date}</small>
              </div>
              <div className="bill-card-actions">
                <strong>{money(b.amount)}</strong>
                {b.billId && (
                  <a
                    href={"/api/bills/" + b.billId}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View / download bill ↗
                  </a>
                )}
                <div className="row-actions">
                  {!b.archived && (
                    <button disabled={busy} onClick={() => open(b)}>
                      Edit
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={async () => {
                      const r = await onSave({
                        type: "archiveBill",
                        id: b.id,
                        originalRevision: b.revision,
                        archived: !b.archived,
                      });
                      if (!r.state) F(r.error || "Could not update the bill.");
                    }}
                  >
                    {b.archived ? "Restore" : "Archive"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
        {!rows.length && (
          <div className="empty">
            <FileText size={35} />
            <h3>No bills here yet.</h3>
            <p>
              Add a title, amount, category and an optional receipt image or
              PDF.
            </p>
          </div>
        )}
        {!edit && error && (
          <p className="upload-error" role="alert">
            {error}
          </p>
        )}
        <p className="analytics-footnote">
          Amounts are the full bill totals you enter, including applicable tax
          and charges. Tracked bills do not change stock and are not
          automatically deducted from gross profit.
        </p>
      </section>
      {edit && (
        <Dialog
          label="Track a bill"
          onClose={() => {
            if (!busy && !uploading) E(null);
          }}
        >
          <form
            className="modal"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="sectionheading">
              <h2>{edit.createdAt ? "Edit bill" : "Add bill"}</h2>
              <button
                type="button"
                aria-label="Close bill form"
                disabled={busy || uploading}
                onClick={() => E(null)}
              >
                <X />
              </button>
            </div>
            <div className="settings-fields">
              <label>
                Title
                <input
                  required
                  maxLength={120}
                  disabled={busy}
                  value={edit.title}
                  onChange={(e) => E({ ...edit, title: e.target.value })}
                  placeholder="e.g. Gas refill or Hyperpure purchase"
                />
              </label>
              <label>
                Category
                <input
                  required
                  aria-label="Bill category"
                  list="bill-categories"
                  maxLength={80}
                  disabled={busy}
                  value={edit.category}
                  onChange={(e) => E({ ...edit, category: e.target.value })}
                />
                <datalist id="bill-categories">
                  {[
                    "Ingredients",
                    "Packaging",
                    "Gas / fuel",
                    "Rent",
                    "Equipment",
                    "Repairs",
                    "Utilities",
                    "Transport",
                    "Other",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </datalist>
              </label>
              <label>
                Amount (₹)
                <input
                  type="number"
                  required
                  min="0"
                  max="9999999.99"
                  step="0.01"
                  disabled={busy}
                  value={edit.amount / 100}
                  onChange={(e) =>
                    E({
                      ...edit,
                      amount: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
              <label>
                Bill date
                <input
                  type="date"
                  required
                  disabled={busy}
                  value={edit.date}
                  onInput={(e) => E({ ...edit, date: e.currentTarget.value })}
                />
              </label>
              <label className="full-field">
                Description
                <textarea
                  maxLength={1000}
                  rows={3}
                  disabled={busy}
                  value={edit.description}
                  onChange={(e) => E({ ...edit, description: e.target.value })}
                  placeholder="Supplier, invoice number, purpose or any notes"
                />
              </label>
            </div>
            <BillUpload
              value={attachment}
              onChange={A}
              disabled={busy}
              onBusy={U}
            />
            {error && (
              <p className="upload-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary pay" disabled={busy || uploading}>
              {busy ? "Saving…" : "Save bill"}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
