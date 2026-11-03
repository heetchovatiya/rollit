import {businessDay} from "./business-day";
import {availableUnits,recipeUsage,itemCost,stockRound} from "./recipes";
import { deliveredQuantity, deliveryProgress, nextOrderNumber } from "./delivery";
import { defaultSettings, sections } from "./settings";
import type { Product, Sale, StockMovement, StoreState } from "./types";
import type { StoreAction } from "./validation";
export class StoreError extends Error {
  constructor(
    message: string,
    public status = 409,
  ) {
    super(message);
  }
}
export function normalizeState(raw: Partial<StoreState>): StoreState {
  return {
    settings: {
      ...defaultSettings(),
      ...raw.settings,
      hiddenSections:(raw.settings?.hiddenSections||[]).filter(s=>sections.includes(s)),
      navigation: [
        ...(raw.settings?.navigation || sections),
        ...sections.filter((s) => !raw.settings?.navigation?.includes(s)),
      ].filter((s, i, a) => sections.includes(s) && a.indexOf(s) === i),
    },
    bills: raw.bills || [],
    ingredients:raw.ingredients||[],
    ingredientMovements:raw.ingredientMovements||[],
    ingredientReceipts:raw.ingredientReceipts||[],
    orders: raw.orders || [],
    products: raw.products || [],
    sales: raw.sales || [],
    movements: raw.movements || [],
    restocks: raw.restocks || [],
  };
}
function revision(p: Product) {
  return p.revision || 0;
}
/** Pure business rules: the repository commits the entire result using compare-and-swap. */
export function applyAction(
  current: StoreState,
  action: StoreAction,
  now = new Date().toISOString(),
): StoreState {
  const state = structuredClone(current);
  state.ingredients ||= [];state.ingredientMovements ||= [];state.ingredientReceipts ||= [];
  function event(order:import("./types").KitchenOrder,kind:import("./types").OrderEvent["action"],by:string|undefined,details:string){(order.events||=[]).push({id:crypto.randomUUID(),action:kind,at:now,by:by||"Admin",details});}
  function move(
    p: Product,
    delta: number,
    kind: StockMovement["kind"],
    note: string,
    reference?: string,
    billId?: string,
  ) {
    if (!delta) return;
    state.movements.unshift({
      id: crypto.randomUUID(),
      date: now,
      productId: p.id,
      productName: p.name,
      delta,
      balance: availableUnits(state,p),
      kind,
      note,
      reference,
      billId,
    });
  }
  function ingredients(item:import("./types").SaleItem,units:number,note:string,reference:string,allowOverage=false){
    if(!item.ingredientUsage){const p=state.products.find(p=>p.id===item.id);if(!p||(!allowOverage&&p.stock+units<0)||Math.abs(p.stock+units)>999999999)throw new StoreError("Not enough item stock for this operation.");p.stock+=units;p.revision=revision(p)+1;return;}
    for(const line of item.ingredientUsage){const i=state.ingredients.find(i=>i.id===line.ingredientId);const delta=stockRound(line.qty*units);if(!i||(!allowOverage&&stockRound(i.stock+delta)<0)||Math.abs(i.stock+delta)>999999999)throw new StoreError("Not enough ingredient stock. Refresh availability.");i.stock=stockRound(i.stock+delta);i.revision++;state.ingredientMovements.unshift({id:crypto.randomUUID(),date:now,ingredientId:i.id,name:i.name,unit:i.unit,delta,balance:i.stock,note,reference});}
    const p=state.products.find(p=>p.id===item.id);if(p)p.revision=revision(p)+1;
  }
  if(action.type==="ingredient"){
    const prior=state.ingredients.find(i=>i.id===action.id);
    const values={name:action.name,unit:action.unit,stock:action.stock,unitCost:action.unitCost,unitsPerPack:action.unitsPerPack,aliases:action.aliases,archived:action.archived,billIds:Array.from(new Set([...(prior?.billIds||[]),...(action.billId?[action.billId]:[])]))};
    if(prior&&JSON.stringify(values)===JSON.stringify({name:prior.name,unit:prior.unit,stock:prior.stock,unitCost:prior.unitCost,unitsPerPack:prior.unitsPerPack,aliases:prior.aliases,archived:prior.archived,billIds:prior.billIds||[]}))return current;
    if(prior&&prior.revision!==action.originalRevision)throw new StoreError("Ingredient changed. Refresh before editing.");
    if(prior&&prior.unit!==action.unit)throw new StoreError("Create a separate ingredient to change units safely.");
    if(state.ingredients.some(i=>i.id!==action.id&&i.name.toLowerCase()===action.name.toLowerCase()))throw new StoreError("Ingredient name already exists.");
    const delta=stockRound(action.stock-(prior?.stock||0));
    const ingredient={id:action.id,...values,revision:prior?prior.revision+1:0};
    if(prior)Object.assign(prior,ingredient);else state.ingredients.push(ingredient);
    if(delta)state.ingredientMovements.unshift({id:crypto.randomUUID(),date:now,ingredientId:action.id,name:action.name,unit:action.unit,delta,balance:action.stock,note:action.reason,billId:action.billId});
  }else if(action.type==="recipe"){
    const p=state.products.find(p=>p.id===action.productId);if(!p)throw new StoreError("Menu item not found.",404);
    if(revision(p)!==action.originalRevision)throw new StoreError("Menu item changed. Refresh and reopen its recipe.");
    if(action.enabled&&!action.lines.length)throw new StoreError("Add ingredients before enabling a recipe.",400);
    if(new Set(action.lines.map(l=>l.ingredientId)).size!==action.lines.length)throw new StoreError("Combine duplicate ingredients into one line.",400);
    for(const line of action.lines)if(!state.ingredients.some(i=>i.id===line.ingredientId&&!i.archived))throw new StoreError("A recipe ingredient is unavailable.");
    p.recipeEnabled=action.enabled;p.recipe=action.lines;p.revision=revision(p)+1;
  }else if(action.type==="ingredientReceipt"){
    const prior=state.ingredientReceipts.find(r=>r.id===action.id);
    if(prior){if(prior.billId!==action.billId||JSON.stringify(prior.lines)!==JSON.stringify(action.lines)||prior.supplier!==action.supplier||prior.invoice!==action.invoice||prior.invoiceDate!==action.invoiceDate||prior.tax!==action.tax||prior.fees!==action.fees||prior.invoiceTotal!==action.invoiceTotal)throw new StoreError("Receipt reference is already used.");return current;}
    if(state.ingredientReceipts.some(r=>r.billId===action.billId)||state.restocks.some(r=>r.billId===action.billId))throw new StoreError("This bill is already posted to stock.");
    if(action.invoice&&(state.ingredientReceipts.some(r=>r.supplier.toLowerCase()===action.supplier.toLowerCase()&&r.invoice.toLowerCase()===action.invoice.toLowerCase())||state.restocks.some(r=>r.supplier.toLowerCase()===action.supplier.toLowerCase()&&r.invoiceNumber.toLowerCase()===action.invoice.toLowerCase())))throw new StoreError("This invoice is already posted.");
    let total=0;
    for(const l of action.lines){const i=state.ingredients.find(i=>i.id===l.ingredientId&&!i.archived);if(!i)throw new StoreError("Choose an active ingredient for every line.");const delta=stockRound(l.packs*l.packSize);if(i.stock+delta>999999999)throw new StoreError("Ingredient quantity is too large.");i.stock=stockRound(i.stock+delta);i.unitCost=l.packCost/l.packSize;i.unitsPerPack=l.packSize;i.aliases=Array.from(new Set([...i.aliases,l.description])).slice(-30);i.revision++;total+=Math.round(l.packs*l.packCost);state.ingredientMovements.unshift({id:crypto.randomUUID(),date:now,ingredientId:i.id,name:i.name,unit:i.unit,delta,balance:i.stock,note:`Bill ${action.invoice||action.supplier}`,reference:action.id});}
    if(!Number.isSafeInteger(total))throw new StoreError("Bill total is too large.");
    state.ingredientReceipts.unshift({...action,billId:action.billId!,date:now,total});
  }else if (action.type === "createOrder") {
    state.orders ||= [];
    const prior=state.orders.find(o=>o.id===action.id);
    if(prior){
      if(prior.customer!==(action.customer||"Walk-in customer") || prior.notes!==action.notes || prior.orderType!==action.orderType || prior.orderReference!==action.orderReference || prior.createdBy!==action.actor || prior.items.length!==action.items.length || !action.items.every(i=>prior.items.some(p=>p.id===i.id&&p.qty===i.qty&&p.price===i.expectedPrice))) throw new StoreError("This order reference is already used. Refresh to check the queue.");
      return current;
    }
    if(state.sales.some(s=>s.id===action.id))throw new StoreError("This reference is already used by a sale.");
    const seen=new Set<string>();
    const b=state.settings||defaultSettings();
    const order: import("./types").KitchenOrder={id:action.id,number:nextOrderNumber(state.orders,now,b.orderResetTime||"00:00"),businessDay:businessDay(now,b.orderResetTime||"00:00"),date:now,customer:action.customer||"Walk-in customer",notes:action.notes,orderType:action.orderType,orderReference:action.orderReference,createdBy:action.actor,items:[],total:0,revision:0,rawInventoryOnly:action.unlimited!==false,business:{name:b.businessName,phone:b.phone,address:b.address,footer:b.receiptFooter}};
    for(const item of action.items){
      if(seen.has(item.id))throw new StoreError("A product appears twice.",400);seen.add(item.id);
      const p=state.products.find(p=>p.id===item.id);
      if(!p||p.archived)throw new StoreError("An item is unavailable. Refresh your menu.");
      if(p.price!==item.expectedPrice)throw new StoreError(`Price changed for ${p.name}. Refresh your menu.`);
      if(action.unlimited===false&&availableUnits(state,p)<item.qty)throw new StoreError(`Only ${availableUnits(state,p)} units of ${p.name} remain.`);
      const snapshot={id:p.id,name:p.name,qty:item.qty,price:p.price,cost:itemCost(state,p),ingredientUsage:recipeUsage(state,p)??(order.rawInventoryOnly?[]:undefined)};ingredients(snapshot,-item.qty,"Order reserved",order.id,order.rawInventoryOnly);
      order.items.push(snapshot);order.total+=p.price*item.qty;
      move(p,-item.qty,"Order",`Reserved for order #${order.number}`,order.id);
    }
    if(!Number.isSafeInteger(order.total)||order.total>999999999)throw new StoreError("Order total is too large.",400);
    event(order,"Created",action.actor,order.items.map(i=>`${i.qty}× ${i.name}`).join(" · "));
    state.orders.unshift(order);
  } else if(action.type==="archiveOrder") {
    const order=state.orders.find(o=>o.id===action.id);if(!order)throw new StoreError("Order not found.",404);
    if(order.hiddenAt)return current;if(!order.paidAt&&!order.cancelledAt)throw new StoreError("Remove unpaid orders using the normal order removal action.");
    if((order.revision||0)!==action.originalRevision)throw new StoreError("Order changed. Refresh before deleting it.");
    order.hiddenAt=now;order.deletedAt=now;order.deleteReason=action.reason;order.revision=(order.revision||0)+1;event(order,"Deleted",action.actor,order.paidAt?"Removed from order history; sale retained.":"Discarded order deleted from history.");
  } else if(action.type==="editOrder") {
    const order=state.orders?.find(o=>o.id===action.id);
    if(!order)throw new StoreError("Order not found.",404);
    if(order.paidAt||order.completedAt||order.cancelledAt)throw new StoreError("Only unpaid, active orders can be edited.");
    const same=order.customer===(action.customer||"Walk-in customer")&&order.notes===action.notes&&order.orderType===action.orderType&&order.orderReference===action.orderReference&&order.items.length===action.items.length&&action.items.every(i=>order.items.some(p=>p.id===i.id&&p.qty===i.qty&&p.price===i.expectedPrice));
    if(same)return current;
    if((order.revision||0)!==action.originalRevision)throw new StoreError("This order changed on another device. Refresh and reopen the editor.");
    const previous=order.items.map(i=>`${i.qty}× ${i.name}`).join(" · ");
    const changesMetadata=[order.customer!==(action.customer||"Walk-in customer")?"customer":null,order.notes!==action.notes?"notes":null,order.orderType!==action.orderType?"order type":null,order.orderReference!==action.orderReference?"table":null].filter(Boolean);
    const seen=new Set<string>(),items:import("./types").SaleItem[]=[];
    for(const item of action.items){
      if(seen.has(item.id))throw new StoreError("A product appears twice.",400);seen.add(item.id);
      const prior=order.items.find(i=>i.id===item.id),p=state.products.find(p=>p.id===item.id);
      if(!p||(!prior&&p.archived)||(prior&&p.archived&&item.qty>prior.qty))throw new StoreError("An item is unavailable. Refresh the menu.");
      if(item.qty<deliveredQuantity(order,item.id))throw new StoreError("Quantity cannot be lower than the number already served.");
      const price=prior?.price??p.price;
      if(item.expectedPrice!==price)throw new StoreError("An item price changed. Refresh and reopen the editor.");
      items.push(prior?{...prior,qty:item.qty}:{id:p.id,name:p.name,qty:item.qty,price:p.price,cost:itemCost(state,p),ingredientUsage:recipeUsage(state,p)??((action.unlimited||order.rawInventoryOnly)?[]:undefined)});
    }
    for(const old of order.items)if(!seen.has(old.id)&&deliveredQuantity(order,old.id)>0)throw new StoreError("An already-served item cannot be removed.");
    const total=items.reduce((n,i)=>n+i.price*i.qty,0);
    if(!Number.isSafeInteger(total)||total>999999999)throw new StoreError("Order total is too large.",400);
    const changes=[...new Set([...order.items.map(i=>i.id),...items.map(i=>i.id)])].map(id=>({id,delta:(items.find(i=>i.id===id)?.qty||0)-(order.items.find(i=>i.id===id)?.qty||0)})).sort((a,b)=>a.delta-b.delta);
    for(const {id,delta} of changes){
      if(!delta)continue;const p=state.products.find(p=>p.id===id);
      if(!p)throw new StoreError("Item unavailable.");
      ingredients((items.find(i=>i.id===id)||order.items.find(i=>i.id===id))!,-delta,"Order edited",order.id,action.unlimited||order.rawInventoryOnly);move(p,-delta,"Order edited",`Edited order #${order.number}`,order.id);
    }
    order.delivered=Object.fromEntries(items.map(i=>[i.id,deliveredQuantity(order,i.id)]));
    Object.assign(order,{rawInventoryOnly:action.unlimited||order.rawInventoryOnly,items,total,customer:action.customer||"Walk-in customer",notes:action.notes,orderType:action.orderType,orderReference:action.orderReference,revision:(order.revision||0)+1,updatedAt:now,updatedBy:action.actor});
    event(order,"Edited",action.actor,`${previous} → ${items.map(i=>`${i.qty}× ${i.name}`).join(" · ")}${changesMetadata.length?"; updated "+changesMetadata.join(", "):""}`);
    if(items.every(i=>order.delivered![i.id]===i.qty))order.givenAt=order.givenAt||now;else delete order.givenAt;
  } else if(action.type==="orderDelivery") {
    const order=state.orders?.find(o=>o.id===action.id);
    if(!order)throw new StoreError("Order not found.",404);
    if(order.cancelledAt||order.hiddenAt||order.deletedAt)throw new StoreError("This order was discarded or deleted.");
    const item=order.items.find(i=>i.id===action.productId);
    if(!item||action.deliveredQty>item.qty)throw new StoreError("Delivery quantity must stay between zero and the ordered quantity.",400);
    const currentQty=deliveredQuantity(order,item.id);
    if(currentQty===action.deliveredQty)return current;
    if(order.completedAt)throw new StoreError("This order is complete. Its delivery history is read-only.");
    if(currentQty!==action.expectedDelivered)throw new StoreError("Delivery count changed on another device. Refresh before changing it.");
    order.delivered=Object.fromEntries(order.items.map(i=>[i.id,deliveredQuantity(order,i.id)]));
    order.delivered[item.id]=action.deliveredQty;event(order,"Served",action.actor,`${item.name}: ${currentQty} → ${action.deliveredQty} / ${item.qty}`);
    order.revision=(order.revision||0)+1;
    if(order.items.every(i=>order.delivered![i.id]===i.qty)){
      order.givenAt=now;if(order.paidAt)order.completedAt=now;
    }else delete order.givenAt;
  } else if(action.type==="orderGiven" || action.type==="orderPaid" || action.type==="cancelOrder" || action.type==="discardOrder") {
    const order=state.orders?.find(o=>o.id===action.id);
    if(!order)throw new StoreError("Order not found.",404);
    if(action.type==="cancelOrder"||action.type==="discardOrder"){
      const reason=action.type==="discardOrder"?"Order discarded":action.reason;
      if(order.cancelledAt)return current;
      if(order.paidAt)throw new StoreError("Paid orders cannot be removed. Ask an admin about a return.");
      for(const item of order.items){const restore=item.qty-deliveredQuantity(order,item.id);if(!restore)continue;const p=state.products.find(p=>p.id===item.id);if(!p)throw new StoreError("Stock cannot be restored. Ask an admin.");ingredients(item,restore,"Order removed",order.id,order.rawInventoryOnly);move(p,restore,"Order cancelled",reason,order.id);}
      order.cancelledAt=now;order.cancelReason=reason;order.revision=(order.revision||0)+1;
      if(action.type==="discardOrder"){order.discardedAt=now;event(order,"Discarded",action.actor,"Order discarded; unserved reservations released.");}
      else{order.deletedAt=now;event(order,"Deleted",action.actor,"Unpaid order deleted; unserved raw material reservations released.");}
    }else{
      if(order.cancelledAt||order.hiddenAt||order.deletedAt)throw new StoreError("This order was discarded or deleted.");
      if(action.type==="orderGiven"){if(order.givenAt)return current;order.delivered=Object.fromEntries(order.items.map(i=>[i.id,i.qty]));order.givenAt=now;order.revision=(order.revision||0)+1;event(order,"Served",action.actor,"All items marked served.");}
      else {
        if(order.paidAt){if(order.payment!==action.payment)throw new StoreError("Payment was already recorded with another method.");return current;}
        if(state.sales.some(s=>s.id===order.id))throw new StoreError("A sale already uses this order reference.");
        order.paidAt=now;order.payment=action.payment;order.revision=(order.revision||0)+1;event(order,"Paid",action.actor,action.payment==="UPI"?"Online payment recorded.":"Cash payment recorded.");
        state.sales.unshift({id:order.id,date:now,payment:action.payment,customer:order.customer,items:structuredClone(order.items),total:order.total,notes:order.notes,orderType:order.orderType,orderReference:order.orderReference||`Order #${order.number}`,business:order.business});
      }
      if(order.givenAt&&order.paidAt)order.completedAt=now;
    }
  } else if (action.type === "trackedBill") {
    const prior = state.bills.find((b) => b.id === action.id);
    if (prior) {
      if (prior.archived)
        throw new StoreError("Restore this bill before editing.");
      const same =
        Object.entries(action.bill).every(
          ([k, v]) => prior[k as keyof typeof prior] === v,
        ) && prior.billId === action.bill.billId;
      if (same) return current;
      if (prior.revision !== action.originalRevision)
        throw new StoreError("This bill changed. Refresh and reopen it.");
      Object.assign(prior, action.bill, {
        billId: action.bill.billId,
        revision: prior.revision + 1,
      });
    } else {
      if (action.originalRevision !== undefined)
        throw new StoreError("Bill no longer exists.");
      state.bills.unshift({
        ...action.bill,
        id: action.id,
        createdAt: now,
        revision: 0,
        archived: false,
      });
    }
  } else if (action.type === "archiveBill") {
    const prior = state.bills.find((b) => b.id === action.id);
    if (!prior) throw new StoreError("Bill not found.", 404);
    if (prior.archived === action.archived) return current;
    if (prior.revision !== action.originalRevision)
      throw new StoreError("This bill changed. Refresh before trying again.");
    prior.archived = action.archived;
    prior.revision++;
  } else if (action.type === "settings") {
    const settings = current.settings || defaultSettings();
    if (settings.revision !== action.originalRevision)
      throw new StoreError(
        "Settings changed on another device. Refresh and review before saving.",
      );
    const reportChanged=action.settings.dailyReportEnabled!==settings.dailyReportEnabled||action.settings.orderResetTime!==settings.orderResetTime||action.settings.reportSender!==settings.reportSender||JSON.stringify(action.settings.reportEmails)!==JSON.stringify(settings.reportEmails);
    state.settings = { ...action.settings, reportStartAt:action.settings.dailyReportEnabled?(reportChanged||!settings.reportStartAt?now:settings.reportStartAt):"", revision: settings.revision + 1 };
  } else if (action.type === "product") {
    const draft = action.product;
    const existing = state.products.find((p) => p.id === draft.id);
    if (draft.id && !existing)
      throw new StoreError("Product no longer exists.");
    if (
      existing &&
      (revision(existing) !== draft.originalRevision ||
        (!existing.recipeEnabled&&existing.stock !== draft.originalStock))
    ) {
      throw new StoreError(
        "This product changed. Refresh and reopen the editor before saving.",
      );
    }
    if (existing?.archived)
      throw new StoreError("Restore this product before editing it.");
    if (
      state.products.some(
        (p) =>
          p.id !== draft.id && p.sku.toLowerCase() === draft.sku.toLowerCase(),
      )
    ) {
      throw new StoreError(
        "This SKU already exists, including in archived products.",
      );
    }
    const delta = existing?.recipeEnabled?0:draft.stock - (existing?.stock || 0);
    if (existing && delta && draft.note.length < 3)
      throw new StoreError("Add a reason for the stock adjustment.", 400);
    const product: Product = {
      id: existing?.id || crypto.randomUUID(),
      name: draft.name,
      sku: draft.sku,
      category: draft.category,
      price: draft.price,
      cost: draft.cost,
      stock: existing?.recipeEnabled?existing.stock:draft.stock,
      recipe:existing?.recipe,
      recipeEnabled:existing?.recipeEnabled,
      low: draft.low,
      revision: existing ? revision(existing) + 1 : 0,
      archived: false,
      billIds: Array.from(
        new Set([
          ...(existing?.billIds || []),
          ...(draft.billId ? [draft.billId] : []),
        ]),
      ),
    };
    if (existing)
      state.products = state.products.map((p) =>
        p.id === product.id ? product : p,
      );
    else state.products.push(product);
    move(
      product,
      delta,
      existing ? "Adjustment" : "Opening stock",
      draft.note || "Initial product stock",
      undefined,
      draft.billId,
    );
  } else if (action.type === "restock") {
    const prior = state.restocks.find((r) => r.id === action.id);
    if (prior) {
      const same =
        (prior.tax || 0) === (action.tax || 0) &&
        (prior.fees || 0) === (action.fees || 0) &&
        (action.invoiceTotal === undefined ||
          prior.invoiceTotal === action.invoiceTotal) &&
        prior.source === action.source &&
        prior.supplier === action.supplier &&
        prior.invoiceNumber === action.invoiceNumber &&
        prior.invoiceDate === action.invoiceDate &&
        prior.note === action.note &&
        prior.billId === action.billId &&
        prior.items.length === action.items.length &&
        action.items.every((i) =>
          prior.items.some(
            (p) =>
              p.productId === i.productId &&
              p.qty === i.qty &&
              p.unitCost === i.unitCost,
          ),
        );
      if (!same)
        throw new StoreError(
          "This restock reference belongs to another delivery. Refresh and review the recorded restock.",
        );
      return current;
    }
    if (action.source === "Hyperpure" && !action.billId)
      throw new StoreError(
        "Attach the Hyperpure bill before recording this delivery.",
        400,
      );
    if (action.billId && (state.restocks.some((r) => r.billId === action.billId)||state.ingredientReceipts.some(r=>r.billId===action.billId)))
      throw new StoreError(
        "This bill is already linked to a recorded restock.",
      );
    if (
      action.invoiceNumber &&
      (state.ingredientReceipts.some(r=>r.supplier.toLowerCase()===action.supplier.toLowerCase()&&r.invoice.toLowerCase()===action.invoiceNumber.toLowerCase())||state.restocks.some(
        (r) =>
          r.supplier.toLowerCase() === action.supplier.toLowerCase() &&
          r.invoiceNumber.toLowerCase() === action.invoiceNumber.toLowerCase(),
      ))
    )
      throw new StoreError("This supplier invoice has already been recorded.");
    const restock = {
      id: action.id,
      date: now,
      source: action.source,
      tax: action.tax || 0,
      fees: action.fees || 0,
      invoiceTotal: action.invoiceTotal,
      supplier: action.supplier,
      invoiceNumber: action.invoiceNumber,
      invoiceDate: action.invoiceDate,
      note: action.note,
      billId: action.billId,
      items: [] as {
        productId: string;
        productName: string;
        qty: number;
        unitCost: number;
      }[],
      total: 0,
    };
    const seen = new Set<string>();
    for (const item of action.items) {
      if (seen.has(item.productId))
        throw new StoreError(
          "Combine duplicate products into one delivery line.",
          400,
        );
      seen.add(item.productId);
      const p = state.products.find((p) => p.id === item.productId);
      if (!p || p.archived)
        throw new StoreError(
          "A delivery product is unavailable. Refresh and review the draft.",
        );
      if (p.stock + item.qty > 9_999_999)
        throw new StoreError(
          "The restock quantity exceeds the supported stock limit.",
        );
      if(p.recipeEnabled)throw new StoreError("Receive this menu item’s ingredients in Ingredients & recipes instead.");
      p.stock += item.qty;
      p.cost = item.unitCost;
      p.revision = revision(p) + 1;
      if (action.billId)
        p.billIds = Array.from(new Set([...(p.billIds || []), action.billId]));
      restock.items.push({ ...item, productName: p.name });
      restock.total += item.qty * item.unitCost;
      move(
        p,
        item.qty,
        "Restock",
        action.note || `Delivery from ${action.supplier}`,
        restock.id,
        action.billId,
      );
    }
    if (!Number.isSafeInteger(restock.total))
      throw new StoreError("The delivery total is too large.", 400);
    restock.invoiceTotal ??= restock.total + restock.tax + restock.fees;
    if (!Number.isSafeInteger(restock.invoiceTotal))
      throw new StoreError("Invoice total too large.", 400);
    state.restocks.unshift(restock);
  } else if (action.type === "archive") {
    const p = state.products.find((p) => p.id === action.productId);
    if (!p) throw new StoreError("Product no longer exists.");
    if (revision(p) !== action.originalRevision)
      throw new StoreError(
        "This product changed. Refresh before trying again.",
      );
    p.archived = action.archived;
    p.revision = revision(p) + 1;
  } else if (action.type === "sale") {
    if(state.orders?.some(o=>o.id===action.id))throw new StoreError("This reference belongs to a kitchen order. Record its payment from the queue.");
    const prior = state.sales.find((s) => s.id === action.id);
    if (prior) {
      const same =
        prior.payment === action.payment &&
        prior.customer === (action.customer || "Walk-in customer") &&
        (prior.orderType || "Takeaway") === (action.orderType || "Takeaway") &&
        (prior.orderReference || "") === (action.orderReference || "") &&
        (prior.notes || "") === (action.notes || "") &&
        prior.items.length === action.items.length &&
        action.items.every((i) =>
          prior.items.some(
            (p) =>
              p.id === i.id && p.qty === i.qty && p.price === i.expectedPrice,
          ),
        );
      if (!same)
        throw new StoreError(
          "This checkout reference belongs to another order. Refresh and review the recorded sale.",
        );
      return current;
    }
    const seen = new Set<string>();
    const sale: Sale = {
      id: action.id,
      date: now,
      customer: action.customer || "Walk-in customer",
      orderType: action.orderType || "Takeaway",
      orderReference: action.orderReference || "",
      notes: action.notes || "",
      business: (() => {
        const b = current.settings || defaultSettings();
        return {
          name: b.businessName,
          phone: b.phone,
          address: b.address,
          footer: b.receiptFooter,
        };
      })(),
      payment: action.payment,
      total: 0,
      items: [],
    };
    for (const item of action.items) {
      if (seen.has(item.id))
        throw new StoreError("A product appears twice in the order.", 400);
      seen.add(item.id);
      const p = state.products.find((p) => p.id === item.id);
      if (!p || p.archived)
        throw new StoreError(
          "An item is no longer available. Refresh and review your cart.",
        );
      if (p.price !== item.expectedPrice)
        throw new StoreError(
          `The price of ${p.name} changed. Refresh and review the total.`,
        );
      if (availableUnits(state,p) < item.qty)
        throw new StoreError(
          `Only ${p.stock} units of ${p.name} remain. Refresh and adjust the cart.`,
        );
      ingredients({id:p.id,name:p.name,qty:item.qty,price:p.price,cost:itemCost(state,p),ingredientUsage:recipeUsage(state,p)},-item.qty,"Sale",sale.id);
      sale.items.push({
        id: p.id,
        name: p.name,
        qty: item.qty,
        price: p.price,
        cost: itemCost(state,p),
        ingredientUsage:recipeUsage(state,p),
      });
      sale.total += p.price * item.qty;
      move(p, -item.qty, "Sale", `Sale #${sale.id.slice(0, 8)}`, sale.id);
    }
    if (!Number.isSafeInteger(sale.total))
      throw new StoreError("The sale total is too large.", 400);
    state.sales.unshift(sale);
  } else if (action.type === "return") {
    const sale = state.sales.find((s) => s.id === action.saleId);
    if (!sale) throw new StoreError("Sale not found.", 404);
    if (sale.returnedAt) return current;
    for (const item of sale.items) {
      const p = state.products.find((p) => p.id === item.id);
      if (!p)
        throw new StoreError(
          "A product is missing; the return cannot be recorded.",
        );
      if (!item.ingredientUsage&&p.stock + item.qty > 9_999_999)
        throw new StoreError(
          "The returned stock would exceed the supported quantity.",
        );
      ingredients(item,item.qty,"Return",sale.id,true);
      move(p, item.qty, "Return", action.reason, sale.id);
    }
    sale.returnedAt = now;
    sale.returnReason = action.reason;
    const order=state.orders?.find(o=>o.id===sale.id);if(order){order.cancelledAt=now;order.cancelReason="Sale returned: "+action.reason;}
  }
  return state;
}
