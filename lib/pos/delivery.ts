import {businessDay} from './business-day';
import type {KitchenOrder} from './types';
export function deliveredQuantity(order:KitchenOrder,productId:string){
 const item=order.items.find(i=>i.id===productId);
 if(!item)return 0;
 return Math.max(0,Math.min(item.qty,order.delivered?.[productId]??(order.givenAt?item.qty:0)));
}
export function deliveryProgress(order:KitchenOrder){return {given:order.items.reduce((n,i)=>n+deliveredQuantity(order,i.id),0),total:order.items.reduce((n,i)=>n+i.qty,0)}}
export function orderSummary(order:KitchenOrder){
 const names=order.items.slice(0,3).map(i=>`${i.qty}× ${i.name.replace(/Kathi Roll/gi,'Roll').replace(/Water Bottle/gi,'Water')}`);
 return names.join(' · ')+(order.items.length>3?` · +${order.items.length-3} more`:'');
}

export function inActiveQueue(order:KitchenOrder){return !order.hiddenAt&&!order.paidAt&&!order.cancelledAt&&!order.completedAt;}

export function orderStatus(order:KitchenOrder):'Active'|'Served'|'Paid'|'Completed'|'Discarded'|'Deleted'{
 if(order.hiddenAt||order.deletedAt||order.events?.some(e=>e.action==='Deleted'))return 'Deleted';
 if(order.discardedAt||order.cancelledAt)return 'Discarded';
 if(order.completedAt)return 'Completed';if(order.paidAt)return 'Paid';if(order.givenAt)return 'Served';return 'Active';
}
export function nextOrderNumber(orders:KitchenOrder[],at:string,resetTime='00:00'){
 const currentDay=businessDay(at,resetTime);let last=0;for(const o of orders){if((o.businessDay||businessDay(o.date,resetTime))===currentDay&&/^\d+$/.test(o.number))last=Math.max(last,Number(o.number))}return String(last+1).padStart(3,'0');
}
