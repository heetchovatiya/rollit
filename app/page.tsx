"use client";
import { RollitLogo } from "@/components/pos/rollit-logo";
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ShoppingBag,
  Package,
  Receipt,
  BarChart3,
  Sheet,
  Plus,
  Search,
  ArrowUpRight,
  X,
  Minus,
  Check,
  RefreshCw,
  ArrowDownUp,
  Truck,
  CalendarDays,
  FileText,
  Settings,
  Users,
  ChefHat,
  Moon,
  Sun,
} from "lucide-react";
import type {
  Product as StoredProduct,
  ProductDraft as Product,
  Sale,
  StoreState,
} from "@/lib/pos/types";
import { actionSchema, type StoreAction } from "@/lib/pos/validation";
import { money, downloadCsv } from "@/lib/pos/format";
import { SalesHistory } from "@/components/pos/sales-history";
import { StockHistory } from "@/components/pos/stock-history";
import { Restocks } from "@/components/pos/restocks";
import { BillUpload, type UploadedBill } from "@/components/pos/bill-upload";
import {
  defaultSettings,
  initials,
  type BusinessSettings,
  type Section,
} from "@/lib/pos/settings";
import { SettingsPanel } from "@/components/pos/settings-panel";
import { CalendarPanel } from "@/components/pos/calendar-panel";
import { BillsPanel } from "@/components/pos/bills-panel";
import { dayKey } from "@/lib/pos/analytics";
import { Overview } from "@/components/pos/overview";
import { QuickChoices } from "@/components/pos/quick-choices";
import { IngredientsPanel } from "@/components/pos/ingredients-panel";
import { UsersPanel } from "@/components/pos/users-panel";
import {OrderActivity} from "@/components/pos/order-activity";
import { OrderQueue } from "@/components/pos/order-queue";
import { SessionMenu } from "@/components/pos/session-menu";
import { Dialog } from "@/components/pos/dialog";
const blank = {
  id: "",
  name: "",
  sku: "",
  category: "General",
  price: 0,
  cost: 0,
  stock: 0,
  low: 5,
};
export default function Home() {
  const [tab, setTab] = useState("Overview"),
    [data, setData] = useState<StoreState>({
      products: [],
      sales: [],
      movements: [],
      restocks: [],
      bills: [],
      ingredients:[],
      ingredientMovements:[],
      ingredientReceipts:[],
      orders: [],
      settings: defaultSettings(),
    }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("All items"),
    [cart, setCart] = useState<Record<string, number>>({}),
    [edit, setEdit] = useState<Product | null>(null),
    [payment, setPayment] = useState("Cash"),
    [customer, setCustomer] = useState(""),
    [receipt, setReceipt] = useState<Sale | null>(null);
  const [previewSettings, setPreviewSettings] =
    useState<BusinessSettings | null>(null);
  const settings = data.settings;
  const appearance = previewSettings || settings;
  const [orderType, setOrderType] = useState<
      "Takeaway" | "Dine-in" | "Delivery"
    >("Takeaway"),
    [orderReference, setOrderReference] = useState(""),
    [kitchenNotes, setKitchenNotes] = useState("");
  const [ingredientUpload,setIngredientUpload]=useState(false);
  const defaulted = useRef(false);
  const responseVersion = useRef(0);
  useEffect(() => {
    if (loading && !previewSettings) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      const root = document.documentElement;
      root.dataset.theme =
        appearance.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : appearance.theme;
      root.dataset.accent = "orange";
    }
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance.theme, appearance.accent, loading]);
  useEffect(() => {
    if (loading) return;
    try {
      localStorage.setItem("roll-it-theme", settings.theme);
      localStorage.setItem("roll-it-accent", settings.accent);
    } catch {}
  }, [settings.theme, settings.accent, loading]);
  useEffect(() => {
    if (
      !loading &&
      !pendingOrder.current &&
      (!defaulted.current || Object.keys(cart).length === 0)
    ) {
      setPayment(settings.defaultPayment);
      setOrderType(settings.defaultOrderType);
      defaulted.current = true;
    }
  }, [loading, settings.defaultPayment, settings.defaultOrderType]);
  async function toggleTheme() {
    const theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    const updated = await save({
      type: "settings",
      originalRevision: settings.revision,
      settings: { ...settings, theme },
    });
    if (updated) setNotice("Theme saved to your workspace.");
  }
  function go(section: Section) {
    if(section!=="Inventory")setIngredientUpload(false);
    setTab(section);
    setQuery("");
    setCategory("All items");
  }
  const [calendarDay, setCalendarDay] = useState(() => dayKey(new Date()));
  const saleId = useRef("");
  const saveFailure = useRef<{ status: number; error: string }>({
    status: 503,
    error: "Unable to save changes.",
  });
  const [productBill, setProductBill] = useState<UploadedBill | null>(null),
    [billUploading, setBillUploading] = useState(false);
  const requestBusy = useRef(false);
  const pendingOrder = useRef<Extract<StoreAction, { type: "sale" }> | null>(
    null,
  );
  const [pending, setPending] = useState(false),
    [showArchived, setShowArchived] = useState(false),
    [returnSale, setReturnSale] = useState<Sale | null>(null),
    [returnReason, setReturnReason] = useState("");
  function finishSale(state: StoreState, id: string) {
    const sale = state.sales.find((s) => s.id === id);
    if (!sale) return false;
    setReceipt(sale);
    setCart({});
    setCustomer("");
    setOrderReference("");
    setKitchenNotes("");
    setOrderType(state.settings.defaultOrderType);
    setPayment(state.settings.defaultPayment);
    saleId.current = "";
    pendingOrder.current = null;
    try {
      sessionStorage.removeItem("roll-it-pending-sale");
    } catch {}
    setPending(false);
    setNotice("Sale recorded and stock updated.");
    return true;
  }
  function openProduct(p: StoredProduct) {
    setProductBill(null);
    setError("");
    setEdit({
      ...p,
      originalStock: p.stock,
      originalRevision: p.revision || 0,
      note: "",
    });
  }

  async function load() {
    const version = ++responseVersion.current;
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/pos");
      if(r.status===401){window.location.assign("/login");return null;}
      const j = (await r.json()) as StoreState & { error?: string };
      if (!r.ok) throw Error(j.error || "Unable to load the store.");
      if (version !== responseVersion.current) return j;
      setData(j);
      if (pendingOrder.current) finishSale(j, pendingOrder.current.id);
      return j;
    } catch (e) {
      if (version !== responseVersion.current) return null;
      setError(e instanceof Error ? e.message : "Unable to refresh the store.");
      return null;
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("roll-it-pending-sale");
      if (stored) {
        const result = actionSchema.safeParse(JSON.parse(stored));
        if (result.success && result.data.type === "sale") {
          const order = result.data;
          pendingOrder.current = order;
          saleId.current = order.id;
          setPending(true);
          setCart(
            Object.fromEntries(order.items.map((item) => [item.id, item.qty])),
          );
          setCustomer(order.customer);
          setPayment(order.payment);
          setOrderType(order.orderType);
          setOrderReference(order.orderReference);
          setKitchenNotes(order.notes);
        } else sessionStorage.removeItem("roll-it-pending-sale");
      }
    } catch {
      /* Browser storage is optional; the backend still protects retries. */
    }
    load();
  }, []);
  async function save(action: unknown) {
    if (requestBusy.current) return null;
    requestBusy.current = true;
    responseVersion.current++;
    saveFailure.current = {
      status: 503,
      error: "Unable to confirm the request. Retry safely.",
    };
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if(r.status===401){window.location.assign("/login");return null;}
      const j = (await r.json()) as StoreState & { error?: string };
      if (!r.ok) {
        saveFailure.current = {
          status: r.status,
          error: j.error || "Unable to save changes.",
        };
        if ([400, 409, 413, 415].includes(r.status) && pendingOrder.current) {
          pendingOrder.current = null;
          try {
            sessionStorage.removeItem("roll-it-pending-sale");
          } catch {}
          setPending(false);
          saleId.current = "";
        }
        throw Error(j.error || "Unable to save changes.");
      }
      setData(j);
      return j;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection lost. Refresh to check the last operation.",
      );
      return null;
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  }
  const activeProducts = data.products.filter((p) => !p.archived);
  const completedSales = data.sales.filter((s) => !s.returnedAt);
  const items = (
    tab === "Menu"
      ? data.products.filter((p) => !!p.archived === showArchived)
      : activeProducts
  )
    .filter(
      (p) =>
        p.name.toLowerCase().includes(query.toLowerCase()) ||
        p.sku.toLowerCase().includes(query.toLowerCase()),
    )
    .filter((p) => category === "All items" || p.category === category);
  const lines = Object.entries(cart)
    .map(([id, qty]) => ({ p: data.products.find((p) => p.id === id)!, qty }))
    .filter((x) => x.p);
  const total = pendingOrder.current
    ? pendingOrder.current.items.reduce(
        (n, i) => n + i.expectedPrice * i.qty,
        0,
      )
    : lines.reduce((n, { p, qty }) => n + p.price * qty, 0);
  const today = completedSales.filter(
    (s) => new Date(s.date).toDateString() === new Date().toDateString(),
  );
  const rawMaterials=data.ingredients.filter(i=>!i.archived);
  const low = rawMaterials.filter(i=>i.stock<=0);
  function add(p: Product) {
    if (busy || pending || (cart[p.id] || 0) >= p.stock) return;
    setCart({ ...cart, [p.id]: (cart[p.id] || 0) + 1 });
    saleId.current = "";
  }
  function quantity(id: string, change: number) {
    if (busy || pending) return;
    const n = (cart[id] || 0) + change;
    const next = { ...cart };
    if (n <= 0) delete next[id];
    else next[id] = n;
    setCart(next);
    saleId.current = "";
  }
  async function checkout() {
    if (busy || requestBusy.current || (!pending && !lines.length)) return;
    saleId.current ||= crypto.randomUUID();
    const action = pendingOrder.current || {
      type: "sale" as const,
      id: saleId.current,
      payment: payment as Sale["payment"],
      customer,
      orderType,
      orderReference,
      notes: kitchenNotes,
      items: lines.map(({ p, qty }) => ({
        id: p.id,
        qty,
        expectedPrice: p.price,
      })),
    };
    pendingOrder.current = action;
    try {
      sessionStorage.setItem("roll-it-pending-sale", JSON.stringify(action));
    } catch {}
    setPending(true);
    const j = await save(action);
    if (j) finishSale(j, action.id);
  }
  async function archive(p: StoredProduct) {
    const j = await save({
      type: "archive",
      productId: p.id,
      archived: !p.archived,
      originalRevision: p.revision || 0,
    });
    if (j) {
      setCart((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setNotice(
        p.archived
          ? "Product restored."
          : "Product archived. Existing receipts are preserved.",
      );
    }
  }
  function csv(kind: string) {
    if(kind==="Inventory")downloadCsv("roll-it-raw-materials.csv",[["Name","Base unit","On hand","Cost per base unit (INR)","Units per pack"],...data.ingredients.filter(i=>!i.archived).map(i=>[i.name,i.unit,i.stock,i.unitCost/100,i.unitsPerPack])]);
    else if(kind==="Menu")downloadCsv("roll-it-menu.csv",[["SKU","Name","Category","Price","Status"],...data.products.map(p=>[p.sku,p.name,p.category,p.price/100,p.archived?'Archived':'Active'])]);
    else
      downloadCsv("roll-it-sales.csv", [
        [
          "Sale ID",
          "Date",
          "Customer",
          "Payment",
          "Total",
          "Status",
          "Returned at",
        ],
        ...data.sales.map((s) => [
          s.id,
          s.date,
          s.customer,
          s.payment,
          s.total / 100,
          s.returnedAt ? "Returned" : "Completed",
          s.returnedAt || "",
        ]),
      ]);
  }
  function scan() {
    if (busy || pending) return;
    const product = activeProducts.find(
      (p) => p.sku.toLowerCase() === query.trim().toLowerCase(),
    );
    if (!product) {
      setError("No product matches that exact SKU.");
      return;
    }
    if ((cart[product.id] || 0) >= product.stock) {
      setError("No more stock available for this product.");
      return;
    }
    add(product);
    setQuery("");
    setNotice(product.name + " added to the order.");
  }
  return (
    <div
      className="shell"
      data-density={appearance.density}
      data-sidebar={appearance.sidebar}
      data-catalog={appearance.productView}
      data-cart-position={appearance.cartPosition}
      data-width={appearance.width}
      data-text-size={appearance.textSize}
      data-stats={appearance.showStats ? "show" : "hide"}
      data-stock={appearance.showStock ? "show" : "hide"}
      data-sku={appearance.showSku ? "show" : "hide"}
      style={{ "--product-columns": appearance.columns } as React.CSSProperties}
    >
      <aside className="sidebar">
        <button
          className="brand"
          aria-label="Open business profile"
          onClick={() => go("Settings")}
        >
          <span className="logo">
            <RollitLogo alt="Roll-IT" />
          </span>
          <div>
            {settings.businessName}
            <span>FOOD CART POS</span>
          </div>
        </button>
        <small className="navlabel">WORKSPACE</small>
        <nav>
          {appearance.navigation
            .filter((name) => !appearance.hiddenSections.includes(name))
            .map((name) => {
              const icons: Record<Section, LucideIcon> = {
                Inventory: Package,
                Menu: ShoppingBag,
                Restock: Truck,
                "Sales history": Receipt,
                Overview: BarChart3,
                Calendar: CalendarDays,
                Orders: ChefHat,
                "Activity log": FileText,
                Users: Users,
                Bills: FileText,
                "Google Sheets": Sheet,
                Settings,
              };
              const Icon = icons[name];
              return (
                <button
                  key={name}
                  title={name}
                  aria-label={name}
                  aria-current={tab === name ? "page" : undefined}
                  className={tab === name ? "active" : ""}
                  onClick={() => {
                    setTab(name);
                    setQuery("");
                    setCategory("All items");
                  }}
                >
                  <Icon size={19} />
                  <span className="nav-name">
                    {name === "Settings" ? "Profile & settings" : name}
                  </span>
                  {name === "Inventory" && low.length > 0 && (
                    <b>{low.length}</b>
                  )}
                </button>
              );
            })}
        </nav>
        <div className="sidebottom">
          <div className="live">
            <i /> Cloudflare database
          </div>
          <p>Your shop. All together.</p>
          <button
            className="profile-link"
            onClick={() => go("Settings")}
            aria-label="Edit your profile"
          >
            <span className="avatar">
              {initials(settings.ownerName || settings.businessName)}
            </span>
            <strong>
              {settings.ownerName || settings.businessName}
              <small>Private food-cart workspace</small>
            </strong>
          </button>
        </div>
      </aside>
      <main>
        <SessionMenu admin/><header>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{tab}</strong>
          </div>
          <div className="topright">
            <button
              className="calendar-trigger"
              aria-label="Open daily calendar"
              title="Browse past days"
              onClick={() => go("Calendar")}
            >
              <CalendarDays size={18} />
            </button>
            <span>
              {new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
            <button
              aria-label="Refresh store"
              onClick={load}
              disabled={busy || loading}
            >
              <RefreshCw size={17} />
            </button>
            <button
              className="theme-toggle"
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
              disabled={busy || loading || pending || !!previewSettings}
              onClick={toggleTheme}
            >
              <Moon size={18} className="moon-icon" />
              <Sun size={18} className="sun-icon" />
            </button>
            <button
              className="avatar profile-button"
              title="Profile and settings"
              aria-label="Profile and settings"
              onClick={() => go("Settings")}
            >
              {initials(settings.ownerName || settings.businessName)}
            </button>
          </div>
        </header>
        <div className="content">
          <div className="title">
            <div>
              <div className="eyebrow">LET’S GET ROLLING</div>
              <h1>
                {tab === "Checkout"
                  ? "Ready for the next order."
                  : tab === "Settings"
                    ? "Your cart. Your workspace."
                    : tab}
              </h1>
              <p>
                {tab === "Inventory"
                  ? "Receive ingredients and calculate what you can make."
                  : tab === "Activity log"
                    ? "Every order change, with the user and time recorded."
                  : tab === "Users"
                    ? "Manage your team’s logins and workspace access."
                    : tab === "Orders"
                    ? "Follow the kitchen queue and record service and payment."
                    : tab === "Calendar"
                    ? "Go back to any day and review your business."
                    : tab === "Bills"
                    ? "Keep purchases and their receipts together."
                  : tab === "Settings"
                    ? "Your profile, receipts, colours and layout—all in one place."
                    : tab === "Menu"
                      ? "Manage menu items, prices and categories."
                      : tab === "Sales history"
                        ? "Every sale, neatly in one place."
                        : tab === "Restock"
                          ? "Receive stock and keep every delivery bill together."
                          : tab === "Stock history"
                            ? "Follow every stock change, from delivery to return."
                            : tab === "Overview"
                              ? "A little perspective on your business."
                              : "Your spreadsheet, connected to your daily workflow."}
              </p>
            </div>
            {tab === "Menu" && (<button
              className="primary"
              disabled={busy || pending}
              onClick={() => {
                setError("");
                setProductBill(null);
                setEdit({
                  ...blank,
                  category: settings.defaultCategory,
                  note: "",
                });
              }}
            >
              <Plus size={17} /> Add menu item
            </button>)}
          </div>
          {error && (
            <div className="alert" role="alert">
              {error} <button onClick={load}>Retry refresh</button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="stats">
            <div>
              <span>
                Today’s sales <ArrowUpRight size={16} />
              </span>
              <strong>{money(today.reduce((n, s) => n + s.total, 0))}</strong>
              <small>{today.length} completed transactions</small>
            </div>
            <div>
              <span>
                Raw materials <Package size={16} />
              </span>
              <strong>
                {rawMaterials.length}
              </strong>
              <small>
                Tracked in grams, millilitres or pieces
              </small>
            </div>
            <div>
              <span>
                Raw material shortages <span className="orange">●</span>
              </span>
              <strong>
                {low.length}
                <em> materials</em>
              </strong>
              <small>
                {low.length
                  ? "Time for a little restock"
                  : "No raw material shortages"}
              </small>
            </div>
          </div>
          {tab === "Menu" && (
            <section className="panel">
              <div className="sectionheading">
                <h2>Your menu</h2>
                <div className="row-actions">
                  <button
                    className={showArchived ? "selected" : ""}
                    disabled={busy || pending}
                    onClick={() => setShowArchived(!showArchived)}
                  >
                    {showArchived ? "Show active" : "Show archived"}
                  </button>
                  <button onClick={() => csv("Menu")}>Export CSV ↗</button>
                </div>
              </div>
              <div className="search">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search menu"
                  placeholder="Search menu"
                />
              </div>
              <div className="tablewrap">
                <table>
                  <thead>
                    <tr>
                      {[
                        "Product",
                        "SKU",
                        "Category",
                        "Price",
                        "Status",
                        "",
                      ].map((s, i) => (
                        <th key={i}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>{p.sku}</td>
                        <td>{p.category}</td>
                        <td>{money(p.price)}</td>
                        <td><span className="badge">{p.archived?'Archived':'Active'}</span></td>
                        <td>
                          <div className="row-actions">
                            {!p.archived && (
                              <button
                                disabled={busy || pending}
                                onClick={() => openProduct(p)}
                              >
                                Edit menu item
                              </button>
                            )}
                            <button
                              disabled={busy || pending}
                              onClick={() => archive(p)}
                            >
                              {p.archived ? "Restore" : "Archive"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!items.length && (
                <div className="empty">
                  {showArchived
                    ? "No archived products."
                    : "No matching products. Add a product or try a different search."}
                </div>
              )}
            </section>
          )}
          {tab === "Inventory"&&<IngredientsPanel data={data} busy={busy} onSave={save} autoUpload={ingredientUpload}/>}
          {tab === "Restock" && <IngredientsPanel key="raw-restock" data={data} busy={busy} onSave={save} autoUpload/>}
          {tab === "Sales history" && (
            <SalesHistory
              sales={data.sales}
              busy={busy || pending}
              onReceipt={setReceipt}
              onReturn={(sale) => {
                setError("");
                setReturnReason("");
                setReturnSale(sale);
              }}
            />
          )}
          {tab === "Settings" && (
            <SettingsPanel
              products={data.products}
              settings={settings}
              onPreview={setPreviewSettings}
              busy={busy || pending}
              onNavigate={go}
              onSave={async (action) => {
                const state = await save(action);
                return { state, ...(state ? {} : saveFailure.current) };
              }}
            />
          )}
          {tab === "Users" && <UsersPanel/>}
          {tab === "Activity log" && <OrderActivity orders={data.orders||[]}/>}
          {tab === "Orders" && <OrderQueue products={data.products} orders={data.orders||[]} busy={busy} onAction={async action=>!!await save(action)} onRefresh={load}/> }
          {tab === 'Calendar'&&<CalendarPanel data={data} selected={calendarDay} onDate={setCalendarDay} onReceipt={setReceipt} onNavigate={go}/>}
          {tab === 'Bills'&&<BillsPanel bills={data.bills} busy={busy||pending} onSave={async action=>{const state=await save(action);return {state,...(state?{}:saveFailure.current)};}}/>}
          {tab === "Overview" && <Overview data={data} onNavigate={go} />}
          {tab === "Google Sheets" && (
            <section className="panel sheets">
              <div className="sheeticon">
                <Sheet size={36} />
              </div>
              <span className="badge warn">Connection pending</span>
              <h2>A familiar home for your numbers.</h2>
              <p>
                Google Sheets integration will be configured when you provide
                your spreadsheet link. Live sync is not connected yet.
              </p>
              <div className="syncplan">
                <div>
                  <Check size={17} />
                  <span>
                    <strong>Inventory export</strong>
                    <small>Raw materials, base units and current balances</small>
                  </span>
                  <button onClick={() => csv("Inventory")}>Download CSV</button>
                </div>
                <div>
                  <Check size={17} />
                  <span>
                    <strong>Sales export</strong>
                    <small>Receipts, dates, payment methods and totals</small>
                  </span>
                  <button onClick={() => csv("Sales")}>Download CSV</button>
                </div>
              </div>
              <p className="hint">
                Import these CSV files into Google Sheets for now. D1 remains
                the source of truth for orders and raw material inventory.
              </p>
            </section>
          )}
          <footer>
            ROLL IT POS <span>Small details. Smoother business.</span>
          </footer>
        </div>
      </main>
      {edit && (
        <Dialog
          label={edit.id ? "Edit menu item" : "Add menu item"}
          onClose={() => {
            if (!busy && !billUploading) setEdit(null);
          }}
        >
          <form
            className="modal"
            onSubmit={async (e) => {
              e.preventDefault();
              const j = await save({
                type: "product",
                product: { ...edit, billId: productBill?.id },
              });
              if (j) {
                setEdit(null);
                setNotice("Product saved.");
              }
            }}
          >
            <div className="sectionheading">
              <h2>{edit.id ? "Edit menu item" : "Add a menu item"}</h2>
              <button
                type="button"
                aria-label="Close"
                disabled={busy || billUploading}
                onClick={() => setEdit(null)}
              >
                <X />
              </button>
            </div>
            {error && <div className="alert">{error}</div>}
            <div className="fields">
              {[
                ["name", "Product name"],
                ["sku", "SKU / barcode"],
                ["category", "Category"],
                ["price", "Selling price (₹)"],
                ["cost", "Cost price (₹)"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    disabled={busy || (!!edit.recipeEnabled && ["stock","cost"].includes(key))}
                    required
                    maxLength={key === "name" ? 120 : 80}
                    type={
                      ["price", "cost", "stock", "low"].includes(key)
                        ? "number"
                        : "text"
                    }
                    min="0"
                    step={["price", "cost"].includes(key) ? "0.01" : "1"}
                    value={
                      ["price", "cost"].includes(key)
                        ? Number(edit[key as keyof Product]) / 100
                        : String(edit[key as keyof Product] ?? "")
                    }
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        [key]: ["price", "cost"].includes(key)
                          ? Math.round(Number(e.target.value) * 100)
                          : ["stock", "low"].includes(key)
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                </label>
              ))}
            </div>
            {edit.billIds?.length ? (
              <div className="previous-bills">
                <strong>Previously attached bills</strong>
                {edit.billIds.map((id, i) => (
                  <a
                    key={id}
                    href={"/api/bills/" + id}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Bill {i + 1} ↗
                  </a>
                ))}
              </div>
            ) : null}
            <p className="hint">
              Inventory tracks raw materials only. Enable a recipe in Inventory to calculate ingredient cost per serving. Ordering is never blocked by stock levels.
            </p>
            <button className="primary pay" disabled={busy || billUploading}>
              {busy ? "Saving…" : "Save product"}
            </button>
          </form>
        </Dialog>
      )}
      {receipt && (
        <Dialog label="Sale receipt" onClose={() => setReceipt(null)}>
          <div className="modal receipt">
            <div className="sectionheading">
              <h2>
                {receipt.business?.name || settings.businessName} · Receipt
              </h2>
              <button
                aria-label="Close receipt"
                onClick={() => setReceipt(null)}
              >
                <X />
              </button>
            </div>
            <p>
              #{receipt.id.slice(0, 8)} ·{" "}
              {new Date(receipt.date).toLocaleString("en-IN")}
            </p>
            <p>
              {receipt.customer} · {receipt.payment}
            </p>
            <div className="receipt-business">
              <p>{receipt.business?.address || ""}</p>
              <p>{receipt.business?.phone || ""}</p>
            </div>
            <p>
              <strong>{receipt.orderType === "Takeaway" ? "Parcel" : receipt.orderType || "Parcel"}</strong>
              {receipt.orderReference ? " · " + receipt.orderReference : ""}
            </p>
            {receipt.notes && (
              <p className="receipt-notes">Kitchen note: {receipt.notes}</p>
            )}
            {receipt.items.map((i) => (
              <div className="metric" key={i.id}>
                <span>
                  {i.qty} × {i.name}
                  <small>{money(i.price)} each</small>
                </span>
                <strong>{money(i.price * i.qty)}</strong>
              </div>
            ))}
            {receipt.returnedAt && (
              <div className="return-notice">
                <strong>
                  Returned on{" "}
                  {new Date(receipt.returnedAt).toLocaleString("en-IN")}
                </strong>
                <p>{receipt.returnReason}</p>
              </div>
            )}
            <div className="metric">
              <strong>
                {receipt.returnedAt ? "Original sale total" : "Total paid"}
              </strong>
              <strong>{money(receipt.total)}</strong>
            </div>
            <p className="hint">
              {receipt.business?.footer || settings.receiptFooter}
            </p>
            <button className="primary pay" onClick={() => window.print()}>
              Print receipt
            </button>
          </div>
        </Dialog>
      )}
      {returnSale && (
        <Dialog
          label="Return full sale"
          onClose={() => {
            if (!busy) setReturnSale(null);
          }}
        >
          <form
            className="modal"
            onSubmit={async (e) => {
              e.preventDefault();
              const j = await save({
                type: "return",
                saleId: returnSale.id,
                reason: returnReason,
              });
              if (j) {
                setReturnSale(null);
                setNotice("Return recorded. All items were restored to stock.");
              }
            }}
          >
            <div className="sectionheading">
              <h2>Return full sale</h2>
              <button
                type="button"
                aria-label="Close return"
                disabled={busy}
                onClick={() => setReturnSale(null)}
              >
                <X />
              </button>
            </div>
            <p className="panel-description">
              Receipt #{returnSale.id.slice(0, 8)} · {money(returnSale.total)}.
              All {returnSale.items.reduce((n, i) => n + i.qty, 0)} units will
              be restored to stock, including archived products. The original
              sale stays in your history.
            </p>
            <p className="return-notice">
              This records the return only. Handle the customer's refund
              separately using the original payment method.
            </p>
            {error && (
              <div role="alert" className="alert">
                {error}
              </div>
            )}
            <label className="adjustment-note">
              Return reason
              <input
                autoFocus
                required
                minLength={3}
                maxLength={240}
                disabled={busy}
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Why is the order being returned?"
              />
            </label>
            <button className="primary pay" disabled={busy}>
              {busy
                ? "Recording return…"
                : "Record full return & restore stock"}
            </button>
          </form>
        </Dialog>
      )}
    </div>
  );
}
