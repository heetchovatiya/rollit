"use client";
import { useState } from "react";
import { Search, Receipt } from "lucide-react";
import { money, dateTime, downloadCsv } from "@/lib/pos/format";
import type { Sale } from "@/lib/pos/types";
export function SalesHistory({
  sales,
  onReceipt,
  onReturn,
  busy,
}: {
  sales: Sale[];
  onReceipt: (sale: Sale) => void;
  onReturn: (sale: Sale) => void;
  busy: boolean;
}) {
  const [query, Q] = useState(""),
    [from, F] = useState(""),
    [to, T] = useState(""),
    [status, S] = useState("All sales"),
    [page, P] = useState(0);
  const rows = sales.filter(
    (s) =>
      `${s.id} ${s.customer} ${s.payment} ${s.orderType || ""} ${s.orderReference || ""} ${s.notes || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!from || localDay(s.date) >= from) &&
      (!to || localDay(s.date) <= to) &&
      (status === "All sales" ||
        (status === "Returned" ? !!s.returnedAt : !s.returnedAt)),
  );
  const lastPage = Math.max(0, Math.ceil(rows.length / 25) - 1),
    currentPage = Math.min(page, lastPage);
  function exportSales() {
    downloadCsv("roll-it-sales.csv", [
      [
        "Sale ID",
        "Date",
        "Customer",
        "Payment",
        "Status",
        "SKU/Product ID",
        "Product",
        "Quantity",
        "Unit price",
        "Line total",
        "Sale total",
        "Returned at",
        "Return reason",
        "Order type",
        "Token / table",
        "Kitchen note",
      ],
      ...rows.flatMap((s) =>
        s.items.map((i) => [
          s.id,
          s.date,
          s.customer,
          s.payment,
          s.returnedAt ? "Returned" : "Completed",
          i.id,
          i.name,
          i.qty,
          i.price / 100,
          (i.qty * i.price) / 100,
          s.total / 100,
          s.returnedAt || "",
          s.returnReason || "",
          s.orderType || "Takeaway",
          s.orderReference || "",
          s.notes || "",
        ]),
      ),
    ]);
  }
  return (
    <section className="panel">
      <div className="sectionheading">
        <h2>Sales history</h2>
        <button onClick={exportSales}>Export CSV ↗</button>
      </div>
      <div className="search">
        <Search size={18} />
        <input
          aria-label="Search sales"
          placeholder="Search receipt, customer, token or payment…"
          value={query}
          onChange={(e) => {
            Q(e.target.value);
            P(0);
          }}
        />
      </div>
      <div className="filter-row">
        <label>
          From
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              F(e.target.value);
              P(0);
            }}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              T(e.target.value);
              P(0);
            }}
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              S(e.target.value);
              P(0);
            }}
          >
            {["All sales", "Completed", "Returned"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            Q("");
            F("");
            T("");
            S("All sales");
            P(0);
          }}
        >
          Clear filters
        </button>
      </div>
      <div className="sales-summary">
        <span>{rows.length} matching sales</span>
        <strong>
          {money(
            rows.filter((s) => !s.returnedAt).reduce((n, s) => n + s.total, 0),
          )}{" "}
          after returns
        </strong>
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {[
                "Receipt",
                "Date",
                "Customer",
                "Payment",
                "Status",
                "Total",
                "Actions",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentPage * 25, currentPage * 25 + 25).map((s) => (
              <tr key={s.id}>
                <td>#{s.id.slice(0, 8)}</td>
                <td>{dateTime(s.date)}</td>
                <td>
                  {s.customer}
                  <small className="table-small">
                    {s.orderType || "Takeaway"}
                    {s.orderReference ? " · " + s.orderReference : ""}
                  </small>
                </td>
                <td>{s.payment}</td>
                <td>
                  <span className={"badge " + (s.returnedAt ? "warn" : "")}>
                    {s.returnedAt ? "Returned" : "Completed"}
                  </span>
                </td>
                <td>
                  <strong>{money(s.total)}</strong>
                </td>
                <td>
                  <div className="row-actions">
                    <button onClick={() => onReceipt(s)}>Receipt</button>
                    {!s.returnedAt && (
                      <button disabled={busy} onClick={() => onReturn(s)}>
                        Return sale
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="empty">
          <Receipt size={36} />
          <h3>
            {sales.length
              ? "No matching sales."
              : "Your story starts with a sale."}
          </h3>
          <p>
            {sales.length
              ? "Try different filters."
              : "Completed transactions will appear here."}
          </p>
        </div>
      )}
      {rows.length > 25 && (
        <div className="pagination">
          <span>
            Page {currentPage + 1} of {lastPage + 1}
          </span>
          <button disabled={!currentPage} onClick={() => P(currentPage - 1)}>
            Previous
          </button>
          <button
            disabled={currentPage >= lastPage}
            onClick={() => P(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
function localDay(date: string) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
