import type { StoreState } from "./types";
const calendar = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function dayKey(date: string | Date) {
  return calendar.format(new Date(date));
}
const shift = (key: string, delta: number) =>
  new Date(Date.parse(key + "T00:00:00Z") + delta * 86400000)
    .toISOString()
    .slice(0, 10);
export function analyseStore(data: StoreState, days: number, now = new Date()) {
  const today = dayKey(now),
    start = shift(today, 1 - days),
    previousStart = shift(start, -days);
  const daily = Array.from({ length: days }, (_, i) => ({
    date: shift(start, i),
    sales: 0,
    returns: 0,
    orders: 0,
  }));
  const items = new Map<
    string,
    { id: string; name: string; units: number; revenue: number; profit: number }
  >();
  const payments = { Cash: 0, UPI: 0, Card: 0 };
  let sales = 0,
    refunds = 0,
    profit = 0,
    orders = 0,
    previousNet = 0;
  const inRange = (key: string) => key >= start && key <= today;
  for (const sale of data.sales) {
    const sold = dayKey(sale.date),
      returned = sale.returnedAt ? dayKey(sale.returnedAt) : null;
    if (sold >= previousStart && sold < start) previousNet += sale.total;
    if (returned && returned >= previousStart && returned < start)
      previousNet -= sale.total;
    if (inRange(sold)) {
      sales += sale.total;
      orders++;
      payments[sale.payment] += sale.total;
      const bucket = daily.find((d) => d.date === sold)!;
      bucket.sales += sale.total;
      bucket.orders++;
    }
    if (returned && inRange(returned)) {
      refunds += sale.total;
      daily.find((d) => d.date === returned)!.returns += sale.total;
    }
    for (const line of sale.items) {
      const direction =
        Number(inRange(sold)) - Number(!!returned && inRange(returned));
      if (!direction) continue;
      const item = items.get(line.id) || {
        id: line.id,
        name: line.name,
        units: 0,
        revenue: 0,
        profit: 0,
      };
      item.units += direction * line.qty;
      item.revenue += direction * line.qty * line.price;
      item.profit += direction * line.qty * (line.price - line.cost);
      profit += direction * line.qty * (line.price - line.cost);
      items.set(line.id, item);
    }
  }
  const net = sales - refunds,
    change = previousNet > 0 ? ((net - previousNet) / previousNet) * 100 : null;
  const active = data.products.filter((p) => !p.archived);
  const topItems = Array.from(items.values())
    .filter((i) => i.units || i.revenue)
    .sort((a, b) => b.revenue - a.revenue);
  const stock = active
    .filter((p) => p.stock <= p.low)
    .sort((a, b) => a.stock - b.stock);
  const coverage = active
    .filter((p) => p.stock > p.low)
    .map((p) => {
      const units = items.get(p.id)?.units || 0;
      return { product: p, days: units > 0 ? p.stock / (units / days) : null };
    })
    .filter((p) => p.days !== null && p.days < 7)
    .sort((a, b) => a.days! - b.days!);
  const noSales = active.filter(
    (p) => p.stock > 0 && (items.get(p.id)?.units || 0) <= 0,
  );
  return {
    days,
    today,
    start,
    daily,
    sales,
    refunds,
    net,
    profit,
    orders,
    average: orders ? sales / orders : 0,
    previousNet,
    change,
    topItems,
    payments,
    stock,
    coverage,
    noSales,
    inventoryCost: data.products.reduce((n, p) => n + p.cost * p.stock, 0),
  };
}
