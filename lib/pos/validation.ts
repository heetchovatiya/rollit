import { z } from "zod";
import { defaultSettings, sections } from "./settings";
const id = z.string().uuid();
const cents = z.number().int().min(0).max(999_999_999);
const billId = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "Invalid bill reference.")
  .optional();
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "Enter a valid date.");
const quantity = z.number().int().min(0).max(9_999_999);
const product = z.object({
  id: z
    .union([id, z.literal("")])
    .optional()
    .default(""),
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().min(1).max(80),
  category: z
    .string()
    .trim()
    .max(80)
    .transform((s) => s || "General"),
  price: cents,
  cost: cents,
  stock: quantity,
  low: quantity,
  billId,
  originalStock: quantity.optional(),
  originalRevision: z.number().int().nonnegative().optional(),
  note: z.string().trim().max(240).optional().default(""),
});
const shortcutList=(max:number)=>z.array(z.string().trim().min(1,"Shortcut names cannot be empty.").max(max)).max(30).refine(a=>new Set(a.map(s=>s.toLowerCase())).size===a.length,"Shortcut names must be unique.");
export const settingsSchema = z.object({
  orderResetTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/,"Enter a valid reset time.").default("00:00"),
  dailyReportEnabled:z.boolean().default(false),
  reportEmails:z.array(z.string().trim().toLowerCase().email().max(254)).max(10).refine(a=>new Set(a).size===a.length,"Report emails must be unique.").default([]),
  reportSender:z.union([z.string().trim().email().max(254),z.literal("")]).refine(s=>!/@(?:gmail|googlemail)\.com$/i.test(s),"Resend sender must use a verified domain; use Gmail as recipient or reply-to.").default(""),
  reportReplyTo:z.union([z.string().trim().email().max(254),z.literal("")]).default(""),
  reportStartAt:z.string().max(40).default(""),
  menuOrder:z.array(id).max(2000).refine(a=>new Set(a).size===a.length,"Menu items must appear once.").default([]),
  quickCustomers: shortcutList(80).default(()=>defaultSettings().quickCustomers),
  quickKitchenNotes: shortcutList(60).default(()=>defaultSettings().quickKitchenNotes),
  businessName: z.string().trim().min(1).max(60),
  ownerName: z.string().trim().max(80),
  email: z.union([z.string().email().max(160), z.literal("")]),
  phone: z.string().trim().max(30),
  address: z.string().trim().max(240),
  receiptFooter: z.string().trim().max(180),
  defaultCategory: z.string().trim().min(1).max(80),
  defaultPayment: z.enum(["Cash", "UPI", "Card"]),
  defaultOrderType: z.enum(["Takeaway", "Dine-in", "Delivery"]),
  theme: z.enum(["light", "dark", "system"]),
  accent: z.enum(["green", "orange", "blue", "purple"]),
  density: z.enum(["comfortable", "compact"]),
  productView: z.enum(["grid", "list"]),
  cartPosition: z.enum(["right", "left"]),
  sidebar: z.enum(["expanded", "icons"]),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  width: z.enum(["wide", "boxed"]),
  textSize: z.enum(["normal", "large"]),
  showStats: z.boolean(),
  showStock: z.boolean(),
  showSku: z.boolean(),
  navigation: z
    .array(z.enum(sections))
    .length(sections.length)
    .refine(
      (a) => new Set(a).size === sections.length,
      "Each sidebar section must appear once.",
    ),
  hiddenSections: z
    .array(z.enum(sections))
    .max(sections.length - 1)
    .refine(
      (a) => !a.includes("Settings"),
      "Settings must stay visible.",
    )
    .refine((a) => new Set(a).size === a.length),
});
const ingredientQty=z.number().finite().min(0).max(999999999).refine(n=>Math.abs(n*1e6-Math.round(n*1e6))<0.01,"Use up to six decimal places.");
export const actionSchema = z.discriminatedUnion("type", [
 z.object({type:z.literal("discardOrder"),id,actor:z.string().max(120).optional()}),
 z.object({type:z.literal("ingredient"),billId,id,originalRevision:z.number().int().nonnegative().optional(),name:z.string().trim().min(1).max(180),unit:z.enum(["g","ml","pcs"]),stock:z.number().finite().min(-999999999).max(999999999),unitCost:z.number().finite().min(0).max(999999999),unitsPerPack:ingredientQty.refine(n=>n>=0.001),aliases:z.array(z.string().trim().min(1).max(200)).max(30),archived:z.boolean().default(false),reason:z.string().trim().min(3).max(240)}),
 z.object({type:z.literal("recipe"),productId:id,originalRevision:z.number().int().nonnegative(),enabled:z.boolean(),lines:z.array(z.object({ingredientId:id,qty:ingredientQty.refine(n=>n>=0.001)})).max(50)}),
 z.object({type:z.literal("ingredientReceipt"),id,billId:billId.refine(Boolean,"Upload the bill first."),supplier:z.string().trim().min(1).max(120),invoice:z.string().trim().max(100),invoiceDate:calendarDate,tax:cents.default(0),fees:cents.default(0),invoiceTotal:cents.optional(),lines:z.array(z.object({ingredientId:id,packs:ingredientQty.refine(n=>n>=0.001),packSize:ingredientQty.refine(n=>n>=0.001),packCost:cents,description:z.string().trim().min(1).max(200)})).min(1).max(100)}),
  z.object({type: z.literal("createOrder"), unlimited:z.boolean().default(true), id, customer:z.string().trim().max(120).default(""), notes:z.string().trim().max(240).default(""), orderType:z.enum(["Takeaway","Dine-in","Delivery"]).default("Takeaway"), orderReference:z.string().trim().max(40).default(""), actor:z.string().max(120).default(""), items:z.array(z.object({id,qty:quantity.min(1),expectedPrice:cents})).min(1).max(100)}),
  z.object({type:z.literal("editOrder"),unlimited:z.boolean().optional(),id,originalRevision:z.number().int().nonnegative(),actor:z.string().max(120).default(""),customer:z.string().trim().max(120),notes:z.string().trim().max(240),orderType:z.enum(["Takeaway","Dine-in","Delivery"]),orderReference:z.string().trim().max(40),items:z.array(z.object({id,qty:quantity.min(1),expectedPrice:cents})).min(1).max(100)}),
  z.object({type:z.literal("archiveOrder"),actor:z.string().max(120).optional(),id,originalRevision:z.number().int().nonnegative(),reason:z.string().trim().min(3).max(240).default("Order deleted")}),
  z.object({type:z.literal("orderGiven"),actor:z.string().max(120).optional(),id}),
  z.object({type:z.literal("orderDelivery"),actor:z.string().max(120).optional(),id,productId:id,deliveredQty:quantity,expectedDelivered:quantity}),
  z.object({type:z.literal("orderPaid"),actor:z.string().max(120).optional(),id,payment:z.enum(["Cash","UPI"])}),
  z.object({type:z.literal("cancelOrder"),actor:z.string().max(120).optional(),id,reason:z.string().trim().min(3).max(240).default("Order deleted")}),
  z.object({
    type: z.literal("trackedBill"),
    id,
    originalRevision: z.number().int().nonnegative().optional(),
    bill: z.object({
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().max(1000),
      category: z.string().trim().min(1).max(80),
      amount: cents,
      date: calendarDate,
      billId,
      attachmentType: z.string().max(64).optional(),
    }),
  }),
  z.object({
    type: z.literal("archiveBill"),
    id,
    originalRevision: z.number().int().nonnegative(),
    archived: z.boolean(),
  }),
  z.object({
    type: z.literal("settings"),
    originalRevision: z.number().int().nonnegative(),
    settings: settingsSchema,
  }),
  z.object({
    type: z.literal("restock"),
    tax: cents.default(0),
    fees: cents.default(0),
    invoiceTotal: cents.optional(),
    id,
    source: z.enum(["Manual", "Hyperpure"]),
    supplier: z.string().trim().min(1).max(120),
    invoiceNumber: z.string().trim().max(100),
    invoiceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((s) => {
        const d = new Date(s + "T00:00:00Z");
        return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
      }, "Enter a valid invoice date."),
    note: z.string().trim().max(240),
    billId,
    items: z
      .array(z.object({ productId: id, qty: quantity.min(1), unitCost: cents }))
      .min(1)
      .max(100),
  }),
  z.object({ type: z.literal("product"), product }),
  z.object({
    type: z.literal("sale"),
    id,
    customer: z.string().trim().max(120),
    orderType: z.enum(["Takeaway", "Dine-in", "Delivery"]).default("Takeaway"),
    orderReference: z.string().trim().max(40).default(""),
    notes: z.string().trim().max(240).default(""),
    payment: z.enum(["Cash", "Card", "UPI"]),
    items: z
      .array(z.object({ id, qty: quantity.min(1), expectedPrice: cents }))
      .min(1)
      .max(300),
  }),
  z.object({
    type: z.literal("return"),
    saleId: id,
    reason: z
      .string()
      .trim()
      .min(3, "Enter a return reason (at least 3 characters).")
      .max(240),
  }),
  z.object({
    type: z.literal("archive"),
    productId: id,
    archived: z.boolean(),
    originalRevision: z.number().int().nonnegative(),
  }),
]);
export type StoreAction = z.infer<typeof actionSchema>;
