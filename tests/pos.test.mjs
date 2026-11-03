import { test, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const temp = await mkdtemp(join(tmpdir(), "roll-it-tests-"));
for (const name of [
  "types",
  "business-day",
  "cart",
  "menu-images",
  "recipes",
  "chef-gesture",
  "quick-add",
  "delivery",
  "menu-layout",
  "settings",
  "analytics",
  "photo-invoice",
  "ocr-preprocess",
  "validation",
  "service",
  "repository",
  "bills",
  "invoice-parser",
]) {
  const source = await readFile(
    new URL(`../lib/pos/${name}.ts`, import.meta.url),
    "utf8",
  );
  const output = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    })
    .outputText.replace(
      /from ['"]\.\/([^'"]+)['"]/g,
      (_, name) => `from '${pathToFileURL(join(temp, name + ".mjs")).href}'`,
    );
  // Validation uses the project's installed Zod; keep all generated files disposable.
  const resolved = output.replace(
    /from ['"]zod['"]/,
    `from '${import.meta.resolve("zod")}'`,
  );
  await writeFile(join(temp, name + ".mjs"), resolved);
}
const { applyAction, normalizeState } = await import(
  pathToFileURL(join(temp, "service.mjs"))
);
const { actionSchema } = await import(
  pathToFileURL(join(temp, "validation.mjs"))
);
const { readState, commitAction } = await import(
  pathToFileURL(join(temp, "repository.mjs"))
);
after(() => rm(temp, { recursive: true, force: true }));
const pId = "00000000-0000-4000-8000-000000000001";
const saleId = "00000000-0000-4000-8000-000000000002";
const secondId = "00000000-0000-4000-8000-000000000003";
const product = {
  id: pId,
  name: "Notebook",
  sku: "BOOK-1",
  category: "Stationery",
  price: 5000,
  cost: 3000,
  stock: 10,
  low: 3,
  revision: 0,
};
const state = () => ({
  products: [{ ...product }],
  sales: [],
  movements: [],
  restocks: [],
});
const sale = (id = saleId, qty = 2) => ({
  type: "sale",
  id,
  customer: "",
  payment: "Cash",
  items: [{ id: pId, qty, expectedPrice: 5000 }],
});
const edit = (extra = {}) => ({
  type: "product",
  product: {
    ...product,
    originalStock: 10,
    originalRevision: 0,
    note: "",
    ...extra,
  },
});
test("sale snapshots totals, costs and movements without mutating input", () => {
  const initial = state();
  const next = applyAction(initial, sale());
  assert.equal(initial.products[0].stock, 10);
  assert.equal(next.products[0].stock, 8);
  assert.equal(next.products[0].revision, 1);
  assert.equal(next.sales[0].total, 10000);
  assert.equal(next.sales[0].items[0].cost, 3000);
  assert.equal(next.movements[0].delta, -2);
  assert.equal(next.movements[0].balance, 8);
});
test("sale retry is idempotent and changed payload is rejected", () => {
  const next = applyAction(state(), sale());
  assert.strictEqual(applyAction(next, sale()), next);
  assert.throws(() => applyAction(next, sale(saleId, 3)), /another order/);
});
test("overselling, price changes, duplicate lines and archived products are rejected", () => {
  assert.throws(() => applyAction(state(), sale(saleId, 11)), /remain/);
  const action = sale();
  action.items[0].expectedPrice = 4000;
  assert.throws(() => applyAction(state(), action), /price/);
  const duplicate = sale();
  duplicate.items.push({ ...duplicate.items[0] });
  assert.throws(() => applyAction(state(), duplicate), /twice/);
  const archived = state();
  archived.products[0].archived = true;
  assert.throws(() => applyAction(archived, sale()), /available/);
});
test("full return restores stock exactly once and preserves receipt", () => {
  const sold = applyAction(state(), sale());
  const returned = applyAction(sold, {
    type: "return",
    saleId,
    reason: "Customer changed mind",
  });
  assert.equal(returned.products[0].stock, 10);
  assert.equal(returned.sales[0].total, 10000);
  assert.ok(returned.sales[0].returnedAt);
  assert.equal(returned.movements[0].kind, "Return");
  assert.equal(returned.movements[0].delta, 2);
  assert.strictEqual(
    applyAction(returned, { type: "return", saleId, reason: "Retry" }),
    returned,
  );
});
test("archiving preserves history and returns can restore archived stock", () => {
  const sold = applyAction(state(), sale());
  const archived = applyAction(sold, {
    type: "archive",
    productId: pId,
    archived: true,
    originalRevision: 1,
  });
  assert.equal(archived.sales.length, 1);
  const returned = applyAction(archived, {
    type: "return",
    saleId,
    reason: "Returned unopened",
  });
  assert.equal(returned.products[0].stock, 10);
  assert.equal(returned.products[0].archived, true);
  const restored = applyAction(returned, {
    type: "archive",
    productId: pId,
    archived: false,
    originalRevision: 3,
  });
  assert.equal(restored.products[0].archived, false);
});
test("stock adjustments require a reason and create an audit entry", () => {
  assert.throws(() => applyAction(state(), edit({ stock: 20 })), /reason/);
  const next = applyAction(
    state(),
    edit({ stock: 20, note: "Delivery received" }),
  );
  assert.equal(next.movements[0].delta, 10);
  assert.equal(next.movements[0].note, "Delivery received");
  assert.equal(next.products[0].stock, 20);
});
test("stale edits and duplicate SKUs are rejected", () => {
  const changed = applyAction(state(), edit({ name: "New name" }));
  assert.throws(() => applyAction(changed, edit({ cost: 1000 })), /changed/);
  assert.throws(
    () => applyAction(state(), edit({ id: "", sku: "book-1" })),
    /SKU already/,
  );
});
test("legacy state remains readable without fabricated movement history", () => {
  const legacy = normalizeState({
    products: [{ ...product, revision: undefined }],
    sales: [],
  });
  assert.deepEqual(legacy.movements, []);
  assert.equal(applyAction(legacy, edit()).products[0].revision, 1);
});
test("validation rejects malformed IDs, null lines, decimals, negative stock and missing expected price", () => {
  for (const action of [
    { ...sale(), id: "" },
    { ...sale(), items: [null] },
    edit({ stock: -1 }),
    edit({ price: 1.2 }),
    { ...sale(), items: [{ id: pId, qty: 1 }] },
  ])
    assert.equal(actionSchema.safeParse(action).success, false);
  assert.equal(actionSchema.safeParse(sale()).success, true);
});
function database() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(
    "CREATE TABLE store(id TEXT PRIMARY KEY,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0)",
  );
  const db = {
    prepare(query) {
      return {
        bind(...values) {
          return {
            async first() {
              await Promise.resolve();
              return sql.prepare(query).get(...values) || null;
            },
            async run() {
              await Promise.resolve();
              const result = sql.prepare(query).run(...values);
              return { meta: { changes: Number(result.changes) } };
            },
          };
        },
      };
    },
  };
  return { sql, db };
}
async function seeded() {
  const fixture = database();
  fixture.sql
    .prepare("INSERT INTO store VALUES(?,?,0)")
    .run("main", JSON.stringify(state()));
  return fixture;
}
test("concurrent checkouts cannot oversell the last units", async () => {
  const { sql, db } = await seeded();
  try {
    const results = await Promise.allSettled([
      commitAction(db, sale(saleId, 7)),
      commitAction(db, sale(secondId, 7)),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const s = await readState(db);
    assert.equal(s.products[0].stock, 3);
    assert.equal(s.sales.length, 1);
    assert.equal(s.movements.length, 1);
  } finally {
    sql.close();
  }
});
test("concurrent retries create one sale and one stock movement", async () => {
  const { sql, db } = await seeded();
  try {
    await Promise.all([commitAction(db, sale()), commitAction(db, sale())]);
    const s = await readState(db);
    assert.equal(s.products[0].stock, 8);
    assert.equal(s.sales.length, 1);
    assert.equal(s.movements.length, 1);
  } finally {
    sql.close();
  }
});
test("concurrent returns restore stock once", async () => {
  const { sql, db } = await seeded();
  try {
    await commitAction(db, sale());
    await Promise.all([
      commitAction(db, { type: "return", saleId, reason: "Return unopened" }),
      commitAction(db, { type: "return", saleId, reason: "Return retry" }),
    ]);
    const s = await readState(db);
    assert.equal(s.products[0].stock, 10);
    assert.equal(s.movements.filter((m) => m.kind === "Return").length, 1);
  } finally {
    sql.close();
  }
});
const restock = (overrides = {}) => ({
  type: "restock",
  id: secondId,
  source: "Manual",
  supplier: "Test supplier",
  invoiceNumber: "INV-1",
  invoiceDate: "2026-11-01",
  note: "Delivery received",
  items: [{ productId: pId, qty: 5, unitCost: 3200 }],
  ...overrides,
});
const bill = "a".repeat(64);
test("restock adds units, snapshots cost and links the bill to all records", () => {
  const next = applyAction(state(), restock({ billId: bill }));
  assert.equal(next.products[0].stock, 15);
  assert.equal(next.products[0].cost, 3200);
  assert.equal(next.restocks[0].total, 16000);
  assert.equal(next.movements[0].kind, "Restock");
  assert.equal(next.movements[0].billId, bill);
  assert.deepEqual(next.products[0].billIds, [bill]);
  assert.equal(state().products[0].stock, 10);
});
test("restock retries are idempotent and changed requests are rejected", () => {
  const next = applyAction(state(), restock());
  assert.strictEqual(applyAction(next, restock()), next);
  assert.throws(
    () => applyAction(next, restock({ supplier: "Other supplier" })),
    /another delivery/,
  );
});
test("duplicate invoices and reuploaded bills are rejected across new delivery IDs", () => {
  const next = applyAction(state(), restock({ billId: bill }));
  assert.throws(
    () =>
      applyAction(
        next,
        restock({ id: saleId, invoiceNumber: "INV-2", billId: bill }),
      ),
    /bill is already/,
  );
  assert.throws(
    () => applyAction(next, restock({ id: saleId, invoiceNumber: "inv-1" })),
    /invoice has already/,
  );
});
test("Hyperpure requires a bill; archived products, duplicate lines and stock overflow are rejected", () => {
  assert.throws(
    () => applyAction(state(), restock({ source: "Hyperpure" })),
    /Attach/,
  );
  const s = state();
  s.products[0].archived = true;
  assert.throws(() => applyAction(s, restock()), /unavailable/);
  const a = restock();
  a.items.push({ ...a.items[0] });
  assert.throws(() => applyAction(state(), a), /duplicate/);
  const max = state();
  max.products[0].stock = 9999999;
  assert.throws(() => applyAction(max, restock()), /limit/);
});
test("restock validates whole units and real calendar dates", () => {
  assert.equal(actionSchema.safeParse(restock()).success, true);
  assert.equal(
    actionSchema.safeParse(restock({ invoiceDate: "2026-02-30" })).success,
    false,
  );
  const a = restock();
  a.items[0].qty = 1.5;
  assert.equal(actionSchema.safeParse(a).success, false);
});
test("concurrent restocks do not lose added stock", async () => {
  const { sql, db } = await seeded();
  try {
    await Promise.all([
      commitAction(db, restock()),
      commitAction(db, restock({ id: saleId, invoiceNumber: "INV-2" })),
    ]);
    const s = await readState(db);
    assert.equal(s.products[0].stock, 20);
    assert.equal(s.restocks.length, 2);
  } finally {
    sql.close();
  }
});
test("concurrent duplicate-bill submissions record one delivery", async () => {
  const { sql, db } = await seeded();
  try {
    const results = await Promise.allSettled([
      commitAction(db, restock({ billId: bill })),
      commitAction(
        db,
        restock({ id: saleId, invoiceNumber: "INV-2", billId: bill }),
      ),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal((await readState(db)).products[0].stock, 15);
  } finally {
    sql.close();
  }
});
const { detectBillType, billFingerprint, readBillBody, MAX_BILL_BYTES } =
  await import(pathToFileURL(join(temp, "bills.mjs")));
test("bill upload validates signatures, limits size and fingerprints content", async () => {
  const bytes = new TextEncoder().encode("%PDF-1.7\nTest invoice");
  assert.equal(detectBillType(bytes), "application/pdf");
  assert.equal(
    detectBillType(new TextEncoder().encode("<html>fake.pdf</html>")),
    null,
  );
  assert.equal(await billFingerprint(bytes), await billFingerprint(bytes));
  assert.notEqual(
    await billFingerprint(bytes),
    await billFingerprint(
      new TextEncoder().encode("%PDF-1.7\nAnother invoice"),
    ),
  );
  await assert.rejects(
    () =>
      readBillBody(
        new Request("http://localhost", {
          method: "POST",
          body: "x",
          headers: { "content-length": String(MAX_BILL_BYTES + 1) },
        }),
      ),
    /10 MB/,
  );
  assert.deepEqual(
    await readBillBody(
      new Request("http://localhost", { method: "POST", body: bytes }),
    ),
    bytes,
  );
});
const { parseInvoiceRows } = await import(
  pathToFileURL(join(temp, "invoice-parser.mjs"))
);
test("invoice parser uses labelled quantity columns and never invents quantities", () => {
  const rows = [
    {
      cells: [
        { text: "Product", x: 20 },
        { text: "Qty", x: 300 },
        { text: "Rate", x: 400 },
      ],
    },
    {
      cells: [
        { text: "Notebook", x: 20 },
        { text: "2", x: 300 },
        { text: "32.50", x: 400 },
      ],
    },
    {
      cells: [
        { text: "Total", x: 20 },
        { text: "2", x: 300 },
        { text: "65.00", x: 400 },
      ],
    },
  ];
  assert.deepEqual(parseInvoiceRows(rows), [
    { description: "Notebook", qty: "2", unitCost: "32.5" },
  ]);
  assert.deepEqual(parseInvoiceRows(rows.slice(1)), []);
});

const { defaultSettings } = await import(
  pathToFileURL(join(temp, "settings.mjs"))
);
const { analyseStore } = await import(
  pathToFileURL(join(temp, "analytics.mjs"))
);
test("profile and appearance settings persist without changing business records", () => {
  const old = normalizeState(state());
  const next = applyAction(old, {
    type: "settings",
    originalRevision: 0,
    settings: {
      ...defaultSettings(),
      businessName: "My food cart",
      ownerName: "Owner",
      theme: "dark",
      productView: "list",
      cartPosition: "left",
    },
  });
  assert.equal(next.settings.businessName, "My food cart");
  assert.equal(next.settings.theme, "dark");
  assert.equal(next.settings.revision, 1);
  assert.equal(next.products[0].stock, 10);
  assert.throws(
    () =>
      applyAction(next, {
        type: "settings",
        originalRevision: 0,
        settings: defaultSettings(),
      }),
    /another device/,
  );
});
test("settings validation protects reachable navigation and rejects invalid themes", () => {
  for (const settings of [
    { ...defaultSettings(), theme: "invisible" },
    { ...defaultSettings(), hiddenSections: ["Settings"] },
    { ...defaultSettings(), hiddenSections: ["Checkout"] },
    { ...defaultSettings(), navigation: Array(8).fill("Checkout") },
    { ...defaultSettings(), businessName: "" },
  ])
    assert.equal(
      actionSchema.safeParse({
        type: "settings",
        originalRevision: 0,
        settings,
      }).success,
      false,
    );
  assert.equal(
    actionSchema.safeParse({
      type: "settings",
      originalRevision: 0,
      settings: defaultSettings(),
    }).success,
    true,
  );
});
test("new food-cart sales snapshot order details and receipt branding", () => {
  const old = normalizeState(state());
  old.settings.businessName = "Night cart";
  old.settings.receiptFooter = "Come back soon";
  const next = applyAction(old, {
    ...sale(),
    orderType: "Dine-in",
    orderReference: "Table 3",
    notes: "No onion",
  });
  assert.equal(next.sales[0].orderType, "Dine-in");
  assert.equal(next.sales[0].business.name, "Night cart");
  assert.equal(next.sales[0].business.footer, "Come back soon");
  assert.equal(next.sales[0].notes, "No onion");
  old.settings.businessName = "Renamed";
  assert.equal(next.sales[0].business.name, "Night cart");
  assert.throws(
    () =>
      applyAction(next, {
        ...sale(),
        orderType: "Dine-in",
        orderReference: "Table 4",
        notes: "No onion",
      }),
    /another order/,
  );
});
test("analytics books returns on their actual date and preserves saved margins", () => {
  const d = normalizeState(state());
  d.sales = [
    {
      id: saleId,
      date: "2026-10-01T12:00:00Z",
      returnedAt: "2026-11-01T12:00:00Z",
      payment: "Cash",
      customer: "Walk-in",
      total: 10000,
      items: [{ id: pId, name: "Notebook", qty: 2, price: 5000, cost: 3000 }],
    },
    {
      id: secondId,
      date: "2026-11-01T06:00:00Z",
      payment: "UPI",
      customer: "Walk-in",
      total: 15000,
      items: [{ id: pId, name: "Notebook", qty: 3, price: 5000, cost: 3000 }],
    },
  ];
  const a = analyseStore(d, 7, new Date("2026-11-01T13:00:00Z"));
  assert.equal(a.sales, 15000);
  assert.equal(a.refunds, 10000);
  assert.equal(a.net, 5000);
  assert.equal(a.profit, 2000);
  assert.equal(a.orders, 1);
  assert.equal(a.payments.UPI, 15000);
  assert.equal(a.topItems[0].units, 1);
  assert.equal(a.daily.length, 7);
});
test("analytics compares equal periods using India calendar days and handles an empty store", () => {
  const d = normalizeState(state());
  d.sales = [
    {
      id: saleId,
      date: "2026-10-31T19:00:00Z",
      payment: "Cash",
      customer: "Walk-in",
      total: 5000,
      items: [{ id: pId, name: "Notebook", qty: 1, price: 5000, cost: 3000 }],
    },
    {
      id: secondId,
      date: "2026-10-20T12:00:00Z",
      payment: "Card",
      customer: "Walk-in",
      total: 2500,
      items: [{ id: pId, name: "Notebook", qty: 1, price: 2500, cost: 2000 }],
    },
  ];
  const a = analyseStore(d, 7, new Date("2026-11-01T13:00:00Z"));
  assert.equal(a.daily.at(-1).sales, 5000);
  assert.equal(a.previousNet, 2500);
  assert.equal(a.change, 100);
  const empty = analyseStore(
    normalizeState({}),
    30,
    new Date("2026-11-01T13:00:00Z"),
  );
  assert.equal(empty.net, 0);
  assert.equal(empty.average, 0);
  assert.equal(empty.change, null);
});

const trackedBill = (extra = {}) => ({
  type: "trackedBill",
  id: saleId,
  bill: {
    title: "Gas refill",
    description: "Cylinder refill",
    category: "Gas / fuel",
    amount: 120000,
    date: "2026-10-31",
    ...extra,
  },
});
test("bill tracking is dated, idempotent, editable and reversible without stock changes", () => {
  const old = normalizeState(state());
  const next = applyAction(old, trackedBill());
  assert.equal(next.bills[0].date, "2026-10-31");
  assert.equal(next.bills[0].amount, 120000);
  assert.equal(next.products[0].stock, 10);
  assert.strictEqual(applyAction(next, trackedBill()), next);
  const changed = applyAction(next, {
    ...trackedBill({ amount: 125000 }),
    originalRevision: 0,
  });
  assert.equal(changed.bills[0].revision, 1);
  assert.throws(
    () =>
      applyAction(changed, {
        ...trackedBill({ title: "Changed" }),
        originalRevision: 0,
      }),
    /changed/,
  );
  const archived = applyAction(changed, {
    type: "archiveBill",
    id: saleId,
    originalRevision: 1,
    archived: true,
  });
  assert.equal(archived.bills[0].archived, true);
  const restored = applyAction(archived, {
    type: "archiveBill",
    id: saleId,
    originalRevision: 2,
    archived: false,
  });
  assert.equal(restored.bills[0].archived, false);
});
test("bill validation rejects invalid dates, empty titles and negative amounts", () => {
  for (const b of [{ title: "" }, { date: "2026-02-30" }, { amount: -1 }])
    assert.equal(actionSchema.safeParse(trackedBill(b)).success, false);
});
test("old saved navigation gains Calendar and Bills without losing existing preferences", () => {
  const old = normalizeState({
    settings: {
      ...defaultSettings(),
      navigation: [
        "Checkout",
        "Inventory",
        "Restock",
        "Stock history",
        "Sales history",
        "Overview",
        "Google Sheets",
        "Settings",
      ],
      theme: "dark",
    },
  });
  assert.ok(old.settings.navigation.includes("Calendar"));
  assert.ok(old.settings.navigation.includes("Bills"));
  assert.equal(old.settings.theme, "dark");
  assert.deepEqual(old.bills, []);
});
test("restock preserves invoice tax and charges separately from stock item costs", () => {
  const next = applyAction(
    normalizeState(state()),
    restock({ tax: 9217, fees: 7788, invoiceTotal: 173305 }),
  );
  assert.equal(next.restocks[0].tax, 9217);
  assert.equal(next.restocks[0].fees, 7788);
  assert.equal(next.restocks[0].invoiceTotal, 173305);
  assert.equal(next.products[0].cost, 3200);
});
const { readTSV, parsePhotoInvoice } = await import(
  pathToFileURL(join(temp, "photo-invoice.mjs"))
);
test("photo table parser aligns sloped descriptions and excludes charge rows", () => {
  const words = [
    { text: "Qty", left: 500, top: 100, width: 30, height: 20 },
    { text: "Price", left: 600, top: 100, width: 40, height: 20 },
    { text: "UoM", left: 700, top: 100, width: 40, height: 20 },
    { text: "Sauce", left: 100, top: 145, width: 50, height: 20 },
    { text: "1", left: 510, top: 160, width: 10, height: 20 },
    { text: "245", left: 610, top: 160, width: 25, height: 20 },
    { text: "Other", left: 400, top: 210, width: 50, height: 20 },
    { text: "Charges", left: 460, top: 210, width: 60, height: 20 },
    { text: "Delivery", left: 100, top: 250, width: 70, height: 20 },
    { text: "1", left: 510, top: 250, width: 10, height: 20 },
    { text: "49", left: 610, top: 250, width: 20, height: 20 },
  ];
  const r = parsePhotoInvoice(
    words,
    "Invoice numbers: ZHPGJ27-00095854\nInvoice date: 31 Oct 2026",
  );
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].qty, "1");
  assert.equal(r.items[0].unitCost, "245");
  assert.equal(r.invoice, "ZHPGJ27-00095854");
  assert.equal(r.date, "2026-10-31");
});

const orderAction=(id=saleId,qty=2)=>actionSchema.parse({type:'createOrder',unlimited:false,id,actor:'chef.one',items:[{id:pId,qty,expectedPrice:5000}]});
test('kitchen order reserves stock once and payment creates one sale without a second deduction',()=>{
 const start=normalizeState(state()),a=orderAction();let s=applyAction(start,a);
 assert.equal(s.products[0].stock,8);assert.equal(s.sales.length,0);assert.equal(s.orders.length,1);
 assert.equal(applyAction(s,a),s);
 assert.throws(()=>applyAction(s,{...a,items:[{id:pId,qty:3,expectedPrice:5000}]}),/already used/);
 s=applyAction(s,{type:'orderPaid',id:saleId,payment:'UPI'});
 assert.equal(s.products[0].stock,8);assert.equal(s.sales.length,1);assert.equal(s.sales[0].payment,'UPI');assert.equal(s.sales[0].total,10000);assert.equal(s.orders[0].completedAt,undefined);
 assert.equal(applyAction(s,{type:'orderPaid',id:saleId,payment:'UPI'}),s);
 assert.throws(()=>applyAction(s,{type:'orderPaid',id:saleId,payment:'Cash'}),/another method/);
 s=applyAction(s,{type:'orderGiven',id:saleId});assert.ok(s.orders[0].completedAt);assert.equal(s.sales.length,1);
});
test('given-before-paid remains open; removal restores only not-given stock and blocks paid orders',()=>{
 const start=normalizeState(state());const a=orderAction();let s=applyAction(start,a);
 const cancelled=applyAction(s,{type:'cancelOrder',id:saleId,reason:'Customer changed mind'});
 assert.equal(cancelled.products[0].stock,10);assert.equal(cancelled.sales.length,0);assert.ok(cancelled.orders[0].cancelledAt);
 assert.equal(applyAction(cancelled,{type:'cancelOrder',id:saleId,reason:'Retry'}),cancelled);
 assert.throws(()=>applyAction(cancelled,{type:'orderPaid',id:saleId,payment:'Cash'}),/discarded or deleted/);
 s=applyAction(s,{type:'orderGiven',id:saleId});assert.equal(s.orders[0].completedAt,undefined);
 assert.equal(applyAction(s,{type:'cancelOrder',id:saleId,reason:'Removed after giving'}).products[0].stock,8);
 s=applyAction(s,{type:'orderPaid',id:saleId,payment:'Cash'});assert.ok(s.orders[0].completedAt);
 s=applyAction(s,{type:'return',saleId,reason:'Returned by customer'});assert.equal(s.products[0].stock,10);assert.ok(s.orders[0].cancelledAt);
});
test('kitchen reservations reject overselling, price changes, duplicate products and direct checkout collision',()=>{
 const start=normalizeState(state());assert.throws(()=>applyAction(start,orderAction(saleId,11)),/remain/);
 const a=orderAction();assert.throws(()=>applyAction(start,{...a,items:[{...a.items[0],expectedPrice:1}]}),/Price changed/);
 assert.throws(()=>applyAction(start,{...a,items:[a.items[0],a.items[0]]}),/twice/);
 const s=applyAction(start,a);assert.throws(()=>applyAction(s,sale()),/kitchen order/);
});
test('concurrent kitchen orders cannot reserve more than available stock; payment retries stay atomic',async()=>{
 const {db}=database();await commitAction(db,edit({id:'',stock:1}));const initial=await readState(db),pid=initial.products[0].id;
 const a={...orderAction(),items:[{id:pid,qty:1,expectedPrice:5000}]};
 const results=await Promise.allSettled([commitAction(db,a),commitAction(db,{...a,id:secondId})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 let s=await readState(db);assert.equal(s.products[0].stock,0);const payment={type:'orderPaid',id:s.orders[0].id,payment:'Cash'};
 await Promise.all([commitAction(db,payment),commitAction(db,payment)]);s=await readState(db);assert.equal(s.sales.length,1);assert.equal(s.products[0].stock,0);
});

const {swipeDestination}=await import(pathToFileURL(join(temp,"chef-gesture.mjs")));
test('swipe navigation follows horizontal direction and ignores vertical scrolls or taps',()=>{
 const start={x:200,y:200};assert.equal(swipeDestination(start,{x:80,y:220}),1);assert.equal(swipeDestination(start,{x:340,y:220}),0);assert.equal(swipeDestination(start,{x:220,y:500}),null);assert.equal(swipeDestination(start,{x:210,y:202}),null);assert.equal(swipeDestination(start,{x:300,y:300}),null);
});

const {toggleKitchenNote}=await import(pathToFileURL(join(temp,"quick-add.mjs")));
test('quick kitchen choices toggle without duplicating text and keep spicy choices consistent',()=>{
 assert.equal(toggleKitchenNote('Less spicy, No onion','Spicy'),'No onion, Spicy');
 assert.equal(toggleKitchenNote('Spicy, Extra sauce','Spicy'),'Extra sauce');
 assert.equal(toggleKitchenNote('No onion','No capsicum'),'No onion, No capsicum');
 assert.equal(toggleKitchenNote('no ONION','No onion'),'');
});
test('quick choices migrate old preferences and validate unique, bounded labels while allowing an empty list',()=>{
 const legacy=normalizeState(state());assert.deepEqual(legacy.settings.quickCustomers,['ttec','lj','repeat']);assert.ok(legacy.settings.quickKitchenNotes.includes('No capsicum'));assert.equal(legacy.settings.defaultOrderType,'Dine-in');
 const draft={...legacy.settings,quickCustomers:[],quickKitchenNotes:[]};assert.equal(actionSchema.safeParse({type:'settings',originalRevision:0,settings:draft}).success,true);
 for(const quickKitchenNotes of [['Spicy','spicy'],[''],Array.from({length:31},(_,i)=>'Note '+i),['x'.repeat(61)]])assert.equal(actionSchema.safeParse({type:'settings',originalRevision:0,settings:{...draft,quickKitchenNotes}}).success,false);
});

const {deliveredQuantity,deliveryProgress,orderSummary,inActiveQueue}=await import(pathToFileURL(join(temp,"delivery.mjs")));
const {groupMenu}=await import(pathToFileURL(join(temp,"menu-layout.mjs")));
test('partial delivery of two items stays in queue after payment until the second item is given',()=>{
 let s=applyAction(normalizeState(state()),orderAction());
 const deliver=(qty,expected)=>({type:'orderDelivery',id:saleId,productId:pId,deliveredQty:qty,expectedDelivered:expected});
 s=applyAction(s,deliver(1,0));assert.deepEqual(deliveryProgress(s.orders[0]),{given:1,total:2});assert.equal(s.orders[0].givenAt,undefined);
 assert.equal(applyAction(s,{type:'cancelOrder',id:saleId,reason:'Customer cancelled remainder'}).products[0].stock,9);
 s=applyAction(s,{type:'orderPaid',id:saleId,payment:'Cash'});assert.equal(s.orders[0].completedAt,undefined);assert.equal(s.products[0].stock,8);
 s=applyAction(s,deliver(2,1));assert.ok(s.orders[0].completedAt);assert.equal(s.sales.length,1);assert.equal(s.products[0].stock,8);
 assert.equal(applyAction(s,deliver(2,1)),s);assert.throws(()=>applyAction(s,deliver(1,2)),/read-only/);
});
test('large same-item orders support bounded progress, undo, stale-device checks and give-all',()=>{
 let s=applyAction(normalizeState(state()),orderAction(saleId,10));
 const deliver=(qty,expected)=>({type:'orderDelivery',id:saleId,productId:pId,deliveredQty:qty,expectedDelivered:expected});
 s=applyAction(s,deliver(5,0));assert.equal(deliveredQuantity(s.orders[0],pId),5);
 assert.throws(()=>applyAction(s,deliver(11,5)),/ordered quantity/);assert.throws(()=>applyAction(s,deliver(6,0)),/another device/);
 s=applyAction(s,deliver(4,5));assert.equal(deliveredQuantity(s.orders[0],pId),4);
 s=applyAction(s,{type:'orderGiven',id:saleId});assert.equal(deliveredQuantity(s.orders[0],pId),10);assert.ok(s.orders[0].givenAt);assert.equal(s.products[0].stock,0);
});
test('concurrent delivery updates to different lines keep both counts and never change stock',async()=>{
 const {db,sql}=await seeded();const other={...product,id:secondId,sku:'SECOND'};const s=normalizeState({...state(),products:[{...product},other]});sql.prepare('UPDATE store SET payload=? WHERE id=?').run(JSON.stringify(s),'main');
 await commitAction(db,{...orderAction(saleId,5),items:[{id:pId,qty:5,expectedPrice:5000},{id:secondId,qty:5,expectedPrice:5000}]});
 await Promise.all([commitAction(db,{type:'orderDelivery',id:saleId,productId:pId,deliveredQty:2,expectedDelivered:0}),commitAction(db,{type:'orderDelivery',id:saleId,productId:secondId,deliveredQty:3,expectedDelivered:0})]);
 const result=await readState(db);assert.equal(deliveredQuantity(result.orders[0],pId),2);assert.equal(deliveredQuantity(result.orders[0],secondId),3);assert.equal(result.products[0].stock,5);assert.equal(result.products[1].stock,5);
});
test('collapsed summaries include quantities and menu groups keep rolls left, fries right and water separate',()=>{
 const order={items:[{id:pId,name:'Classic Paneer Kathi Roll',qty:10}],givenAt:'2026-11-01T00:00:00Z'};
 assert.equal(orderSummary(order),'10× Classic Paneer Roll');assert.equal(deliveredQuantity(order,pId),10);
 const grouped=groupMenu([{name:'Crispy Veg Kathi Roll',category:'Kathi Rolls'},{name:'Salted Fries',category:'Fries'},{name:'Water Bottle Small',category:'Water'},{name:'Tea',category:'Drinks'}]);
 assert.equal(grouped.rolls.length,1);assert.equal(grouped.fries.length,1);assert.equal(grouped.water.length,1);assert.equal(grouped.other.length,1);
});

const editKitchen=(order,extra={})=>({type:'editOrder',id:order.id,originalRevision:order.revision||0,actor:'chef.one',customer:order.customer,notes:order.notes,orderType:order.orderType,orderReference:order.orderReference,items:order.items.map(i=>({id:i.id,qty:i.qty,expectedPrice:i.price})),...extra});
test('unpaid order edits adjust reserved stock and total exactly once',()=>{
 let s=applyAction(normalizeState(state()),orderAction());const a=editKitchen(s.orders[0],{customer:'Updated customer',notes:'No onion',items:[{id:pId,qty:3,expectedPrice:5000}]});
 s=applyAction(s,a);assert.equal(s.products[0].stock,7);assert.equal(s.orders[0].total,15000);assert.equal(s.orders[0].customer,'Updated customer');assert.equal(s.orders[0].revision,1);assert.equal(applyAction(s,a),s);assert.equal(s.sales.length,0);
 s=applyAction(s,editKitchen(s.orders[0],{items:[{id:pId,qty:1,expectedPrice:5000}]}));assert.equal(s.products[0].stock,9);assert.equal(s.orders[0].total,5000);
});
test('order edits add or remove lines, preserve quoted prices and reject insufficient stock',()=>{
 let start=normalizeState(state());start.products.push({...product,id:secondId,sku:'SECOND',price:7000});let s=applyAction(start,orderAction());
 const a=editKitchen(s.orders[0],{items:[{id:secondId,qty:2,expectedPrice:7000}]});s=applyAction(s,a);assert.equal(s.products[0].stock,10);assert.equal(s.products[1].stock,8);assert.equal(s.orders[0].total,14000);
 assert.throws(()=>applyAction(s,editKitchen(s.orders[0],{items:[{id:secondId,qty:20,expectedPrice:7000}]})),/stock/);
 assert.throws(()=>applyAction(s,editKitchen(s.orders[0],{items:[{id:secondId,qty:3,expectedPrice:1}]})),/price changed/);
});
test('delivery changes invalidate old editors, given quantities cannot be removed, and paid orders leave the queue',()=>{
 let s=applyAction(normalizeState(state()),orderAction());const stale=editKitchen(s.orders[0],{notes:'Stale edit'});
 s=applyAction(s,{type:'orderDelivery',id:saleId,productId:pId,deliveredQty:1,expectedDelivered:0});assert.throws(()=>applyAction(s,stale),/another device/);
 assert.throws(()=>applyAction(s,editKitchen(s.orders[0],{items:[{id:pId,qty:0,expectedPrice:5000}]})),/already served/);
 const trimmed=applyAction(s,editKitchen(s.orders[0],{items:[{id:pId,qty:1,expectedPrice:5000}]}));assert.ok(trimmed.orders[0].givenAt);assert.equal(trimmed.products[0].stock,9);
 assert.equal(inActiveQueue(s.orders[0]),true);s=applyAction(s,{type:'orderPaid',id:saleId,payment:'Cash'});assert.equal(inActiveQueue(s.orders[0]),false);assert.equal(s.orders[0].completedAt,undefined);
 assert.throws(()=>applyAction(s,editKitchen(s.orders[0],{notes:'Cannot change paid order'})),/Only unpaid/);assert.throws(()=>applyAction(s,{type:'cancelOrder',id:saleId,reason:'Remove paid'}),/Paid orders/);
});
test('concurrent edit and payment produce one consistent immutable sale',async()=>{
 const {db}=await seeded();let s=await commitAction(db,orderAction());const edit=editKitchen(s.orders[0],{items:[{id:pId,qty:3,expectedPrice:5000}]});
 await Promise.allSettled([commitAction(db,edit),commitAction(db,{type:'orderPaid',id:saleId,payment:'UPI'})]);
 s=await readState(db);assert.equal(s.sales.length,1);assert.equal(s.sales[0].total,s.orders[0].total);assert.equal(s.products[0].stock,10-s.orders[0].items[0].qty);assert.equal(inActiveQueue(s.orders[0]),false);
});

const {availableUnits,projectState,inferPack}=await import(pathToFileURL(join(temp,'recipes.mjs')));
const {orderedMenu}=await import(pathToFileURL(join(temp,'menu-layout.mjs')));
const ingredientId='00000000-0000-4000-8000-000000000010', wrapperId='00000000-0000-4000-8000-000000000011';
function recipeState(){const s=normalizeState(state());s.products[0].recipeEnabled=true;s.products[0].recipe=[{ingredientId,qty:50},{ingredientId:wrapperId,qty:1}];s.ingredients=[{id:ingredientId,name:'Paneer',unit:'g',stock:1000,unitCost:20,unitsPerPack:1000,aliases:[],revision:0,archived:false},{id:wrapperId,name:'Wrap',unit:'pcs',stock:10,unitCost:500,unitsPerPack:1,aliases:[],revision:0,archived:false}];return s;}
test('recipes reserve ingredients once, preserve manual stock and refund original usage after recipe changes',()=>{
 let s=recipeState();assert.equal(availableUnits(s,s.products[0]),10);s=applyAction(s,orderAction());assert.equal(s.ingredients[0].stock,900);assert.equal(s.ingredients[1].stock,8);assert.equal(s.products[0].stock,10);assert.equal(projectState(s).products[0].stock,8);assert.equal(s.orders[0].items[0].cost,1500);assert.strictEqual(applyAction(s,orderAction()),s);
 s=applyAction(s,{type:'recipe',productId:pId,originalRevision:s.products[0].revision,enabled:true,lines:[{ingredientId,qty:100}]});
 s=applyAction(s,{type:'orderDelivery',id:saleId,productId:pId,expectedDelivered:0,deliveredQty:1});s=applyAction(s,{type:'cancelOrder',id:saleId,reason:'Customer cancelled'});assert.equal(s.ingredients[0].stock,950);assert.equal(s.ingredients[1].stock,9);
});
test('recipe payment does not consume twice and return restores original recipe snapshot',()=>{
 let s=applyAction(recipeState(),orderAction());s=applyAction(s,{type:'orderPaid',id:saleId,payment:'Cash'});assert.equal(s.ingredients[0].stock,900);s.products[0].recipe=[{ingredientId,qty:200}];s=applyAction(s,{type:'return',saleId,reason:'Unused order refunded'});assert.equal(s.ingredients[0].stock,1000);assert.equal(s.ingredients[1].stock,10);assert.strictEqual(applyAction(s,{type:'return',saleId,reason:'Retry'}),s);
});
test('shared ingredients cannot oversell and menu replacement releases stock before reserving',()=>{
 const initial=recipeState();initial.ingredients[1].stock=2;initial.products.push({...initial.products[0],id:secondId,name:'Second roll',recipe:[{ingredientId,qty:50},{ingredientId:wrapperId,qty:1}]});let s=applyAction(initial,orderAction());assert.throws(()=>applyAction(s,{...orderAction(crypto.randomUUID()),items:[{id:secondId,qty:1,expectedPrice:5000}]}),/remain/);
 s=applyAction(s,{type:'editOrder',id:saleId,originalRevision:0,customer:'',notes:'',orderType:'Dine-in',orderReference:'',actor:'chef',items:[{id:secondId,qty:2,expectedPrice:5000}]});assert.equal(s.ingredients[1].stock,0);assert.equal(s.ingredients[0].stock,900);
});
test('Hyperpure receipts convert packs into base units, are idempotent and reject duplicate attachments',()=>{
 let s=recipeState();const receipt=actionSchema.parse({type:'ingredientReceipt',id:secondId,billId:bill,supplier:'Hyperpure',invoice:'INV-R1',invoiceDate:'2026-11-01',lines:[{ingredientId,packs:6,packSize:1000,packCost:13000,description:'Paneer 1 Kg'}]});s=applyAction(s,receipt);assert.equal(s.ingredients[0].stock,7000);assert.equal(s.ingredients[0].unitCost,13);assert.equal(s.ingredientReceipts[0].total,78000);assert.strictEqual(applyAction(s,receipt),s);assert.throws(()=>applyAction(s,{...receipt,id:crypto.randomUUID()}),/already/);assert.throws(()=>applyAction(s,restock({billId:bill})),/already/);
 assert.deepEqual(inferPack('Sauce 5 Kg'),{unit:'g',size:5000});assert.deepEqual(inferPack('Ketchup 1.2 Kg'),{unit:'g',size:1200});assert.deepEqual(inferPack('Oil 1 L'),{unit:'ml',size:1000});assert.deepEqual(inferPack('Bottle 200 ml'),{unit:'ml',size:200});
});
test('admin can hide a paid order while retaining sales and stock',()=>{
 let s=applyAction(normalizeState(state()),orderAction());s=applyAction(s,{type:'orderPaid',id:saleId,payment:'UPI'});const before=structuredClone(s.sales),stock=s.products[0].stock;s=applyAction(s,{type:'archiveOrder',id:saleId,originalRevision:s.orders[0].revision,reason:'Admin removed order'});assert.ok(s.orders[0].hiddenAt);assert.equal(inActiveQueue(s.orders[0]),false);assert.deepEqual(s.sales,before);assert.equal(s.products[0].stock,stock);
});
test('menu sequence survives settings round-trip and sorts within the existing lanes',()=>{
 const products=[{id:pId,name:'A roll',category:'Rolls'},{id:secondId,name:'B roll',category:'Rolls'},{id:saleId,name:'Fries',category:'Fries'}];const s=normalizeState(state()),order=[secondId,saleId,pId];const a=actionSchema.parse({type:'settings',originalRevision:0,settings:{...s.settings,menuOrder:order,quickCustomers:['lj','ttec'],quickKitchenNotes:['No onion','Spicy']}});const saved=applyAction(s,a);assert.deepEqual(saved.settings.menuOrder,order);assert.deepEqual(groupMenu(orderedMenu(products,saved.settings.menuOrder)).rolls.map(p=>p.id),[secondId,pId]);assert.deepEqual(products.map(p=>p.id),[pId,secondId,saleId]);assert.equal(actionSchema.safeParse({...a,settings:{...a.settings,menuOrder:[pId,pId]}}).success,false);
});
test('horizontal swipe destinations traverse three sections and respect bounds',()=>{assert.equal(swipeDestination({x:500,y:200},{x:300,y:205},1),2);assert.equal(swipeDestination({x:300,y:200},{x:500,y:205},2),1);assert.equal(swipeDestination({x:500,y:200},{x:300,y:205},2),2)});

test('current ordering has no stock limit and does not reserve finished menu stock',()=>{
 const s=normalizeState(state());s.products[0].stock=0;const a=actionSchema.parse({type:'createOrder',id:saleId,customer:'New',orderType:'Dine-in',orderReference:'1',items:[{id:pId,qty:20,expectedPrice:5000}]});const placed=applyAction(s,a);assert.equal(placed.orders[0].items[0].qty,20);assert.equal(placed.products[0].stock,0);assert.deepEqual(placed.orders[0].items[0].ingredientUsage,[]);assert.equal(placed.orders[0].rawInventoryOnly,true);assert.strictEqual(applyAction(placed,a),placed);
 const paid=applyAction(placed,{type:'orderPaid',id:saleId,payment:'Cash'});assert.equal(paid.sales[0].total,100000);assert.equal(paid.products[0].stock,0);
});
test('unlimited recipe orders record negative raw balances and edits/cancellation restore original quantities',()=>{
 let s=recipeState();const action=actionSchema.parse({type:'createOrder',id:saleId,items:[{id:pId,qty:30,expectedPrice:5000}]});s=applyAction(s,action);assert.equal(s.ingredients[0].stock,-500);assert.equal(s.ingredients[1].stock,-20);assert.equal(projectState(s).products[0].stock,0);assert.equal(s.products[0].stock,10);
 s=applyAction(s,{type:'editOrder',unlimited:true,id:saleId,originalRevision:0,actor:'chef',customer:'New',notes:'',orderType:'Takeaway',orderReference:'',items:[{id:pId,qty:35,expectedPrice:5000}]});assert.equal(s.ingredients[0].stock,-750);assert.equal(s.ingredients[1].stock,-25);s=applyAction(s,{type:'cancelOrder',id:saleId,reason:'Cancelled before cooking'});assert.equal(s.ingredients[0].stock,1000);assert.equal(s.ingredients[1].stock,10);
});
test('current admin navigation keeps raw inventory and menu, removing finished stock history and checkout',()=>{
 const s=normalizeState({...state(),settings:{navigation:['Checkout','Inventory','Stock history','Ingredients & recipes'],hiddenSections:[]}});assert.ok(s.settings.navigation.includes('Inventory'));assert.ok(s.settings.navigation.includes('Menu'));assert.ok(!s.settings.navigation.includes('Stock history'));assert.ok(!s.settings.navigation.includes('Checkout'));assert.ok(!s.settings.navigation.includes('Ingredients & recipes'));
});

test('order deletion needs no reason, logs the actor and remains idempotent',()=>{
 let s=applyAction(normalizeState(state()),{...orderAction(),actor:'chef.creator'});assert.equal(s.orders[0].events[0].action,'Created');assert.equal(s.orders[0].events[0].by,'chef.creator');const editPayload={type:'editOrder',id:saleId,originalRevision:0,actor:'chef.editor',customer:'Updated',notes:'',orderType:'Dine-in',orderReference:'2',items:[{id:pId,qty:3,expectedPrice:5000}]};s=applyAction(s,editPayload);assert.equal(s.orders[0].events.at(-1).action,'Edited');assert.equal(s.orders[0].events.at(-1).by,'chef.editor');const cancellation=actionSchema.parse({type:'cancelOrder',id:saleId,actor:'chef.manager'});s=applyAction(s,cancellation);assert.equal(s.orders[0].events.at(-1).action,'Deleted');assert.equal(s.orders[0].events.at(-1).by,'chef.manager');assert.ok(s.orders[0].cancelledAt);assert.strictEqual(applyAction(s,cancellation),s);assert.equal(s.orders[0].events.filter(e=>e.action==='Deleted').length,1);
});
test('paid order deletion keeps activity and financial records without a reason',()=>{
 let s=applyAction(normalizeState(state()),orderAction());s=applyAction(s,{type:'orderPaid',id:saleId,payment:'Cash',actor:'cashier'});const a=actionSchema.parse({type:'archiveOrder',id:saleId,originalRevision:s.orders[0].revision,actor:'admin.one'});s=applyAction(s,a);assert.deepEqual(s.orders[0].events.map(e=>e.action),['Created','Paid','Deleted']);assert.equal(s.orders[0].events.at(-1).by,'admin.one');assert.equal(s.sales.length,1);assert.ok(s.orders[0].hiddenAt);
});


const {changeCart,removeCartItem}=await import(pathToFileURL(join(temp,'cart.mjs')));
const {menuArtCell}=await import(pathToFileURL(join(temp,'menu-images.mjs')));
test('cart follows tap order rather than menu order and re-added items append at the bottom',()=>{
 let cart={};cart=changeCart(cart,secondId,1);cart=changeCart(cart,pId,1);cart=changeCart(cart,saleId,1);assert.deepEqual(Object.keys(cart),[secondId,pId,saleId]);cart=changeCart(cart,secondId,1);assert.deepEqual(Object.keys(cart),[secondId,pId,saleId]);assert.equal(cart[secondId],2);const original=structuredClone(cart);cart=removeCartItem(cart,pId);assert.deepEqual(original,{[secondId]:2,[pId]:1,[saleId]:1});cart=changeCart(cart,pId,1);assert.deepEqual(Object.keys(cart),[secondId,saleId,pId]);cart=changeCart(cart,pId,-1);assert.equal(pId in cart,false);assert.deepEqual(changeCart({},pId,-1),{});
});
test('food and water tiles each select their correct illustration',()=>{
 const names=['Crispy Veg Kathi Roll','Classic Paneer Kathi Roll','Magic Mushroom Kathi Roll','Salted Fries','Peri Peri Fries','Cheesy Peri Peri Fries','Loaded Fries','Water Bottle Small','Water Bottle Big'];assert.deepEqual(names.map(menuArtCell),[[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]]);
});


const {nextOrderNumber,orderStatus}=await import(pathToFileURL(join(temp,'delivery.mjs')));
test('order numbers reset at India midnight and retain numbers used by deleted or discarded orders',()=>{
 const s=normalizeState(state());let next=applyAction(s,orderAction(), '2026-11-01T18:20:00.000Z');assert.equal(next.orders[0].number,'001');next=applyAction(next,orderAction(secondId), '2026-11-01T18:29:00.000Z');assert.equal(next.orders[0].number,'002');next=applyAction(next,{type:'discardOrder',id:secondId,actor:'chef'},'2026-11-01T18:29:10.000Z');assert.equal(orderStatus(next.orders[0]),'Discarded');assert.equal(nextOrderNumber(next.orders,'2026-11-01T18:29:50.000Z'),'003');next=applyAction(next,orderAction(crypto.randomUUID()),'2026-11-01T18:30:00.000Z');assert.equal(next.orders[0].number,'001');assert.equal(nextOrderNumber(next.orders,'2026-11-01T18:31:00.000Z'),'002');
});
test('discard, delete and completed history keep distinct states and discard releases only unserved reservations',()=>{
 let s=applyAction(recipeState(),{...orderAction(),unlimited:true});s=applyAction(s,{type:'orderDelivery',id:saleId,productId:pId,expectedDelivered:0,deliveredQty:1});s=applyAction(s,{type:'discardOrder',id:saleId,actor:'chef.manager'});assert.equal(orderStatus(s.orders[0]),'Discarded');assert.equal(s.ingredients[0].stock,950);assert.equal(s.orders[0].events.at(-1).action,'Discarded');assert.strictEqual(applyAction(s,{type:'discardOrder',id:saleId}),s);s=applyAction(s,{type:'archiveOrder',id:saleId,originalRevision:s.orders[0].revision,reason:'Order deleted',actor:'admin'});assert.equal(orderStatus(s.orders[0]),'Deleted');assert.equal(s.ingredients[0].stock,950);
 let complete=applyAction(normalizeState(state()),orderAction());complete=applyAction(complete,{type:'orderGiven',id:saleId});complete=applyAction(complete,{type:'orderPaid',id:saleId,payment:'Cash'});assert.equal(orderStatus(complete.orders[0]),'Completed');complete=applyAction(complete,{type:'archiveOrder',id:saleId,originalRevision:complete.orders[0].revision,reason:'Order deleted'});assert.equal(orderStatus(complete.orders[0]),'Deleted');assert.equal(complete.sales.length,1);
});


const {createSwipeTracker}=await import(pathToFileURL(join(temp,'chef-gesture.mjs')));
const point=(x,y,id=1)=>({identifier:id,clientX:x,clientY:y});
test('one-finger horizontal swipe changes sections; taps, two fingers and excluded controls do not',()=>{const t=createSwipeTracker();t.begin([point(300,200)]);assert.equal(t.move([point(200,202)]),true);assert.equal(t.end([point(180,202)],0),1);t.begin([point(300,200),point(320,200,2)]);assert.equal(t.end([point(100,200)],0),null);t.begin([point(300,200)],false);assert.equal(t.end([point(100,200)],0),null);t.begin([point(300,200)]);assert.equal(t.end([point(298,200)],0),null);});
test('vertical cart scrolling locks out sideways drift and extra fingers cancel navigation',()=>{const t=createSwipeTracker();t.begin([point(200,100)]);assert.equal(t.move([point(202,150)]),false);assert.equal(t.end([point(50,155)],0),null);t.begin([point(200,100)]);assert.equal(t.move([point(150,100),point(160,100,2)]),false);assert.equal(t.end([point(50,100)],0),null);t.begin([point(200,100)]);t.cancel();assert.equal(t.end([point(50,100)],0),null);});

test('custom reset time groups orders across midnight and settings changes keep server-owned report start time',()=>{const initial=normalizeState(state());initial.settings.orderResetTime='04:00';let s=applyAction(initial,orderAction(),'2026-11-01T21:00:00.000Z');assert.equal(s.orders[0].businessDay,'2026-11-01');s=applyAction(s,orderAction(secondId),'2026-11-01T22:20:00.000Z');assert.equal(s.orders[0].number,'002');s=applyAction(s,orderAction(crypto.randomUUID()),'2026-11-01T22:30:00.000Z');assert.equal(s.orders[0].number,'001');const settings={...s.settings,dailyReportEnabled:true,reportSender:'reports@example.com',reportStartAt:'2000-01-01'};s=applyAction(s,actionSchema.parse({type:'settings',originalRevision:0,settings}),'2026-11-02T10:00:00.000Z');assert.equal(s.settings.reportStartAt,'2026-11-02T10:00:00.000Z');s=applyAction(s,{type:'settings',originalRevision:1,settings:{...s.settings,theme:'dark',reportStartAt:'1999-01-01'}},'2026-11-02T11:00:00.000Z');assert.equal(s.settings.reportStartAt,'2026-11-02T10:00:00.000Z');assert.equal(actionSchema.safeParse({type:'settings',originalRevision:2,settings:{...s.settings,orderResetTime:'25:12'}}).success,false);assert.equal(actionSchema.safeParse({type:'settings',originalRevision:2,settings:{...s.settings,reportSender:'officialrollit@gmail.com'}}).success,false);});

test('manual raw-material additions retain optional bills, including bill-only edits',()=>{let s=recipeState();const i=s.ingredients[0];const a=actionSchema.parse({type:'ingredient',...i,stock:i.stock+500,originalRevision:i.revision,billId:bill,reason:'Manual delivery'});s=applyAction(s,a);assert.deepEqual(s.ingredients[0].billIds,[bill]);assert.equal(s.ingredientMovements[0].billId,bill);const secondBill='b'.repeat(64);s=applyAction(s,actionSchema.parse({type:'ingredient',...s.ingredients[0],originalRevision:s.ingredients[0].revision,billId:secondBill,reason:'Attach supplier document'}));assert.deepEqual(s.ingredients[0].billIds,[bill,secondBill]);assert.equal(s.ingredients[0].stock,1500);});
