"use client";
import {Check,Plus,Minus} from 'lucide-react';
import type {KitchenOrder} from '@/lib/pos/types';
import type {StoreAction} from '@/lib/pos/validation';
import {deliveredQuantity} from '@/lib/pos/delivery';
export function DeliveryControls({order,productId,locked,onAction}:{order:KitchenOrder;productId:string;locked:boolean;onAction:(a:StoreAction)=>Promise<boolean>}){
 const item=order.items.find(i=>i.id===productId)!;
 const served=deliveredQuantity(order,productId),readonly=!!order.completedAt||!!order.cancelledAt;
 function set(qty:number){void onAction({type:'orderDelivery',id:order.id,productId,deliveredQty:qty,expectedDelivered:served})}
 return <div className="item-delivery" role="group" aria-label={`${item.name} delivery`}><span className={served===item.qty?'delivery-complete':''}>{served} / {item.qty} served</span>{!readonly&&(item.qty===1?<button type="button" role="checkbox" aria-checked={served===1} aria-label={`${item.name} delivered`} className={'single-delivery-check '+(served?'unit-given':'')} disabled={locked} onClick={()=>set(served?0:1)}>{served?<Check size={16}/>:<span/>}</button>:<div className="delivery-counter"><button disabled={locked||served===0} aria-label={`Undo one ${item.name} delivery`} onClick={()=>set(served-1)}><Minus size={16}/></button><strong aria-live="polite">{served}<small> / {item.qty}</small></strong><button disabled={locked||served===item.qty} aria-label={`Serve one ${item.name}`} onClick={()=>set(served+1)}><Plus size={16}/></button><button className="give-all-line" disabled={locked||served===item.qty} onClick={()=>set(item.qty)} aria-label={`Serve all ${item.qty} ${item.name}`}>All {item.qty}</button></div>)}{!readonly&&item.qty>1&&<small>Use + for each item handed over. Undo with −.</small>}</div>;
}
