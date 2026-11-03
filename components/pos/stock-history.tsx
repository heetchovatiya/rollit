"use client";
import { useState } from "react";
import { Search, ArrowDownUp } from "lucide-react";
import { dateTime, downloadCsv } from "@/lib/pos/format";
import type { StockMovement } from "@/lib/pos/types";
export function StockHistory({ movements }: { movements: StockMovement[] }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("All movements");
  const rows = movements.filter(
    (m) =>
      (kind === "All movements" || m.kind === kind) &&
      `${m.productName} ${m.note} ${m.reference || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(rows.length / 25) - 1);
  const currentPage = Math.min(page, lastPage);
  return (
    <section className="panel">
      <div className="sectionheading">
        <h2>Stock movements</h2>
        <button
          onClick={() =>
            downloadCsv("roll-it-stock-movements.csv", [
              [
                "Date",
                "Product",
                "Movement",
                "Change",
                "Balance",
                "Reason",
                "Reference",
              ],
              ...rows.map((m) => [
                m.date,
                m.productName,
                m.kind,
                m.delta,
                m.balance,
                m.note,
                m.reference || "",
              ]),
            ])
          }
        >
          Export CSV ↗
        </button>
      </div>
      <p className="panel-description">
        A history of opening stock, adjustments, sales and returns. Tracking
        starts with this version.
      </p>
      <div className="search">
        <Search size={18} />
        <input
          aria-label="Search stock movements"
          placeholder="Search product or reason…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
      </div>
      <div className="chips">
        {[
          "All movements",
          "Opening stock",
          "Adjustment",
          "Restock",
          "Sale",
          "Return",
        ].map((k) => (
          <button
            key={k}
            className={k === kind ? "selected" : ""}
            onClick={() => {
              setKind(k);
              setPage(0);
            }}
          >
            {k}
          </button>
        ))}
      </div>
      <div className="tablewrap">
        <table>
          <thead>
            <tr>
              {[
                "Date",
                "Product",
                "Movement",
                "Change",
                "Balance",
                "Reason",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(currentPage * 25, currentPage * 25 + 25).map((m) => (
              <tr key={m.id}>
                <td>{dateTime(m.date)}</td>
                <td>
                  <strong>{m.productName}</strong>
                </td>
                <td>{m.kind}</td>
                <td>
                  <span
                    className={
                      m.delta > 0 ? "stock-positive" : "stock-negative"
                    }
                  >
                    {m.delta > 0 ? "+" : ""}
                    {m.delta}
                  </span>
                </td>
                <td>{m.balance}</td>
                <td className="wrap-cell">
                  {m.note}
                  {m.billId && (
                    <small className="table-small">
                      <a
                        href={"/api/bills/" + m.billId}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Download bill ↗
                      </a>
                    </small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <div className="empty">
          <ArrowDownUp size={34} />
          <h3>No stock movements yet.</h3>
          <p>New sales, returns and stock changes will appear here.</p>
        </div>
      )}
      {rows.length > 25 && (
        <div className="pagination">
          <span>
            {rows.length} movements · page {currentPage + 1} of {lastPage + 1}
          </span>
          <button
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <button
            disabled={currentPage >= lastPage}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}
    </section>
  );
}
