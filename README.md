# Roll It POS

A private, single-shop POS built with React/Vinext on Cloudflare Workers and Cloudflare D1.

## Features

- Products, unique SKU/barcodes, categories, INR prices and cost prices.
- Search or scan an exact SKU and press Enter to add it to checkout.
- Cash, UPI and Card payment recording; no payment processing.
- Atomic checkout and stock deduction with price review, duplicate protection and stock checks.
- Full-sale returns, stock restoration and original receipt preservation.
- Stock movement history with reasons for manual adjustments.
- Additive manual deliveries and reviewed Hyperpure PDF imports.
- Optional bill attachments on new products, stock edits and every manual restock.
- Private R2 bill storage, PDF/JPEG/PNG/WebP signatures, a 10 MB upload limit and duplicate-content fingerprints.
- Delivery history with bill downloads; duplicate supplier invoices and reused restock bills are rejected.
- Product archiving and restoration without deleting receipts.
- Searchable sales history with date/status filters and item-level CSV export.
- Printable receipts, revenue after returns and gross profit before expenses.
- Inventory/stock movement exports for Google Sheets. Live Sheets integration is deferred.

## Local development

Use Node.js 24 or newer. Run these commands from the repository root. For Cloudflare deployment, copy `.env.example` to `.env` and fill in your own credentials. Local tests can run without production credentials.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

The Sites build helper also supports publication packaging. With a built Worker, initialize a new local D1 database once:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_wise_bucky.sql
npm start -- --port 4173
```

Do not reapply a migration already applied to that local database. `npm run dev` is available for source development. Local data and hosted D1 data are separate. Test records never ship in a deployment archive.

## Source layout

| Path | Responsibility |
| --- | --- |
| `app/` | Admin, chef, and login pages, global styles, and API routes |
| `components/pos/` | POS screens and controls for orders, inventory, bills, analytics, and settings |
| `components/ui/` | Shared interface components |
| `lib/pos/` | Business rules, validation, D1 persistence, recipes, and invoice parsing |
| `cloudflare/` | Production Worker, authentication, Manage orders access, and scheduled reports |
| `worker/` | Sites and local build Worker entry point |
| `db/` and `drizzle/` | D1 schema and migrations |
| `public/` | Roll-IT branding and menu illustrations |
| `scripts/` | Build, OCR asset preparation, and deployment |
| `tests/` | POS, authentication, and daily report tests |

When changing a POS workflow, keep its rules in `lib/pos/`, request validation at the API boundary, and presentation in `components/pos/`. Keep local credentials, D1 state, uploaded bills, and generated builds outside Git.

## Data and consistency

This basic single-shop version stores a revision-controlled document in D1. A conditional UPDATE commits products, stock movements and sales together. Concurrent actions retry from the latest committed revision; stale product editors require a refresh. Sale IDs make retries idempotent, and a changed payload cannot reuse a sale ID. Full returns can restore stock only once.

Existing records remain readable. Stock movement history starts with this release; historical changes are not fabricated. D1 remains authoritative. Session storage holds only an unresolved checkout request so that a page reload can check its outcome or safely retry the same request.

The current layout is intended for small inventories and histories. Writes stop before the document exceeds 1.5 MB, leaving room below D1's TEXT limit. Before larger-scale use, migrate to separate products, sales, sale_items and stock_movements tables with transaction-safe stock updates, pagination and indexed reporting. No existing records are deleted automatically.

The deployment remains owner-private behind Sites access. Do not make it public or grant shared access without adding the appropriate per-user authorization and data model. No credentials belong in browser code, the repository or deployment manifests.

## API

`GET /api/pos` reads products, sales and stock movements. `POST /api/pos` accepts validated `product`, `sale`, `archive`, `return` and `restock` actions. All mutation requests require same-origin JSON. The route returns validation failures (400), conflicts (409), or temporary backend failures (503), with private/no-store responses.

## Google Sheets and future work

The Google Sheet link will be supplied later. No credentials, sync jobs or provider writes are configured. CSV exports are available now. Next: inspect the selected sheet's actual columns, agree on import/export direction, add explicit consent and duplicate-safe sync, and show sync errors without blocking checkout.

Partial returns, tax configuration, discounts, suppliers, expense accounting and staff roles are not implemented. Returns record a bookkeeping action only; the operator handles the customer's refund separately.


## Restocks and bills

Open Restock for a manual delivery or Hyperpure PDF upload. Review each line, map it to an existing product, enter the supplier/invoice/date and confirm. Received units are added to existing stock; the entered unit cost becomes the product's latest cost. Existing sale cost snapshots stay unchanged. Supplier invoice numbers and bill-content fingerprints protect against duplicate delivery entry. Unconfirmed delivery requests are retained in session storage for safe retry.

The PDF reader extracts text tables with an explicit quantity header. Photo uploads use a self-hosted browser OCR reader, tested against the supplied Hyperpure delivery challan. Scanned PDFs and unreadable layouts can be attached with manual item entry. Quantities use whole inventory units; convert weights/packs before confirmation. Goods cost, tax, delivery/transaction charges and the full printed total are tracked separately. Review every extracted value before confirming stock.

Bills are stored in the private Cloudflare R2 `BUCKET` binding, outside the D1 document, and linked by SHA-256 content ID. Upload and download routes are `/api/bills` and `/api/bills/[id]`. Uploads do not change stock. Stock changes happen only after the product/delivery form is confirmed. Removing a draft attachment unlinks it from that draft; it does not delete the stored file. No automatic cleanup is configured.

Google Drive is a static, unconnected destination placeholder at the user's request. The UI explicitly labels the current location as private app storage. There is no Drive upload, claimed sync, provider token or external credential. Configure the actual destination and supported Sites connector access before adding direct Drive saving.

## Profile, appearance and food-cart orders

Profile & settings saves the cart name, operator/contact details, receipt address/footer, default category, default payment and default order type to D1. Business details are snapshotted into each new receipt; editing the profile does not rewrite old receipts. Profile fields are business labels, not authentication-account changes.

Appearance supports light/dark/system mode, four accent colours, normal/large text, and comfortable/compact spacing. Layout supports grid/list catalogs, 2/3/4 desktop columns, left/right order panels, wide/boxed content, icon/expanded navigation, stock/SKU/summary visibility and sidebar section ordering/hiding. Checkout and Settings cannot be hidden. Changes preview immediately; Save settings persists them across devices, while Discard restores saved preferences. Reset appearance & layout keeps business-profile details. Mobile breakpoints take precedence when columns or side-by-side panels would become too small.

Checkout records Takeaway, Dine-in or Delivery, a token/table/reference and a kitchen note. These fields are recorded on receipts and searchable in sales history. Payment methods record payment received; payment processing is not implemented. Current ingredient recipes and preparation/service tracking are described below.

## Overview analytics

Overview offers 7/30/90-day windows, equal-period comparison, daily sales/returns lines, payment mix, top items, stock alerts, simple stock-coverage estimates, stock with no net sales, and a daily CSV report. A data-table toggle exposes the chart values. India calendar days are used for reporting.

Revenue and gross profit book returns on their actual recorded return date. Gross profit uses original sale item cost snapshots and excludes expenses. Payment mix and average order value use sales before returns. Coverage uses direct product sales divided by selected calendar days; it does not model recipes or ingredient consumption. Historical product names come from the sale record. Old sales without business/order metadata remain readable.

The refreshed design uses warm neutral surfaces, charcoal text and muted teal as its default accent. Alternate accents remain available in Settings, with corresponding dark palettes. Product tiles use a single restrained accent rather than an unrelated colour for every item.

## Deployment in your own Cloudflare account

The account deployment uses `cloudflare/wrangler.json` with Worker `roll-it-pos`, D1 `roll-it-pos` and private R2 bucket `roll-it-pos-bills`. It is separate from the previous managed Sites URL. Production preferences were copied; the previous deployment was retained.

The standalone Worker uses a branded login and role-based, server-enforced sessions. The owner signs in using `POS_ADMIN_USER` and `POS_ADMIN_PASSWORD` from the ignored local `.env`. Additional chef/admin accounts have salted PBKDF2 password hashes in D1. Random session tokens are hashed in D1; cookies are HttpOnly, Secure in production, and SameSite=Strict, with 2-day chef and 15-day admin lifetimes. Disabling an account revokes its sessions. Public login assets contain no business data; all business APIs and stored bills require authentication. Cloudflare API and S3 credentials remain local. D1 and R2 use native bindings. Preview URLs are disabled.

After source changes, run `npm run deploy:cloudflare` with a working Node 24 runtime. It builds the app, prepares the standalone module package, deploys the Worker, and uploads login secrets from `.env` through stdin. Provisioning is already complete. Keep `.env` private and preserve the existing database and bucket bindings. The additive auth tables initialize idempotently; existing business records are preserved.

## Calendar and bill tracking

Calendar is available in the sidebar and through the calendar icon in the header. It supports month navigation, date selection and a daily view of sales, returns, tracked bills, deliveries and posted stock movements using India calendar days. Historical days are read-only reporting; they do not change checkout timestamps. Overview also has a through-date picker for historical 7/30/90-day reports. Delivery invoice dates and stock posting dates remain distinct.

Bills is a separate dated ledger with title, description, category, full amount and an optional image/PDF attachment. Images have receipt thumbnails. Edit, archive/restore, search, category/date filters and CSV export are available. Recording a bill does not change stock. Bill totals and restock goods costs are shown separately to avoid double-counting the same invoice. Bills are not automatically deducted from gross profit.

Hyperpure photo reading now runs locally in the browser using self-hosted Tesseract assets. English model data is downloaded during build, not while transmitting bill data to an OCR provider. The reader locates the item table, removes table rules from an in-memory copy, and creates a draft from quantity and unit-price columns. It also proposes tax, charges and full bill totals where readable. The original uploaded image is retained unmodified. Invoice number, invoice date, descriptions, pack units and all amounts require review; uncertain values are left for manual entry. A delivery challan is retained as supplied, rather than being labelled as a tax invoice.

The supplied photo was tested locally: four item quantities 1/6/6/1, unit prices 245/130/78/70, tax 92.17, charges 77.88 and full amount 1733.05 were read. This is a layout test, not a production import of the user's bill. Scans with unreadable columns can still be attached and entered manually. Tax and charges never create stock items. All `/ocr/` runtime assets are covered by the standalone Worker's admin session gate.

## Chef workspace and team access

Sign in at `/login`. Admin credentials open `/`; chef credentials open `/chef`. Admins add users in **Users** and see kitchen orders in **Orders**. The owner account uses the existing private environment credentials.

The kitchen is designed for landscape tablets, with a phone layout and a fixed Review order shortcut. Swipe left for Queue and right for New order; the persistent arrows and tabs provide the same navigation. Tap an order to expand or collapse it. **Given** records delivery; **Paid** opens Cash / Online (UPI). Recording payment immediately moves the order to history. Delivery counts are tracked separately. History keeps completed and cancelled orders. Queue data refreshes every 8 seconds while the page is visible.

Creating an order immediately reserves stock in the existing D1 store document. Payment creates one sales record using the original price and cost snapshots, without a second stock deduction. New orders and payments are idempotent and protected by the same compare-and-swap transaction as admin checkout. Unpaid, not-given orders may be cancelled with a reason, restoring stock exactly once. Paid orders require an admin return; returns also remove the kitchen order from the active queue. Online records a payment already received; no payment gateway is connected.

The chef API cannot edit inventory/settings/users or access bill files, inventory costs or admin financial reports. Additional user passwords must be at least 10 characters. Authentication is rate limited by account and network. Login cookies expire after fixed lifetimes; they are not refreshed on each request.

Validation: 40 automated tests, TypeScript, production build, browser admin user creation and role routing, queue expansion/collapse, Given-before-Online and Cash-before-Given, 1024×768 tablet layout and 390px phone layout. Swipe direction/scroll rejection are tested as gesture rules; physical touch hardware was not available. Demo products, test users and test orders are confined to a separate local database.

## Admin logo palette and dark mode

Admin uses the same cream, brown and orange brand palette as the chef workspace. The sidebar displays the supplied Roll-IT logo. Light mode uses cream surfaces and brown type; dark mode uses deep brown surfaces, warm text and orange highlights. The header sun/moon button and Settings → Appearance switch the saved admin theme. The fixed logo palette replaces the previous accent-colour picker. Historical stored accent values remain compatible.

Theme bootstrapping applies saved preferences only to the admin root route. Chef and login routes initialize in light mode, even after a dark admin session, and have no dark-mode control. Legacy panel colour tokens and admin order cards follow the new light/dark tokens.

## Roll-IT menu, quick choices and partial delivery

The production menu contains three Kathi Rolls (Crispy Veg ₹80, Classic Paneer ₹90, Magic Mushroom ₹100), four Fries (Salted ₹80, Peri Peri ₹90, Cheesy Peri Peri ₹100, Loaded ₹120), and Water Bottle Small ₹10 / Big ₹20. The requested testing opening quantity is 10 each. Opening quantities are added through normal inventory actions and recorded in stock history; daily quantities can be adjusted in Inventory or received through Restock. Food costs were not supplied and may be entered from Inventory.

Chef ordering has Rolls on the left and Fries on the right, with water below. All seven food items fit at 1024×768 and 1280×720 landscape viewports. Main add targets are 46px and Add to queue is 56px high. Smaller phone layouts retain the Review order shortcut and vertical scrolling.

Dine-in is the initial default; table number is optional. Admin → Settings → Quick add manages customer and kitchen-note choices, including add, rename and remove. Save settings to publish changes to chef devices. Customer choices initially contain Walk-in customer; kitchen notes initially contain Less spicy, Spicy, No onion and No capsicum. Multiple note choices toggle and retain typed text; Spicy and Less spicy replace each other. Empty lists are supported.

Collapsed queue entries show item names and quantities. Each expanded line tracks delivered quantity: one-unit lines have a checkbox; multiple-unit lines have − / + and All controls, with the same compact interface for 2, 5, 10 or larger quantities. Counters are bounded by ordered quantity and guarded against stale changes. Delivery changes do not deduct stock again. Only unpaid, active orders remain in the queue. Payment immediately moves an order to history, even if delivery is incomplete. Removing an unpaid order restores only the not-given quantities; given units stay deducted. Paid orders use the existing admin return process. Delivery history remains read-only after completion.

Validation: 46 automated tests, TypeScript and production build; browser tests covered shortcut CRUD, shared quick choices, Dine-in without a table, per-line delivery, payment before full delivery, 5/10 identical items, and phone overflow. Production menu/settings checks created no test orders.

## Given checkbox on collapsed orders

Every active queue bar has a separate **Given all** checkbox beside the expand button. It marks all remaining units given without expanding the order. A partial mark shows incomplete delivery; already-given orders remain checked, and paid/given orders leave the active queue. Partial quantities and undo remain available inside the expanded order. The action uses the same idempotent orderGiven operation, and keeps payment separate.

Browser verification: a paid test order completed directly from its collapsed bar; a 5/10 test order became 10/10 while remaining collapsed and unpaid. Phone layout checked at 390px without horizontal overflow. Test records were confined to the local database.

## Queue editing, removal and beta cleanup

Unpaid orders show **Edit** and **Remove** beside each queue entry. Edit can change customer, table, type, notes and item quantities, add menu items and remove not-given lines. Stock deltas and totals commit atomically. Original item prices/costs remain quoted; new lines use current menu prices. Already-given quantities cannot be reduced or removed. Order revisions protect against changes on another device; edits racing with payment cannot alter a paid sale.

Remove is a soft cancellation with a reason. Only remaining not-given units return to stock, preventing already-served goods from reappearing in inventory. Removed orders stay in history. Paid orders immediately leave the active queue and stay in history; financial records are immutable through the queue editor.

At the user's request, four beta order records were cleared from the live order list after an audit snapshot was saved in the private D1 `pos_order_archives` table. Unused reservations were released. The menu, accounts, preferences, shortcuts and existing sales ledger were preserved. The reset is a one-time administrative action and is not an automatic daily reset.

Validation: 50 automated tests, TypeScript and build pass. Local browser verified quantity/item/customer edits, revised totals, removal/restored stock, immediate departure of a paid-but-not-given order, and a 390px edit dialog without overflow. No production test orders were created.


## Current chef workspace, recipes and saved sequences

The admin Checkout section has been removed. The chef workspace has New order, Queue and Manage orders tabs, with one-finger horizontal touch swipes across the screen; vertical scrolling is retained. Navigation arrows, the chef navbar and search are removed. Manage orders asks for the manager PIN every time it is opened. PIN verification happens server-side using a salted password hash in D1 `pos_manage_pin`; short-lived, hashed grants are tied to the signed-in session, expire after ten minutes and revoke when leaving the section. The UI relocks after nine minutes. Incorrect PINs are rate limited. Admin order management remains directly available.

Queue uses Served wording, shows notes while collapsed, and keeps the collapsed serve-all checkbox. Edit/remove controls are in the protected manager section or admin. Admin can also hide a paid order from order history while preserving its sale. Removing an unpaid order restores only unserved units; ingredient reservations use the original per-unit recipe snapshot. This is a soft removal, not erasure of sales records.

The wider cart has no heading, tighter margins, a fixed total/action area and item count beside the amount. The item list scrolls after three 78px rows; the rest of the cart can scroll separately. Product/cart trash buttons remove the complete unsubmitted line. Kitchen shortcuts sit above the last note field. Customer defaults to New; saved choices select a name without a text field, and Other reveals the custom-name input.

Admin → Settings → Quick add supports numbered up/down controls for customer and kitchen choices. Menu sequence in the same panel controls ordering within Rolls, Fries, Water and Other. Save settings persists the sequence in D1 and shares it with chef devices, without changing prices or quantities.

Admin → Ingredients & recipes supports ingredient quantities in grams, millilitres or pieces, supplier pack sizes/aliases and editable one-serving recipes. Enable recipes individually to replace manual finished-item availability with the limiting ingredient coverage. Products without enabled recipes continue using their manual stock. No production recipe quantities have been invented or seeded. Availability is per product: menu products sharing an ingredient compete for that stock, and order commits reject overselling atomically.

Upload Hyperpure bill reads a photo/PDF into a review draft. Verify every mapped ingredient, pack quantity, unit and units per pack, then Confirm and add ingredient stock. A 5 kg pack becomes 5,000 g; delivery/transaction fees and tax stay separate from ingredients. Attachments remain in private R2, and duplicate attachment/invoice posting is blocked across ingredient and finished-item receipts. Photographs can need corrections; unreadable rows can be entered manually. Posted bills retain original attachments and stock movements.

Validation: 58 automated tests, TypeScript and production build pass. Local browser checks cover saved shortcut/menu sequences reaching chef, New/Other field visibility, three-row cart scrolling, tablet and phone layout, ingredient creation, recipe saving with calculated availability, and PIN re-entry. Live checks cover chef PIN authorization/revocation, admin order-deletion authorization, response filtering and the nine existing menu products. No production test orders or stock updates were made. Two-finger navigation logic is tested; a physical touch-device gesture has not been exercised.


## Latest ordering and raw-inventory update

This supersedes the finished-menu stock workflow above. Current orders are not limited by stock. New orders use only configured raw-material recipes and do not reserve finished-menu counts. Raw ingredient balances can become negative; these show shortages without blocking service. Legacy reservations remain readable and can still be released correctly. The old strict stock policy is retained only for backward compatibility; current chef requests use unrestricted ordering. Menu availability can still be controlled by archiving an item.

Chef Customer type uses New by default, saved customer types and Other for a typed name. Order type uses Dine-in / Parcel tap buttons. Dine-in starts at table 1, with buttons 1–6; Parcel hides the table selector and submits no table. Custom note starts collapsed and reveals a text field; it is independent of the kitchen quick choices, and both appear in the collapsed queue.

Admin Inventory now contains raw materials, bill imports, recipes and raw-material movements. The Menu section manages names, categories and prices, with no finished-product stock fields. Finished stock history is removed from navigation. Restock opens the raw-material bill flow. Overview counts and valuation use raw materials.

Order edit/delete does not ask for a reason. A confirmation remains before deletion. Admin Activity log records new Created, Edited, Deleted, Served and Paid events with the authenticated username and India-time display. Events are committed atomically with the order in D1 and survive soft deletion, including hiding a paid order. Retries do not duplicate activity. Activity supports filter/search/CSV export. Existing deleted records without detailed events are identified as earlier records, without inventing an actor. Earlier edits cannot be reconstructed retroactively.

Latest verification: 63 automated tests, TypeScript and build pass. Local browser placed seven servings against ingredient coverage for five, successfully deleted the test order without a reason field, and verified the Deleted event, username and timestamp in admin. Raw stock was restored to its original balance. Dine-in / Parcel switching, table buttons, Custom note and collapsed combined notes were verified in the browser. These test orders were local only.


## Latest menu, history and daily reporting

Latest requests supersede the old category lanes and two-finger gesture. Chef ordering now has one image grid: five square, fully tappable tiles per row on landscape tablets/desktop, three on phones (two below 360px). The original generated food illustration atlas is stored in `public/menu-art/`; it is illustrative, not photography of the actual products. A full-width bar beneath each tile has delete-all on the left and cart quantity on the right. Admin Quick add → Menu sequence now orders all tiles together.

Single-finger horizontal swipes move between New order, Queue and Manage orders. The tracker ignores taps, rejects multiple fingers, excludes text controls and locks a vertical scroll until release. Physical touch hardware was not available; gesture-state tests cover these paths. Cart insertion order follows user taps, deleting and re-adding puts a line last, and addition scrolls only the cart list/body to show the affected line. Collapsed queue rows have Paid next to Served, using the existing Online/Cash popup and immediate paid-order departure from queue.

Manage orders starts at full history with All, Active, Served, Paid, Completed, Discarded and Deleted filters. No 50-order slice is applied. Discarded is grey, deleted red, completed green; text labels accompany the colours. Hidden paid records remain visible in the protected history. Discard releases only unserved reservations and records an event. Delete records a red tombstone; paid sale records remain immutable. Admin can hide a previously discarded order without releasing its reservations twice. Order type uses blue/purple controls and tables use green.

Admin Settings → Daily close & email saves an India-time reset boundary. New order numbers restart at 001 for each business day defined by this boundary. Existing order numbers are preserved, and deleted/discarded records still consume their original number. There is no destructive nightly data reset. The same business-day window drives daily email reports.

Daily reporting runs in the deployed Cloudflare Worker via `*/5 * * * *`. `cloudflare/reports.mjs` stores immutable snapshots and per-recipient delivery jobs in separate D1 tables, with atomic queue creation, leases and retries. Sending uses Resend's HTTPS API and stable per-delivery idempotency keys. Provider-accepted IDs are saved; ambiguous results stop automatic retries after the provider's deduplication window. The UI distinguishes acceptance from inbox delivery and exposes provider errors. Reports include paid sales, actual-date refunds, net sales, gross profit before expenses, payment totals, completed/discarded/deleted counts, unpaid orders at close, top items and current raw shortages. Deleting a paid order does not remove its sale from financial totals.

Email activation is intentionally pending: the user will provide a verified-domain sender and `RESEND_API_KEY`. `officialrollit@gmail.com` is prefilled as recipient and reply-to. Resend cannot send as a Gmail-domain address. Add the key to ignored `.env` then deploy with `npm run deploy:cloudflare`; the deployment script uploads that key as a Worker secret when present. Enter the verified sender and enable automatic reports in settings. Preview works without credentials; Send test is disabled with explicit setup requirements until configured. No live email was sent during verification.

The audit removed obsolete checkout-only settings (catalog layout, checkout cart position/columns, SKU display and default payment). Current admin width, sidebar, density, text size, stats, theme and navigation controls remain. Manual raw-material additions again support optional private R2 bill attachments, including attachment-only edits.

Verification: 77 automated tests, TypeScript and production build pass. Tests include midnight and custom-boundary numbering, report totals retaining deleted paid sales, concurrent job deduplication, immutable Resend retries, role/origin/secret protection, optional raw bill links, single-touch gesture tracking, cart insertion ordering and menu illustration mapping. Browser checks covered 1024×768 five-column tiles, 390px no-overflow layout, four-item cart-only auto-scroll (page scroll stays zero), collapsed payment, full colour-coded history, persisted 04:30 local reset and matching report preview. All order/payment/stock test mutations were local only.
