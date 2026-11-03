"use client";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { dayKey, analyseStore } from "@/lib/pos/analytics";
import { money, dateTime } from "@/lib/pos/format";
import type { Sale, StoreState } from "@/lib/pos/types";
import type { Section } from "@/lib/pos/settings";
export function CalendarPanel({
  data,
  selected,
  onDate,
  onReceipt,
  onNavigate,
}: {
  data: StoreState;
  selected: string;
  onDate: (date: string) => void;
  onReceipt: (sale: Sale) => void;
  onNavigate: (section: Section) => void;
}) {
  const today = dayKey(new Date()),
    [month, M] = useState(selected.slice(0, 7));
  const days = useMemo(() => {
    const first = new Date(month + "-01T12:00:00Z");
    const offset = (first.getUTCDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(first);
      d.setUTCDate(1 + i - offset);
      return d.toISOString().slice(0, 10);
    });
  }, [month]);
  const report = analyseStore(data, 1, new Date(selected + "T12:00:00Z"));
  const sales = data.sales.filter((s) => dayKey(s.date) === selected),
    returns = data.sales.filter(
      (s) => s.returnedAt && dayKey(s.returnedAt) === selected,
    ),
    bills = data.bills.filter((b) => !b.archived && b.date === selected),
    deliveries = data.restocks.filter((r) => r.invoiceDate === selected),
    movements = data.movements.filter((m) => dayKey(m.date) === selected);
  function pick(date: string) {
    onDate(date);
    M(date.slice(0, 7));
  }
  function move(delta: number) {
    const d = new Date(month + "-01T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + delta);
    M(d.toISOString().slice(0, 7));
  }
  const activity = new Map<string, number>();
  for (const sale of data.sales) {
    const key = dayKey(sale.date);
    activity.set(key, (activity.get(key) || 0) + sale.total);
  }
  return (
    <div className="daily-workspace">
      <section className="panel calendar-panel">
        <div className="sectionheading">
          <h2>Browse your business</h2>
          <CalendarDays size={20} />
        </div>
        <div className="calendar-tools">
          <button aria-label="Previous month" onClick={() => move(-1)}>
            <ChevronLeft size={17} />
          </button>
          <strong>
            {new Date(month + "-01T12:00:00Z").toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            })}
          </strong>
          <button
            aria-label="Next month"
            disabled={month >= today.slice(0, 7)}
            onClick={() => move(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="calendar-grid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span className="weekday" key={d}>
              {d}
            </span>
          ))}
          {days.map((date) => (
            <button
              key={date}
              disabled={date > today}
              aria-label={"View " + date}
              aria-pressed={selected === date}
              className={
                (selected === date ? "selected " : "") +
                (date.slice(0, 7) !== month ? "outside-month" : "")
              }
              onClick={() => pick(date)}
            >
              <strong>{Number(date.slice(-2))}</strong>
              {(activity.get(date) || 0) > 0 && (
                <i aria-label="Sales recorded" />
              )}
              {data.bills.some((b) => !b.archived && b.date === date) && (
                <span className="bill-dot" aria-label="Bill recorded" />
              )}
            </button>
          ))}
        </div>
        <div className="calendar-legend">
          <span>● Sales</span>
          <span>● Bills</span>
        </div>
        <label className="calendar-date-label">
          Jump to date
          <input
            type="date"
            max={today}
            value={selected}
            onInput={(e) => {
              if (e.currentTarget.value) pick(e.currentTarget.value);
            }}
          />
        </label>
        <button onClick={() => pick(today)}>Today</button>
        <p className="panel-description">
          Days use India time. Deliveries use invoice date; stock movements use
          the actual posting date.
        </p>
      </section>
      <div className="daily-details">
        <div className="sectionheading">
          <div>
            <h2>
              {new Date(selected + "T12:00:00Z").toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              })}
            </h2>
            <p className="panel-description">
              Sales, returns, bills and deliveries for this day.
            </p>
          </div>
        </div>
        <div className="analytics-metrics daily-metrics">
          {[
            ["Net sales", money(report.net)],
            ["Orders", String(report.orders)],
            ["Gross profit", money(report.profit)],
            ["Tracked bills", money(bills.reduce((n, b) => n + b.amount, 0))],
          ].map(([label, value]) => (
            <div className="analytics-metric" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <section className="panel">
          <div className="sectionheading">
            <h2>Sales & returns</h2>
            <button onClick={() => onNavigate("Sales history")}>
              All sales ↗
            </button>
          </div>
          {sales.map((s) => (
            <div className="metric" key={s.id}>
              <span>
                {s.customer}
                <small>
                  {dateTime(s.date)} · {s.payment} ·{" "}
                  {s.orderReference || s.orderType || "Takeaway"}
                </small>
              </span>
              <strong>{money(s.total)}</strong>
              <button onClick={() => onReceipt(s)}>Receipt</button>
            </div>
          ))}
          {returns.map((s) => (
            <div className="metric" key={"return" + s.id}>
              <span>
                Return #{s.id.slice(0, 8)}
                <small>{s.returnReason}</small>
              </span>
              <strong>−{money(s.total)}</strong>
              <button onClick={() => onReceipt(s)}>Receipt</button>
            </div>
          ))}
          {!sales.length && !returns.length && (
            <p className="panel-description">
              No sales or returns recorded on this day.
            </p>
          )}
        </section>
        <section className="panel">
          <div className="sectionheading">
            <h2>Bills & deliveries</h2>
            <button onClick={() => onNavigate("Bills")}>Track a bill ↗</button>
          </div>
          {bills.map((b) => (
            <div className="metric" key={b.id}>
              <span>
                {b.title}
                <small>
                  {b.category} · {b.description}
                </small>
              </span>
              <strong>{money(b.amount)}</strong>
              {b.billId && (
                <a
                  href={"/api/bills/" + b.billId}
                  target="_blank"
                  rel="noreferrer"
                >
                  Attachment ↗
                </a>
              )}
            </div>
          ))}
          {deliveries.map((r) => (
            <div className="metric" key={r.id}>
              <span>
                {r.supplier}
                <small>
                  Restock · {r.invoiceNumber || "No invoice number"} · goods
                  only
                </small>
              </span>
              <strong>{money(r.total)}</strong>
              {r.billId && (
                <a
                  href={"/api/bills/" + r.billId}
                  target="_blank"
                  rel="noreferrer"
                >
                  Bill ↗
                </a>
              )}
            </div>
          ))}
          {!bills.length && !deliveries.length && (
            <p className="panel-description">
              No tracked bills or deliveries for this date.
            </p>
          )}
          <p className="analytics-footnote">
            Bills and restocks are shown separately; they are not added together
            as expenses. A restock bill may also be tracked in Bills.
          </p>
        </section>
        <section className="panel">
          <h2>Stock movements</h2>
          {movements.map((m) => (
            <div className="metric" key={m.id}>
              <span>
                {m.productName}
                <small>
                  {m.kind} · {m.note}
                </small>
              </span>
              <strong>
                {m.delta > 0 ? "+" : ""}
                {m.delta} · balance {m.balance}
              </strong>
            </div>
          ))}
          {!movements.length && (
            <p className="panel-description">
              No stock movements posted on this day.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
