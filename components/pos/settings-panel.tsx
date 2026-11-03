"use client";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  ArrowDown,
  User,
  Palette,
  LayoutDashboard,
  Check,
  RotateCcw,
  Save,
  Zap,
  Mail,
} from "lucide-react";
import {
  defaultSettings,
  initials,
  type BusinessSettings,
  type Section,
} from "@/lib/pos/settings";
import { settingsSchema, type StoreAction } from "@/lib/pos/validation";
import type { StoreState } from "@/lib/pos/types";
import {MenuSequenceEditor} from "./menu-sequence-editor";
import {ReportSettings} from "./report-settings";
import { QuickAddEditor } from "./quick-add-editor";
type SaveResult = { state: StoreState | null; error?: string; status?: number };
export function SettingsPanel({
  settings,
  products,
  onPreview,
  onSave,
  busy,
  onNavigate,
}: {
  settings: BusinessSettings;
  products: StoreState["products"];
  onPreview: (settings: BusinessSettings | null) => void;
  onSave: (action: StoreAction) => Promise<SaveResult>;
  busy: boolean;
  onNavigate: (section: Section) => void;
}) {
  const [draft, D] = useState<BusinessSettings>(() =>
      structuredClone(settings),
    ),
    [error, E] = useState(""),
    [saved, S] = useState(""),
    [section, T] = useState("Profile"),
    [dirty, F] = useState(false);
  useEffect(() => () => onPreview(null), []);
  useEffect(() => {
    if (!dirty) D(structuredClone(settings));
  }, [settings, dirty]);
  function change<K extends keyof BusinessSettings>(
    key: K,
    value: BusinessSettings[K],
  ) {
    const next = { ...draft, [key]: value };
    D(next);
    F(true);
    S("");
    onPreview(next);
  }
  function move(index: number, delta: number) {
    const navigation = [...draft.navigation];
    const to = index + delta;
    if (to < 0 || to >= navigation.length) return;
    [navigation[index], navigation[to]] = [navigation[to], navigation[index]];
    change("navigation", navigation);
  }
  async function save() {
    E("");
    const parsed = settingsSchema.safeParse(draft);
    if (!parsed.success) {
      E(parsed.error.issues[0].message);
      return;
    }
    const result = await onSave({
      type: "settings",
      settings: parsed.data,
      originalRevision: draft.revision,
    });
    if (result.state) {
      D(structuredClone(result.state.settings));
      F(false);
      onPreview(null);
      S("Saved. Your preferences will load on your other devices too.");
    } else E(result.error || "Settings could not be saved.");
  }
  function resetAppearance() {
    const defaults = defaultSettings();
    const next = {
      ...draft,
      theme: defaults.theme,
      accent: defaults.accent,
      density: defaults.density,
      productView: defaults.productView,
      cartPosition: defaults.cartPosition,
      sidebar: defaults.sidebar,
      columns: defaults.columns,
      width: defaults.width,
      textSize: defaults.textSize,
      showStats: true,
      showStock: true,
      showSku: true,
      navigation: defaults.navigation,
      hiddenSections: [],
    };
    D(next);
    F(true);
    onPreview(next);
    S("");
  }
  return (
    <section className="settings-workspace">
      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Settings sections"
      >
        {(
          [
            [User, "Profile"],
            [Palette, "Appearance"],
            [LayoutDashboard, "Layout"],
            [Zap, "Quick add"],
            [Mail, "Daily close & email"],
          ] as [LucideIcon, string][]
        ).map(([Icon, name]) => (
          <button
            role="tab"
            aria-selected={section === name}
            className={section === name ? "selected" : ""}
            key={name}
            onClick={() => T(name)}
          >
            <Icon size={17} />
            {name}
          </button>
        ))}
      </div>
      <div className="panel settings-panel">
        {section === "Daily close & email" && <ReportSettings draft={draft} onChange={change} busy={busy} dirty={dirty}/>}
        {section === "Quick add" && <>
          <h2>Quick choices for every order</h2>
          <p className="panel-description">Add, rename, remove or reorder shortcuts here. Save settings to update the chef workspace.</p>
          <div className="quick-add-editors">
            <QuickAddEditor title="Customer names" kind="customer" options={draft.quickCustomers} busy={busy} onChange={a=>change("quickCustomers",a)}/>
            <QuickAddEditor title="Kitchen notes" kind="kitchen note" options={draft.quickKitchenNotes} busy={busy} onChange={a=>change("quickKitchenNotes",a)}/>
          </div>
          <MenuSequenceEditor products={products} order={draft.menuOrder} busy={busy} onChange={a=>change("menuOrder",a)}/>
        </>}
        {section === "Profile" && (
          <>
            <div className="profile-heading">
              <div className="profile-monogram">
                {initials(draft.ownerName || draft.businessName)}
              </div>
              <div>
                <h2>Your food-cart workspace</h2>
                <p className="panel-description">
                  Business details appear in the sidebar and on new receipts.
                </p>
              </div>
            </div>
            <div className="settings-fields">
              {(
                [
                  ["businessName", "Business / cart name"],
                  ["ownerName", "Your name"],
                  ["email", "Contact email"],
                  ["phone", "Contact phone"],
                  ["address", "Cart location / receipt address"],
                  ["receiptFooter", "Receipt footer"],
                  ["defaultCategory", "Default product category"],
                ] as [keyof BusinessSettings, string][]
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    disabled={busy}
                    type={key === "email" ? "email" : "text"}
                    value={String(draft[key])}
                    maxLength={
                      key === "address"
                        ? 240
                        : key === "receiptFooter"
                          ? 180
                          : key === "email"
                            ? 160
                            : key === "businessName"
                              ? 60
                              : key === "phone"
                                ? 30
                                : 80
                    }
                    required={
                      key === "businessName" || key === "defaultCategory"
                    }
                    onChange={(e) => change(key, e.target.value as never)}
                  />
                </label>
              ))}


            </div>
            <div className="receipt-preview">
              <strong>{draft.businessName || "Your cart name"}</strong>
              <p>{draft.address || "Your cart location"}</p>
              <p>{draft.phone}</p>
              <hr />
              <span>Receipt preview</span>
              <p>{draft.receiptFooter}</p>
            </div>
          </>
        )}
        {section === "Appearance" && (
          <>
            <h2>Make the workspace yours</h2>
            <p className="panel-description">
              Preview changes immediately, then save to keep them.
            </p>
            <fieldset className="settings-options">
              <legend>Colour mode</legend>
              {(["light", "dark", "system"] as const).map((v) => (
                <button
                  type="button"
                  aria-pressed={draft.theme === v}
                  disabled={busy}
                  key={v}
                  className={draft.theme === v ? "selected" : ""}
                  onClick={() => change("theme", v)}
                >
                  {v === "system"
                    ? "Follow device"
                    : v === "dark"
                      ? "Dark"
                      : "Light"}
                </button>
              ))}
            </fieldset>
            <div className="admin-brand-palette">
              <strong>Roll-IT colours</strong>
              <div aria-label="Logo palette: cream, brown and orange"><i className="brand-swatch cream"/><i className="brand-swatch brown"/><i className="brand-swatch orange"/></div>
              <p>The logo palette stays consistent in light and dark mode. Colour mode applies to the admin panel only.</p>
            </div>
            <div className="settings-fields">
              <label>
                Spacing
                <select
                  disabled={busy}
                  value={draft.density}
                  onChange={(e) =>
                    change(
                      "density",
                      e.target.value as BusinessSettings["density"],
                    )
                  }
                >
                  <option value="comfortable">
                    Comfortable / touch friendly
                  </option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label>
                Text size
                <select
                  disabled={busy}
                  value={draft.textSize}
                  onChange={(e) =>
                    change(
                      "textSize",
                      e.target.value as BusinessSettings["textSize"],
                    )
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                </select>
              </label>
            </div>
            <div className="appearance-sample">
              <span className="badge">Preview</span>
              <h3>Your next order, your way.</h3>
              <p>Panels, forms, receipts and tables follow this theme.</p>
              <span className="sample-primary">Complete sale · ₹150</span>
            </div>
          </>
        )}
        {section === "Layout" && (
          <>
            <h2>A counter that fits your day</h2>
            <p className="panel-description">
              Choose the admin workspace width, navigation, spacing and text size. Chef ordering uses the five-tile menu grid.
            </p>
            <div className="settings-fields">
              {(
                [
                  [
                    "sidebar",
                    "Sidebar",
                    [
                      ["expanded", "Labels and icons"],
                      ["icons", "Icons only"],
                    ],
                  ],
                  [
                    "width",
                    "Workspace width",
                    [
                      ["wide", "Use available width"],
                      ["boxed", "Centred / boxed"],
                    ],
                  ],
                ] as const
              ).map(([key, label, options]) => (
                <label key={key}>
                  {label}
                  <select
                    disabled={busy}
                    value={draft[key]}
                    onChange={(e) => change(key, e.target.value as never)}
                  >
                    {options.map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

            </div>
            <div className="toggle-list">
              {(
                [
                  ["showStats", "Show workspace summary cards"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={draft[key]}
                    onChange={(e) => change(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <h3>Sidebar sections</h3>
            <p className="panel-description">
              Use the arrows to reorder. Settings always stays
              accessible.
            </p>
            <div className="nav-editor">
              {draft.navigation.map((name, index) => (
                <div key={name}>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={"Show " + name}
                      disabled={
                        busy || name === "Settings"
                      }
                      checked={!draft.hiddenSections.includes(name)}
                      onChange={(e) =>
                        change(
                          "hiddenSections",
                          e.target.checked
                            ? draft.hiddenSections.filter((n) => n !== name)
                            : [...draft.hiddenSections, name],
                        )
                      }
                    />
                    {name}
                  </label>
                  <button
                    aria-label={"Move " + name + " up"}
                    disabled={busy || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    aria-label={"Move " + name + " down"}
                    disabled={busy || index === draft.navigation.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown size={15} />
                  </button>
                </div>
              ))}
            </div>
            <button disabled={busy} onClick={resetAppearance}>
              <RotateCcw size={16} />
              Reset appearance & layout
            </button>
          </>
        )}
        {error && (
          <p className="upload-error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="settings-success" role="status">
            <Check size={17} />
            {saved}
          </p>
        )}
        <div className="settings-savebar">
          <span>
            {dirty
              ? "Unsaved changes · live preview"
              : "Preferences saved to this workspace"}
          </span>
          <button
            disabled={busy || !dirty}
            onClick={() => {
              D(structuredClone(settings));
              F(false);
              onPreview(null);
              E("");
              S("");
            }}
          >
            Discard
          </button>
          <button className="primary" disabled={busy || !dirty} onClick={save}>
            <Save size={16} />
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
      <section className="panel integration-summary">
        <h2>Connections</h2>
        <div className="metric">
          <span>
            Inventory, sales and settings<small>Saved in Cloudflare D1</small>
          </span>
          <span className="badge">Available</span>
        </div>
        <div className="metric">
          <span>
            Bill attachments<small>Private Cloudflare R2 storage</small>
          </span>
          <button onClick={() => onNavigate("Restock")}>Open restock</button>
        </div>
        <div className="metric">
          <span>
            Google Sheets & Drive
            <small>
              Not connected · CSV exports and app bill storage available
            </small>
          </span>
          <button onClick={() => onNavigate("Google Sheets")}>
            View options
          </button>
        </div>
      </section>
    </section>
  );
}
