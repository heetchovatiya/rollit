"use client";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Package,
  Download,
  TrendingUp,
} from "lucide-react";
import { analyseStore, dayKey } from "@/lib/pos/analytics";
import { money, downloadCsv } from "@/lib/pos/format";
import type { StoreState } from "@/lib/pos/types";
import type { Section } from "@/lib/pos/settings";
export function Overview({
  data,
  onNavigate,
}: {
  data: StoreState;
  onNavigate: (section: Section) => void;
}) {
  const [endDate, setEndDate] = useState(() => dayKey(new Date()));
  const [days, D] = useState(7),
    [table, T] = useState(false);
  const a = useMemo(
    () => analyseStore(data, days, new Date(endDate + "T12:00:00Z")),
    [data, days, endDate],
  );
  const ceiling = Math.max(
    10000,
    ...a.daily.flatMap((d) => [d.sales, d.returns]),
  );
  const point = (value: number, index: number) =>
    `${35 + (index / (days - 1)) * 650},${180 - (value / ceiling) * 150}`;
  const paymentsTotal = Object.values(a.payments).reduce((n, v) => n + v, 0);
  function exportReport() {
    downloadCsv("roll-it-analytics.csv", [
      [
        "Date",
        "Sales before returns",
        "Returns recorded",
        "Net sales",
        "Orders",
      ],
      ...a.daily.map((d) => [
        d.date,
        d.sales / 100,
        d.returns / 100,
        (d.sales - d.returns) / 100,
        d.orders,
      ]),
    ]);
  }
  return (
    <div className="analytics">
      <div className="analytics-toolbar">
        <div>
          <h2>Your cart at a glance</h2>
          <p>
            {a.start} — {a.today} · India time
          </p>
        </div>
        <div className="row-actions">
          <label className="report-date">
            Through date
            <input
              aria-label="Analytics through date"
              type="date"
              value={endDate}
              max={dayKey(new Date())}
              onInput={(e) => {
                if (e.currentTarget.value) setEndDate(e.currentTarget.value);
              }}
            />
          </label>
          <div className="period-switch" aria-label="Analytics period">
            {[7, 30, 90].map((n) => (
              <button
                key={n}
                className={days === n ? "selected" : ""}
                aria-pressed={days === n}
                onClick={() => D(n)}
              >
                {n} days
              </button>
            ))}
          </div>
          <button onClick={exportReport}>
            <Download size={15} />
            Export report
          </button>
        </div>
      </div>
      <div className="analytics-metrics">
        <Metric
          label="Net sales"
          value={money(a.net)}
          note={
            a.change === null
              ? `Previous ${days} days: ${money(a.previousNet)}`
              : `${a.change >= 0 ? "+" : ""}${a.change.toFixed(1)}% vs previous ${days} days`
          }
          positive={a.net >= a.previousNet}
        />
        <Metric
          label="Orders recorded"
          value={String(a.orders)}
          note={`${money(a.sales)} before returns`}
        />
        <Metric
          label="Gross profit"
          value={money(a.profit)}
          note="After returns · before expenses"
        />
        <Metric
          label="Average sale"
          value={money(Math.round(a.average))}
          note="Before returns · per recorded order"
        />
      </div>
      <div className="analytics-main">
        <section className="panel trend-panel">
          <div className="sectionheading">
            <div>
              <h2>Sales & returns</h2>
              <p className="panel-description">
                Returns appear on the day they were recorded.
              </p>
            </div>
            <span className="chart-icon">
              <TrendingUp size={20} />
            </span>
          </div>
          <div className="chart-legend">
            <span>
              <i />
              Sales
            </span>
            <span className="refund-key">
              <i />
              Returns
            </span>
          </div>
          <div className="trend-chart">
            <svg
              viewBox="0 0 720 225"
              role="img"
              aria-label={`Daily sales and returns for ${days} days. Sales ${money(a.sales)}, returns ${money(a.refunds)}.`}
            >
              <title>
                Sales {money(a.sales)} · Returns {money(a.refunds)}
              </title>
              {[0, 0.5, 1].map((f) => (
                <g key={f}>
                  <line
                    x1="35"
                    x2="685"
                    y1={180 - f * 150}
                    y2={180 - f * 150}
                    className="chart-grid"
                  />
                  <text x="35" y={173 - f * 150} className="chart-tick">
                    {money(Math.round(ceiling * f))}
                  </text>
                </g>
              ))}
              <path
                d={"M" + a.daily.map((d, i) => point(d.sales, i)).join(" L")}
                className="sales-line"
              />
              <path
                d={"M" + a.daily.map((d, i) => point(d.returns, i)).join(" L")}
                className="refund-line"
              />
              {a.daily.map((d, i) => {
                const [x, y] = point(d.sales, i).split(",");
                return (
                  <circle
                    key={d.date}
                    cx={x}
                    cy={y}
                    r={days === 7 ? 4 : 2.5}
                    className="sales-point"
                  >
                    <title>
                      {d.date}: {money(d.sales)} sales, {money(d.returns)}{" "}
                      returns, {d.orders} orders
                    </title>
                  </circle>
                );
              })}
              {[0, Math.floor((days - 1) / 2), days - 1].map((i) => (
                <text
                  key={i}
                  x={35 + (i / (days - 1)) * 650}
                  y="210"
                  textAnchor={
                    i === 0 ? "start" : i === days - 1 ? "end" : "middle"
                  }
                  className="chart-tick"
                >
                  {a.daily[i].date.slice(5)}
                </text>
              ))}
            </svg>
          </div>
          <div className="trend-summary">
            <span>
              Sales <strong>{money(a.sales)}</strong>
            </span>
            <span>
              Returns <strong>{money(a.refunds)}</strong>
            </span>
            <button aria-expanded={table} onClick={() => T(!table)}>
              {table ? "Hide daily data" : "View daily data"}
            </button>
          </div>
          {table && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    {["Date", "Sales", "Returns", "Net", "Orders"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.daily.map((d) => (
                    <tr key={d.date}>
                      <td>{d.date}</td>
                      <td>{money(d.sales)}</td>
                      <td>{money(d.returns)}</td>
                      <td>{money(d.sales - d.returns)}</td>
                      <td>{d.orders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="sectionheading">
            <h2>Payment mix</h2>
            <BarChart3 size={19} />
          </div>
          <p className="panel-description">
            Recorded sales before returns. These are manual payment records.
          </p>
          <div className="payment-visual">
            {Object.entries(a.payments).map(([name, value], i) => (
              <div className="payment-stat" key={name}>
                <div>
                  <span>{name}</span>
                  <strong>{money(value)}</strong>
                </div>
                <div className="bar-track">
                  <span
                    className={"payment-fill fill-" + i}
                    style={{
                      width:
                        (paymentsTotal ? (value / paymentsTotal) * 100 : 0) +
                        "%",
                    }}
                  />
                </div>
                <small>
                  {paymentsTotal
                    ? ((value / paymentsTotal) * 100).toFixed(0)
                    : 0}
                  % of sales
                </small>
              </div>
            ))}
          </div>
          {!paymentsTotal && (
            <p className="panel-description">
              Your first completed sale will start this chart.
            </p>
          )}
          <button onClick={() => onNavigate("Sales history")}>
            View sales <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
      <div className="analytics-secondary">
        <section className="panel">
          <div className="sectionheading">
            <h2>Top items</h2>
            <span>By net sales</span>
          </div>
          {a.topItems.slice(0, 5).map((item, i) => (
            <div className="top-item" key={item.id}>
              <span className="rank">{i + 1}</span>
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.units} net units · {money(item.profit)} gross profit
                </small>
                <div className="bar-track">
                  <span
                    style={{
                      width:
                        Math.min(
                          100,
                          (Math.abs(item.revenue) /
                            Math.max(
                              1,
                              ...a.topItems.map((i) => Math.abs(i.revenue)),
                            )) *
                            100,
                        ) + "%",
                    }}
                  />
                </div>
              </div>
              <strong>{money(item.revenue)}</strong>
            </div>
          ))}
          {!a.topItems.length && (
            <div className="analytics-empty">
              <BarChart3 size={27} />
              <p>No item sales in this period yet.</p>
            </div>
          )}
          <button onClick={() => onNavigate("Sales history")}>
            Explore sales <ArrowUpRight size={15} />
          </button>
        </section>
        <section className="panel"><div className="sectionheading"><h2>Raw materials</h2><Package size={19}/></div><div className="stock-callout"><strong>{data.ingredients.filter(i=>!i.archived&&i.stock<=0).length}</strong><span>materials at zero or below</span></div>{data.ingredients.filter(i=>!i.archived&&i.stock<=0).slice(0,4).map(i=><div className="stock-watch-row" key={i.id}><span>{i.name}</span><span className="badge warn">{i.stock} {i.unit}</span></div>)}<p className="panel-description">Orders stay available. Negative balances show ingredients used before a restock was recorded.</p><div className="inventory-value"><span>Raw materials at cost</span><strong>{money(Math.round(data.ingredients.filter(i=>!i.archived).reduce((n,i)=>n+Math.max(0,i.stock)*i.unitCost,0)))}</strong></div><button onClick={()=>onNavigate('Inventory')}>Manage raw materials <ArrowUpRight size={15}/></button></section>
      </div>
      <section className="panel insight-strip"><div><span className="badge">Recipe tracking</span><h3>{data.products.filter(p=>!p.archived&&p.recipeEnabled).length} menu items linked to raw materials</h3><p>Edit quantities per serving to track ingredient use automatically. Orders do not have a stock limit.</p></div><button onClick={()=>onNavigate('Inventory')}>Edit recipes <ArrowUpRight size={15}/></button></section>
      <p className="analytics-footnote">
        Net sales = sales recorded in the period minus returns recorded in the
        period. Gross profit uses saved item costs and excludes operating
        expenses, tax and delivery charges. Enabled recipes deduct raw materials when an order is placed; shortages do not block ordering.
      </p>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
  positive,
}: {
  label: string;
  value: string;
  note: string;
  positive?: boolean;
}) {
  return (
    <section className="analytics-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small
        className={
          positive === undefined ? "" : positive ? "positive" : "negative"
        }
      >
        {positive === undefined ? null : positive ? (
          <ArrowUpRight size={13} />
        ) : (
          <ArrowDownRight size={13} />
        )}{" "}
        {note}
      </small>
    </section>
  );
}
