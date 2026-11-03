import { defaultSettings, type BusinessSettings } from "./settings";
export interface Product {
  recipeEnabled?: boolean;
  recipe?: {ingredientId:string;qty:number}[];
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  low: number;
  revision?: number;
  archived?: boolean;
  billIds?: string[];
}
export interface SaleItem {
  ingredientUsage?: {ingredientId:string;qty:number;unitCost:number}[];
  id: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
}
export interface Sale {
  id: string;
  date: string;
  payment: "Cash" | "Card" | "UPI";
  customer: string;
  items: SaleItem[];
  total: number;
  returnedAt?: string;
  returnReason?: string;
  orderType?: "Takeaway" | "Dine-in" | "Delivery";
  orderReference?: string;
  notes?: string;
  business?: { name: string; phone: string; address: string; footer: string };
}
export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  productName: string;
  delta: number;
  balance: number;
  kind: "Opening stock" | "Adjustment" | "Sale" | "Return" | "Restock" | "Order" | "Order cancelled" | "Order edited";
  note: string;
  reference?: string;
  billId?: string;
}
export interface Restock {
  tax?: number;
  fees?: number;
  invoiceTotal?: number;
  id: string;
  date: string;
  source: "Manual" | "Hyperpure";
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  note: string;
  billId?: string;
  items: {
    productId: string;
    productName: string;
    qty: number;
    unitCost: number;
  }[];
  total: number;
}
export interface TrackedBill {
  id: string;
  title: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  billId?: string;
  attachmentType?: string;
  createdAt: string;
  revision: number;
  archived: boolean;
}
export interface OrderEvent {id:string;action:"Created"|"Edited"|"Deleted"|"Discarded"|"Served"|"Paid";at:string;by:string;details:string}
export interface KitchenOrder {
  businessDay?:string;
  discardedAt?:string;
  deletedAt?:string;
  events?:OrderEvent[];
  rawInventoryOnly?: boolean;
  hiddenAt?: string;
  deleteReason?: string;
  revision?: number;
  updatedAt?: string;
  updatedBy?: string;
  delivered?: Record<string, number>;
  id: string;
  number: string;
  date: string;
  customer: string;
  notes: string;
  orderType: "Takeaway" | "Dine-in" | "Delivery";
  orderReference: string;
  createdBy: string;
  items: SaleItem[];
  total: number;
  business: Sale["business"];
  givenAt?: string;
  paidAt?: string;
  payment?: "Cash" | "UPI";
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}
export interface Ingredient {billIds?:string[];id:string;name:string;unit:"g"|"ml"|"pcs";stock:number;unitCost:number;unitsPerPack:number;aliases:string[];revision:number;archived:boolean}
export interface IngredientMovement {billId?:string;id:string;date:string;ingredientId:string;name:string;unit:string;delta:number;balance:number;note:string;reference?:string}
export interface IngredientReceipt {id:string;date:string;billId:string;supplier:string;invoice:string;invoiceDate:string;total:number;tax:number;fees:number;invoiceTotal?:number;lines:{ingredientId:string;packs:number;packSize:number;packCost:number;description:string}[]}
export interface StoreState {
  ingredients:Ingredient[];
  ingredientMovements:IngredientMovement[];
  ingredientReceipts:IngredientReceipt[];
  orders: KitchenOrder[];
  bills: TrackedBill[];
  settings: BusinessSettings;
  products: Product[];
  sales: Sale[];
  movements: StockMovement[];
  restocks: Restock[];
}
export interface ProductDraft extends Product {
  originalStock?: number;
  originalRevision?: number;
  note?: string;
  billId?: string;
}
export const emptyState = (): StoreState => ({
  settings: defaultSettings(),
  bills: [],
  ingredients:[],
  ingredientMovements:[],
  ingredientReceipts:[],
  orders: [],
  products: [],
  sales: [],
  movements: [],
  restocks: [],
});
